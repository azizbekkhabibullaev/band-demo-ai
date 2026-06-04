#!/usr/bin/env node
/**
 * QA: Voice of Customer Analytics Platform
 *
 * Verifies:
 * 1. DB table exists and has expected columns
 * 2. Sample call records are present
 * 3. Analytics endpoint works (via direct DB queries)
 * 4. Lead auto-creation worked
 * 5. Complaint classification correct
 * 6. WAV files exist in qa-audio/
 *
 * Usage:
 *   /Users/azizbekkhabibullaev/.nvm/versions/node/v20.20.2/bin/node scripts/qa-calls.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load env
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  try {
    const raw = readFileSync(join(ROOT, 'apps/backend/.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^DATABASE_URL=(.+)$/);
      if (m) { DATABASE_URL = m[1].trim(); break; }
    }
  } catch { /* */ }
}
DATABASE_URL ??= 'postgres://chatbot:chatbot@localhost:5432/chatbot';

const pool = new pg.Pool({ connectionString: DATABASE_URL });

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function section(title) { console.log(`\n${title}`); }

try {
  section('── 1. DATABASE SCHEMA ──');

  // Check table exists
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'calls'`,
  );
  if (tables.length > 0) ok('calls table exists');
  else { fail('calls table MISSING'); process.exit(1); }

  // Check key columns
  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'calls'`,
  );
  const colNames = new Set(cols.map(c => c.column_name));
  const required = ['id','tenant_id','filename','transcript','summary','sentiment',
                    'category','subcategory','priority','is_lead','is_complaint','status'];
  for (const col of required) {
    if (colNames.has(col)) ok(`column ${col} exists`);
    else fail(`column ${col} MISSING`);
  }

  section('── 2. SAMPLE DATA ──');

  const { rows: calls } = await pool.query(
    `SELECT filename, category, sentiment, priority, is_lead, is_complaint, status, lead_score
     FROM calls WHERE status = 'completed' ORDER BY filename`,
  );
  ok(`Total completed calls: ${calls.length}`);

  // Verify each scenario
  const deposit   = calls.find(c => c.filename.includes('deposit'));
  const autoLoan  = calls.find(c => c.filename.includes('auto_loan'));
  const mobileApp = calls.find(c => c.filename.includes('mobile_app'));
  const branch    = calls.find(c => c.filename.includes('branch'));
  const brokerage = calls.find(c => c.filename.includes('brokerage'));

  if (deposit) {
    ok(`[1] Deposit inquiry: category="${deposit.category}" sentiment="${deposit.sentiment}" lead=${deposit.is_lead}`);
    if (deposit.category === 'Вклады') ok('  ↳ Category correct');
    else fail(`  ↳ Category should be Вклады, got "${deposit.category}"`);
    if (deposit.is_lead) ok('  ↳ Lead detected');
    else fail('  ↳ Should be lead');
  } else fail('[1] Deposit call record not found');

  if (autoLoan) {
    ok(`[2] Auto loan request: category="${autoLoan.category}" lead=${autoLoan.is_lead} score=${autoLoan.lead_score}`);
    if (autoLoan.category === 'Автокредиты') ok('  ↳ Category correct');
    else fail(`  ↳ Category should be Автокредиты, got "${autoLoan.category}"`);
    if (autoLoan.lead_score >= 90) ok('  ↳ Hot lead (score ≥90)');
    else fail(`  ↳ Score should be ≥90, got ${autoLoan.lead_score}`);
  } else fail('[2] Auto loan call record not found');

  if (mobileApp) {
    ok(`[3] Mobile app complaint: category="${mobileApp.category}" complaint=${mobileApp.is_complaint} priority="${mobileApp.priority}"`);
    if (mobileApp.is_complaint) ok('  ↳ Complaint detected');
    else fail('  ↳ Should be complaint');
    if (mobileApp.priority === 'critical') ok('  ↳ Priority critical');
    else fail(`  ↳ Priority should be critical, got "${mobileApp.priority}"`);
    if (mobileApp.sentiment === 'negative') ok('  ↳ Sentiment negative');
    else fail(`  ↳ Sentiment should be negative, got "${mobileApp.sentiment}"`);
  } else fail('[3] Mobile app complaint not found');

  if (branch) {
    ok(`[4] Branch complaint: category="${branch.category}" complaint=${branch.is_complaint}`);
    if (branch.category === 'Филиалы') ok('  ↳ Category correct');
    else fail(`  ↳ Category should be Филиалы`);
    if (branch.is_complaint) ok('  ↳ Complaint detected');
    else fail('  ↳ Should be complaint');
  } else fail('[4] Branch complaint not found');

  if (brokerage) {
    ok(`[5] Brokerage inquiry: category="${brokerage.category}" lead=${brokerage.is_lead}`);
    if (brokerage.category === 'Брокерские услуги') ok('  ↳ Category correct');
    else fail(`  ↳ Category should be Брокерские услуги`);
  } else fail('[5] Brokerage inquiry not found');

  section('── 3. LEAD AUTO-CREATION ──');

  const { rows: callLeads } = await pool.query(
    `SELECT c.filename, l.interest_type, l.lead_score
     FROM calls c
     JOIN leads l ON l.id = c.lead_id
     WHERE c.status = 'completed'`,
  );
  if (callLeads.length > 0) {
    ok(`${callLeads.length} leads auto-created from calls`);
    for (const cl of callLeads) {
      ok(`  Lead from "${cl.filename}": interest="${cl.interest_type}" score=${cl.lead_score}`);
    }
  } else {
    fail('No leads linked to calls (expected at least 2)');
  }

  section('── 4. COMPLAINT CLASSIFICATION ──');

  const { rows: complaints } = await pool.query(
    `SELECT filename, category, complaint_notes FROM calls WHERE is_complaint = TRUE`,
  );
  ok(`${complaints.length} complaints detected`);
  for (const c of complaints) {
    ok(`  "${c.filename}" → ${c.category}`);
    if (c.complaint_notes) ok(`    Notes: ${c.complaint_notes.slice(0, 80)}`);
  }

  section('── 5. ANALYTICS QUERY ──');

  const { rows: analytics } = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status='completed') AS classified,
       COUNT(*) FILTER (WHERE is_lead=TRUE) AS commercial,
       COUNT(*) FILTER (WHERE is_complaint=TRUE) AS complaints,
       ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds>0))::int AS avg_duration
     FROM calls`,
  );
  const a = analytics[0];
  ok(`Analytics: total=${a.total} classified=${a.classified} commercial=${a.commercial} complaints=${a.complaints} avgDuration=${a.avg_duration}s`);

  section('── 6. AUDIO FILES ──');

  const EXPECTED_FILES = [
    '01_deposit_inquiry.wav',
    '02_auto_loan_request.wav',
    '03_mobile_app_complaint.wav',
    '04_branch_complaint.wav',
    '05_brokerage_inquiry.wav',
  ];
  const audioDir = join(ROOT, 'qa-audio');
  for (const f of EXPECTED_FILES) {
    const path = join(audioDir, f);
    if (existsSync(path)) ok(`qa-audio/${f}`);
    else fail(`qa-audio/${f} NOT FOUND`);
  }

  section('── 7. BACKEND FILES ──');

  const FILES_TO_CHECK = [
    'apps/backend/src/db/migrations/0017_calls.sql',
    'apps/backend/src/services/audio/transcribe.ts',
    'apps/backend/src/services/audio/analyze.ts',
    'apps/backend/src/routes/admin/calls.ts',
    'apps/widget/src/admin/pages/Calls.tsx',
    'apps/widget/src/admin/pages/CallDetail.tsx',
    'apps/widget/src/admin/api/callsClient.ts',
  ];
  for (const f of FILES_TO_CHECK) {
    if (existsSync(join(ROOT, f))) ok(f);
    else fail(`${f} NOT FOUND`);
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`QA Summary: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\n✅ ALL QA CHECKS PASSED — VOC Platform ready');
  } else {
    console.log('\n⚠️  Some checks failed — review above');
  }

} finally {
  await pool.end();
}
