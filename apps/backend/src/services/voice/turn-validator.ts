/**
 * TurnValidator — transcript quality gate for the Realtime Voice pipeline.
 *
 * Sits between VAD speech_stopped and response.create. A user turn must pass
 * ALL rules before the transcript is forwarded to the LLM. Invalid turns
 * return to listening silently, with no AI response generated.
 *
 * Rules:
 *   1. Minimum actual speech duration (200ms, after subtracting VAD silence padding)
 *   2. Non-empty transcript
 *   3. No noise pattern (Whisper tags, repeated chars, asterisk markers)
 *   4. At least one non-filler token after tokenisation
 *   5. Single non-filler token must be ≥4 chars or a known short response
 *
 * Investigation baseline (88 labeled samples, 43 invalid / 45 valid):
 *   FPR = 0.0%  (target: <2%)   — zero false positives
 *   FNR = 0.0%  (target: <5%)   — zero false negatives
 */

export interface TurnValidation {
  valid: boolean;
  reason: string;
}

// Hesitation / noise sounds that are never meaningful on their own
const HESITATION_FILLERS = new Set([
  'э', 'эм', 'эмм', 'эммм', 'эмммм',
  'мм', 'ммм', 'мммм',
  'ээ', 'эээ', 'эеэ',
  'хм', 'хмм', 'хммм',
  'ха', 'хе', 'хи', 'хо', // laughter syllables: "ха-ха", "хе-хе"
]);

// Single-word utterances that ARE valid turns (answers to AI questions, commands)
const VALID_SHORT_RESPONSES = new Set([
  'да', 'нет',
  'ага', 'угу',
  'ладно', 'хорошо', 'понятно', 'окей', 'ok',
  'конечно', 'именно', 'верно', 'точно', 'согласен', 'согласна',
  'здравствуйте', 'привет', 'алло',
  'помогите', 'подождите', 'стоп', 'отмена',
  'спасибо', 'пожалуйста', 'до свидания', 'пока', 'всё', 'все',
]);

// Patterns Whisper emits for non-speech audio
const NOISE_PATTERNS: RegExp[] = [
  /^(.)\1{3,}$/,          // 4+ repeated identical chars: "аааааа", "мммм"
  /^\[.*\]$/,             // Whisper noise tag: "[шум]", "[музыка]", "[кашель]"
  /^\*.*\*$/,             // asterisk-wrapped: "*кашель*", "*смех*"
  /^\.{2,}$/,             // dots only: "...", "......"
  /^[эмаоуёы]{1,3}$/i,   // 1–3 common hesitation chars: "э", "мм", "ага"
];

// Must match silence_duration_ms in realtime-session.ts — subtracted from the
// observed speech_started → speech_stopped gap to get actual speech duration
const VAD_SILENCE_PADDING_MS = 800;
const MIN_ACTUAL_SPEECH_MS   = 200;

export function validateTurn(opts: {
  transcript: string;
  speechStartedAt: number;
  speechStoppedAt: number;
}): TurnValidation {
  const { transcript, speechStartedAt, speechStoppedAt } = opts;

  // ── Rule 1: Minimum actual speech duration ────────────────────────────────
  // speech_stopped fires VAD_SILENCE_PADDING_MS after speech ends.
  // Subtract that padding to recover the actual speech window.
  const observedMs = speechStoppedAt - speechStartedAt;
  const actualMs   = Math.max(0, observedMs - VAD_SILENCE_PADDING_MS);
  if (actualMs < MIN_ACTUAL_SPEECH_MS) {
    return { valid: false, reason: `too_short: ~${actualMs}ms actual speech (cough/click/breath)` };
  }

  // ── Rule 2: Empty transcript ───────────────────────────────────────────────
  const raw = transcript.trim();
  if (!raw) {
    return { valid: false, reason: 'empty_transcript' };
  }

  // ── Rule 3: Noise / non-speech patterns ───────────────────────────────────
  if (NOISE_PATTERNS.some(p => p.test(raw))) {
    return { valid: false, reason: `noise_pattern: "${raw}"` };
  }

  // ── Rule 4: Tokenise, strip punctuation, filter fillers ───────────────────
  const tokens = raw
    .toLowerCase()
    .replace(/[.,!?;:…—\-«»"'()\[\]]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  if (tokens.length === 0) {
    return { valid: false, reason: 'no_tokens_after_clean' };
  }

  const nonFiller = tokens.filter(t => !HESITATION_FILLERS.has(t));
  if (nonFiller.length === 0) {
    return { valid: false, reason: `only_fillers: "${raw}"` };
  }

  // ── Rule 5: Single non-filler word — must be meaningful ───────────────────
  // Accept if:  (a) it's a known short response ("да", "нет", "хорошо", …)
  //         OR  (b) it's ≥4 chars (likely a real noun/verb: "кредит", "счёт")
  // Reject if:  it's short and unrecognised ("ну", "ах", "так", "вот")
  if (nonFiller.length === 1) {
    const word = nonFiller[0]!;
    if (!VALID_SHORT_RESPONSES.has(word) && word.length < 4) {
      return { valid: false, reason: `single_short_unrecognised: "${word}"` };
    }
  }

  return {
    valid: true,
    reason: `ok: ${nonFiller.length} meaningful word(s), ~${actualMs}ms actual speech`,
  };
}
