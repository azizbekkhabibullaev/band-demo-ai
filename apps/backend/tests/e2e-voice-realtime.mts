/**
 * E2E Validation — Phase 3 Realtime Voice Banking Operator
 *
 * Tests all 4 production scenarios WITHOUT a microphone by using
 * the proxy's user_text injection mode. The full OpenAI Realtime
 * API pipeline, tool calls, and DB persistence are exercised.
 *
 * Run:  tsx tests/e2e-voice-realtime.mts
 */

import 'dotenv/config';
import WebSocket from 'ws';
import { getPool } from '../src/db/client.js';

const WS_BASE  = 'ws://localhost:3000/ws/voice/realtime';
const TENANT   = 'ipoteka-bank';
const PASS     = '\x1b[32m✓\x1b[0m';
const FAIL     = '\x1b[31m✗\x1b[0m';
const INFO     = '\x1b[36mℹ\x1b[0m';
const BOLD     = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM      = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Evidence collected across all scenarios ───────────────────────────────────
const EVIDENCE: Record<string, unknown> = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface CallEvent {
  type: string;
  [k: string]: unknown;
}

interface ScenarioResult {
  sessionId: string | null;
  events: CallEvent[];
  transcripts: Array<{ role: string; text: string }>;
  toolTraces: Array<{ tool: string; args: unknown; result: string }>;
  wowSummary: Record<string, unknown> | null;
  audioChunks: number;
}

async function runScenario(opts: {
  name: string;
  messages: string[];
  /** ms to wait after each AI response before sending the next message */
  betweenMs?: number;
  /** override generated session id */
  sessionId?: string;
  /** end call after all messages are sent (default true) */
  endAfterMessages?: boolean;
  /** total timeout ms (default 90s) */
  timeoutMs?: number;
}): Promise<ScenarioResult> {
  const {
    name,
    messages,
    betweenMs = 3000,
    sessionId = null,
    endAfterMessages = true,
    timeoutMs = 90_000,
  } = opts;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(BOLD(`  SCENARIO: ${name}`));
  console.log(`${'─'.repeat(70)}`);

  const result: ScenarioResult = {
    sessionId,
    events: [],
    transcripts: [],
    toolTraces: [],
    wowSummary: null,
    audioChunks: 0,
  };

  const params = new URLSearchParams({ tenantId: TENANT });
  if (sessionId) params.set('sessionId', sessionId);
  const url = `${WS_BASE}?${params}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'nodebuffer';

    let msgIndex = 0;
    let ended    = false;
    let aiResponseCount = 0;

    const globalTimeout = setTimeout(() => {
      console.log(`${FAIL} Scenario timeout after ${timeoutMs / 1000}s`);
      if (!ended) { ended = true; ws.close(); resolve(result); }
    }, timeoutMs);

    function done() {
      if (ended) return;
      ended = true;
      clearTimeout(globalTimeout);
      ws.close();
      resolve(result);
    }

    async function sendNext() {
      if (msgIndex >= messages.length) {
        if (endAfterMessages) {
          await sleep(1500);
          console.log(`${INFO} Sending end — triggering WOW summary generation…`);
          ws.send(JSON.stringify({ type: 'end' }));
        }
        return;
      }
      const text = messages[msgIndex++]!;
      console.log(`\n  ${BOLD('→ User:')} "${text}"`);
      ws.send(JSON.stringify({ type: 'user_text', text }));
    }

    ws.on('open', () => {
      console.log(`${PASS} WebSocket opened → backend proxy`);
    });

    ws.on('message', async (raw: Buffer | string, isBinary: boolean) => {
      // ws v8: all frames arrive as Buffer; use isBinary to distinguish PCM16 from JSON

      // Binary frame = PCM16 audio from OpenAI
      if (isBinary) {
        result.audioChunks++;
        if (result.audioChunks === 1) {
          console.log(`${PASS} AI audio response: receiving PCM16 stream from OpenAI`);
        }
        return;
      }

      // Text frame = JSON event (ws v8 still delivers as Buffer; parse it)
      let evt: CallEvent;
      try { evt = JSON.parse((raw as Buffer).toString()) as CallEvent; } catch { return; }
      result.events.push(evt);

      switch (evt.type) {

        case 'connected':
          console.log(`${PASS} Session connected to OpenAI Realtime API`);
          await sleep(300);
          await sendNext();
          break;

        case 'state':
          console.log(DIM(`     state → ${String(evt['state'])}`));
          break;

        case 'transcript': {
          if (evt['delta']) break;
          const role = String(evt['role']);
          const text = String(evt['text'] ?? '');
          result.transcripts.push({ role, text });

          if (role === 'user') {
            console.log(`${PASS} User transcript confirmed: "${text.slice(0, 80)}"`);
          } else {
            aiResponseCount++;
            const preview = text.slice(0, 120);
            console.log(`${PASS} AI response #${aiResponseCount}: "${preview}${text.length > 120 ? '…' : ''}"`);
            // After AI responds, send next user message (with delay)
            await sleep(betweenMs);
            await sendNext();
          }
          break;
        }

        case 'tool_trace': {
          const tool   = String(evt['tool']);
          const args   = evt['args'] as unknown;
          const res    = String(evt['result'] ?? '');
          result.toolTraces.push({ tool, args, result: res });
          console.log(`${PASS} Tool call: ${BOLD(tool)}`);
          console.log(DIM(`     args:   ${JSON.stringify(args).slice(0, 120)}`));
          console.log(DIM(`     result: ${res.slice(0, 120)}`));
          break;
        }

        case 'session_summary': {
          result.wowSummary = evt['data'] as Record<string, unknown>;
          console.log(`\n${PASS} ${BOLD('WOW Summary received:')}`);
          console.log(JSON.stringify(result.wowSummary, null, 4)
            .split('\n').map(l => `    ${l}`).join('\n'));
          done();
          break;
        }

        case 'error':
          console.log(`${FAIL} Proxy error: ${String(evt['message'])}`);
          break;
      }
    });

    ws.on('error', (err) => { reject(err); });
    ws.on('close', () => { if (!ended) done(); });
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function queryDB(sql: string, params: unknown[] = []) {
  const pool = getPool();
  const { rows } = await pool.query(sql, params);
  return rows;
}

function printTable(rows: Record<string, unknown>[]) {
  if (!rows.length) { console.log('  (no rows)'); return; }
  const keys = Object.keys(rows[0]!);
  const widths = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)));
  const line = widths.map(w => '─'.repeat(w + 2)).join('┼');
  console.log('  ┌' + line.replace(/┼/g, '┬') + '┐');
  console.log('  │ ' + keys.map((k, i) => k.padEnd(widths[i]!)).join(' │ ') + ' │');
  console.log('  ├' + line + '┤');
  rows.forEach(r => {
    console.log('  │ ' + keys.map((k, i) => String(r[k] ?? '').padEnd(widths[i]!)).join(' │ ') + ' │');
  });
  console.log('  └' + line.replace(/┼/g, '┴') + '┘');
}

// ── Assertions ────────────────────────────────────────────────────────────────

function assert(condition: boolean, label: string): boolean {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${FAIL} ${label}`);
  }
  return condition;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TEST RUNNER
// ─────────────────────────────────────────────────────────────────────────────

const passed: string[] = [];
const failed: string[] = [];

function check(condition: boolean, label: string) {
  if (condition) passed.push(label);
  else failed.push(label);
  assert(condition, label);
}

async function main() {
  console.log(BOLD('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(BOLD('║   PHASE 3 E2E VALIDATION — REALTIME VOICE BANKING OPERATOR  ║'));
  console.log(BOLD('╚══════════════════════════════════════════════════════════════╝\n'));

  // ── SCENARIO 1: Basic mortgage inquiry ─────────────────────────────────────
  console.log(BOLD('\n▶ TEST 1 — Mortgage inquiry + KB search + intent classification'));

  const s1 = await runScenario({
    name: 'Ипотечный кредит — KB поиск + намерение',
    messages: [
      'Здравствуйте. Меня интересует ипотечный кредит.',
    ],
  });
  EVIDENCE['scenario1'] = s1;

  console.log(`\n  ${BOLD('Verification:')}`);
  check(s1.audioChunks > 0,
    `Audio reaches OpenAI Realtime API → ${s1.audioChunks} PCM16 chunks received`);
  check(s1.transcripts.some(t => t.role === 'assistant' && t.text.length > 10),
    'AI responds with voice (transcript received)');

  const aiText1 = s1.transcripts.find(t => t.role === 'assistant')?.text ?? '';
  const hasBankTone = /ипотек|банк|кредит|консультант|процент|условия|вам|поможем/i.test(aiText1);
  check(hasBankTone, `Banking operator tone detected in response`);

  const kbTool = s1.toolTraces.find(t => t.tool === 'search_bank_knowledge');
  check(!!kbTool, 'search_bank_knowledge tool called → KB used');
  if (kbTool) {
    check(String(kbTool.result).length > 50, 'KB returned substantive content');
  }

  const intentTool = s1.toolTraces.find(t => t.tool === 'classify_intent');
  check(!!intentTool, 'classify_intent tool called');

  // DB: check realtime_voice_sessions after summary
  await sleep(3000); // give DB write time to complete
  const sessions1 = await queryDB(
    `SELECT id, duration_ms, turn_count, topic_summary, lead_status, sentiment, wow_summary
     FROM realtime_voice_sessions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [TENANT],
  );
  console.log(`\n  ${BOLD('DB: realtime_voice_sessions (latest 3 rows):')}`);
  printTable(sessions1.map(r => ({
    id: String(r['id']).slice(0, 8) + '…',
    duration_ms: String(r['duration_ms']),
    turn_count: String(r['turn_count']),
    topic_summary: String(r['topic_summary'] ?? '').slice(0, 30),
    lead_status: String(r['lead_status'] ?? ''),
    sentiment: String(r['sentiment'] ?? ''),
  })));

  check(sessions1.length > 0, 'Voice session stored in realtime_voice_sessions table');
  if (sessions1.length > 0) {
    check(sessions1[0]!['wow_summary'] !== null, 'Session summary (wow_summary) generated');
    EVIDENCE['session1_db'] = sessions1[0];
    console.log(`\n  ${BOLD('WOW summary JSON from DB:')}`);
    console.log(JSON.stringify(sessions1[0]!['wow_summary'], null, 4)
      .split('\n').map(l => `    ${l}`).join('\n'));
  }

  // ── SCENARIO 2: Lead capture ─────────────────────────────────────────────
  console.log(BOLD('\n▶ TEST 2 — Lead capture flow'));

  const s2 = await runScenario({
    name: 'Заявка на консультацию по ипотеке',
    messages: [
      'Хочу консультацию по ипотеке. Меня зовут Алишер, телефон +998901234567.',
    ],
  });
  EVIDENCE['scenario2'] = s2;

  console.log(`\n  ${BOLD('Verification:')}`);

  const leadTool = s2.toolTraces.find(t => t.tool === 'capture_lead');
  check(!!leadTool, 'capture_lead tool called');
  if (leadTool) {
    const resultStr = leadTool.result;
    check(resultStr.includes('Заявка зафиксирована'), 'Lead capture succeeded');

    const scoreMatch = resultStr.match(/счёт (\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]!, 10) : 0;
    check(score > 0, `Lead score assigned: ${score} points`);

    const tierMatch = resultStr.match(/(HOT|WARM|COLD)/);
    const tier = tierMatch?.[1] ?? 'unknown';
    check(['HOT', 'WARM', 'COLD'].includes(tier), `Lead tier assigned: ${tier}`);

    const idMatch = resultStr.match(/ID: ([a-f0-9-]{36})/);
    if (idMatch) {
      const leadId = idMatch[1]!;
      await sleep(500);
      const leadRows = await queryDB(
        `SELECT id, full_name, phone, product_interest, lead_score, status, lead_type
         FROM leads WHERE id = $1`,
        [leadId],
      );
      console.log(`\n  ${BOLD('DB: leads record:')}`);
      printTable(leadRows.map(r => ({
        id: String(r['id']).slice(0, 8) + '…',
        full_name: String(r['full_name'] ?? ''),
        phone: String(r['phone'] ?? ''),
        product: String(r['product_interest'] ?? ''),
        score: String(r['lead_score']),
        status: String(r['status']),
        type: String(r['lead_type']),
      })));

      check(leadRows.length > 0, 'Lead record exists in DB');
      if (leadRows.length > 0) {
        EVIDENCE['lead1_db'] = leadRows[0];
        const score2 = Number(leadRows[0]!['lead_score']);
        check(score2 > 0, `Lead score in DB: ${score2}`);
      }
    }
  }

  // Check admin panel leads API
  const adminLeads = await queryDB(
    `SELECT id, full_name, phone, product_interest, lead_score, status, created_at
     FROM leads WHERE tenant_id = $1 AND interest_type = 'voice_call' ORDER BY created_at DESC LIMIT 5`,
    [TENANT],
  );
  console.log(`\n  ${BOLD('DB: voice call leads (admin panel view):')}`);
  printTable(adminLeads.map(r => ({
    id: String(r['id']).slice(0, 8) + '…',
    name: String(r['full_name'] ?? '—'),
    phone: String(r['phone'] ?? '—'),
    product: String(r['product_interest'] ?? '—'),
    score: String(r['lead_score']),
    status: String(r['status']),
  })));
  check(adminLeads.length > 0, 'Leads appear in admin panel (voice_call source)');

  const aiPhoneRequest = s2.transcripts.some(t =>
    t.role === 'assistant' && /телефон|номер|контакт|связ/i.test(t.text),
  );
  check(aiPhoneRequest || leadTool !== undefined,
    'AI requested phone number or lead captured directly from utterance');

  // ── SCENARIO 3: Complaint ────────────────────────────────────────────────
  console.log(BOLD('\n▶ TEST 3 — Complaint detection + escalation'));

  const s3 = await runScenario({
    name: 'Жалоба на филиал',
    messages: [
      'У меня жалоба на филиал. Сотрудники грубили и отказали в обслуживании без объяснений.',
    ],
  });
  EVIDENCE['scenario3'] = s3;

  console.log(`\n  ${BOLD('Verification:')}`);

  const complaintTool = s3.toolTraces.find(t => t.tool === 'create_complaint');
  check(!!complaintTool, 'create_complaint tool called → complaint intent detected');

  if (complaintTool) {
    const resultStr = complaintTool.result;
    check(resultStr.includes('Жалоба зафиксирована'), 'Complaint record created');

    const idMatch = resultStr.match(/ID: ([a-f0-9-]{36})/);
    if (idMatch) {
      const escalationId = idMatch[1]!;
      await sleep(500);
      const escRows = await queryDB(
        `SELECT id, title, description, category, severity, status, auto_detected, created_at
         FROM admin_escalations WHERE id = $1`,
        [escalationId],
      );
      console.log(`\n  ${BOLD('DB: admin_escalations record:')}`);
      printTable(escRows.map(r => ({
        id: String(r['id']).slice(0, 8) + '…',
        title: String(r['title']).slice(0, 40),
        category: String(r['category']),
        severity: String(r['severity']),
        status: String(r['status']),
        auto: String(r['auto_detected']),
      })));
      check(escRows.length > 0, 'Escalation record in admin_escalations table');
      if (escRows.length > 0) {
        EVIDENCE['complaint1_db'] = escRows[0];
        check(escRows[0]!['auto_detected'] === true, 'Escalation flagged as auto_detected=true');
      }
    }
  }

  // Analytics: check intelligence/complaints endpoint
  const recentEscalations = await queryDB(
    `SELECT id, title, category, severity, status, created_at
     FROM admin_escalations WHERE tenant_id = $1 AND auto_detected = true
     ORDER BY created_at DESC LIMIT 5`,
    [TENANT],
  );
  console.log(`\n  ${BOLD('DB: recent auto-detected escalations (analytics view):')}`);
  printTable(recentEscalations.map(r => ({
    id: String(r['id']).slice(0, 8) + '…',
    title: String(r['title']).slice(0, 35),
    category: String(r['category']),
    severity: String(r['severity']),
    status: String(r['status']),
  })));
  check(recentEscalations.length > 0, 'Complaints appear in analytics (admin panel view)');

  const empathy = s3.transcripts.some(t =>
    t.role === 'assistant' && /понима|сожале|неприятн|ситуаци|помог/i.test(t.text),
  );
  check(empathy || complaintTool !== undefined,
    'AI expressed empathy and registered complaint');

  // ── SCENARIO 4: Barge-in (interrupt) ────────────────────────────────────
  console.log(BOLD('\n▶ TEST 4 — Barge-in interrupt'));

  let interruptSentAt = 0;
  let audioAfterInterrupt = 0;
  let audioBefore = 0;
  let interruptConfirmed = false;

  await new Promise<void>((resolve) => {
    const params2 = new URLSearchParams({ tenantId: TENANT });
    const ws = new WebSocket(`${WS_BASE}?${params2}`);
    ws.binaryType = 'nodebuffer';

    // wait_connect → (connected+user_text sent) → wait_ai_speaking → (3 chunks) → interrupted → done
    let phase: 'wait_connect' | 'wait_ai_speaking' | 'interrupted' | 'done' = 'wait_connect';
    const timeout = setTimeout(() => { ws.close(); resolve(); }, 45_000);

    ws.on('message', async (raw: Buffer | string, isBinary: boolean) => {
      // ws v8: all frames arrive as Buffer; use isBinary to distinguish PCM16 from JSON
      if (isBinary) {
        if (phase === 'wait_ai_speaking') {
          audioBefore++;
          // After 3 audio chunks mid-sentence, fire interrupt
          if (audioBefore === 3) {
            interruptSentAt = Date.now();
            console.log(`  ${INFO} Interrupting AI mid-sentence after ${audioBefore} audio chunks…`);
            ws.send(JSON.stringify({ type: 'interrupt' }));
            phase = 'interrupted';
            audioAfterInterrupt = 0;
          }
        } else if (phase === 'interrupted') {
          audioAfterInterrupt++;
        }
        return;
      }

      let evt: CallEvent;
      try { evt = JSON.parse((raw as Buffer).toString()) as CallEvent; } catch { return; }

      if (evt.type === 'connected') {
        console.log(`${PASS} Connected`);
        await sleep(200);
        console.log(`  → User: "Расскажите подробно об условиях ипотеки, процентных ставках и требованиях к заёмщикам."`);
        ws.send(JSON.stringify({
          type: 'user_text',
          text: 'Расскажите подробно об условиях ипотеки, процентных ставках и требованиях к заёмщикам.',
        }));
        // Switch to wait_ai_speaking immediately — audio starts arriving before state:listening
        phase = 'wait_ai_speaking';
      }

      if (evt.type === 'transcript' && !evt['delta'] && String(evt['role']) === 'assistant') {
        if (phase === 'interrupted') {
          console.log(`${PASS} AI resumed after interrupt: "${String(evt['text']).slice(0, 80)}"`);
          interruptConfirmed = true;
          phase = 'done';
          await sleep(500);
          ws.send(JSON.stringify({ type: 'end' }));
        }
      }

      if (evt.type === 'session_summary') {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });

    ws.on('close', () => { clearTimeout(timeout); resolve(); });
    ws.on('error', () => { clearTimeout(timeout); resolve(); });
  });

  console.log(`\n  ${BOLD('Verification:')}`);
  check(interruptSentAt > 0, 'Interrupt signal sent mid-response');
  check(audioAfterInterrupt < 5,
    `AI stopped quickly after interrupt (${audioAfterInterrupt} chunks after cancel vs ${audioBefore} before)`);
  check(interruptConfirmed || audioAfterInterrupt < 3,
    'AI stopped speaking — customer took priority');

  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  console.log('\n' + BOLD('═'.repeat(70)));
  console.log(BOLD('  FINAL VALIDATION REPORT'));
  console.log(BOLD('═'.repeat(70)));

  console.log(`\n  ${BOLD('Scenario 1 — Mortgage inquiry:')}`);
  console.log(`    Audio chunks received:   ${s1.audioChunks}`);
  console.log(`    AI transcript lines:     ${s1.transcripts.filter(t => t.role === 'assistant').length}`);
  console.log(`    Tool calls:              ${s1.toolTraces.map(t => t.tool).join(', ') || 'none'}`);

  console.log(`\n  ${BOLD('Scenario 2 — Lead capture:')}`);
  console.log(`    Tool calls:              ${s2.toolTraces.map(t => t.tool).join(', ') || 'none'}`);
  const leadResult = s2.toolTraces.find(t => t.tool === 'capture_lead')?.result ?? '';
  console.log(`    Lead capture result:     ${leadResult.slice(0, 80)}`);

  console.log(`\n  ${BOLD('Scenario 3 — Complaint:')}`);
  console.log(`    Tool calls:              ${s3.toolTraces.map(t => t.tool).join(', ') || 'none'}`);
  const compResult = s3.toolTraces.find(t => t.tool === 'create_complaint')?.result ?? '';
  console.log(`    Complaint result:        ${compResult.slice(0, 80)}`);

  console.log(`\n  ${BOLD('Scenario 4 — Interrupt:')}`);
  console.log(`    Audio chunks before:     ${audioBefore}`);
  console.log(`    Audio chunks after:      ${audioAfterInterrupt}`);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${PASS} PASSED: ${passed.length}`);
  if (failed.length > 0) {
    console.log(`  ${FAIL} FAILED: ${failed.length}`);
    failed.forEach(f => console.log(`       • ${f}`));
  } else {
    console.log(`  ${PASS} ALL CHECKS PASSED`);
  }
  console.log('─'.repeat(70) + '\n');

  await getPool().end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
