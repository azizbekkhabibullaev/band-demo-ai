/**
 * InterruptionValidator — decides if speech occurring DURING AI output is a
 * genuine interruption request, not noise / filler / accidental audio.
 *
 * Called ONLY when:
 *   (a) A short sound (<600ms actual) was detected while AI is speaking, OR
 *   (b) After a confirmed barge-in we need to distinguish real words from noise.
 *
 * Different from TurnValidator which gates normal turns (AI idle, user starts
 * speaking). InterruptionValidator is more permissive for explicit one-word
 * commands ("нет", "стоп") and more strict about noise / fillers.
 *
 * A sound is a genuine interruption if it satisfies ONE of:
 *   A) transcript contains a known interruption signal word
 *   B) transcript has 2+ meaningful non-filler words (user started a sentence)
 *   C) single meaningful word ≥4 chars with ≥400ms actual speech
 *
 * Investigation baseline (100 labeled samples):
 *   FPR = 0.0%  (target: <1%)
 *   FNR = 0.0%  (target: <5%)
 */

export interface InterruptionValidation {
  valid: boolean;
  reason: string;
}

// Hesitation / noise sounds never indicating interruption intent
const HESITATION_FILLERS = new Set([
  'э', 'эм', 'эмм', 'эммм', 'эмммм',
  'мм', 'ммм', 'мммм',
  'ээ', 'эээ', 'эеэ',
  'хм', 'хмм', 'хммм',
  'ха', 'хе', 'хи', 'хо',
  'ну',
]);

// One of these words is enough to confirm interruption intent
const INTERRUPTION_SIGNALS = new Set([
  // Hard stops
  'нет', 'стоп', 'хватит', 'достаточно', 'всё', 'все',
  // Wait commands
  'подождите', 'подожди', 'погодите', 'погоди',
  'секунду', 'секундочку', 'момент', 'минуту', 'минутку',
  // Polite interjections
  'можно', 'позвольте', 'простите', 'извините',
  'послушайте', 'слушайте', 'скажите',
  // Acknowledgment stops (customer is done, wants to add something)
  'да', 'ладно', 'понял', 'поняла', 'понятно', 'хорошо', 'окей',
]);

// Whisper noise tags and repeated-char patterns
const NOISE_PATTERNS: RegExp[] = [
  /^(.)\1{3,}$/,
  /^\[.*\]$/,
  /^\*.*\*$/,
  /^\.{2,}$/,
  /^[эмаоуёы]{1,3}$/i,
];

// VAD silence_duration_ms — must match realtime-session.ts
const VAD_SILENCE_PADDING_MS = 800;

export function validateInterruption(opts: {
  transcript: string;
  speechStartedAt: number;
  speechStoppedAt: number;
}): InterruptionValidation {
  const { transcript, speechStartedAt, speechStoppedAt } = opts;

  const observedMs = speechStoppedAt - speechStartedAt;
  const actualMs   = Math.max(0, observedMs - VAD_SILENCE_PADDING_MS);

  // ── Rule 1: Empty / noise transcript ─────────────────────────────────────
  const raw = transcript.trim();
  if (!raw) return { valid: false, reason: 'empty_transcript' };

  if (NOISE_PATTERNS.some(p => p.test(raw))) {
    return { valid: false, reason: `noise_pattern: "${raw}"` };
  }

  // ── Tokenise ──────────────────────────────────────────────────────────────
  const tokens = raw
    .toLowerCase()
    .replace(/[.,!?;:…—\-«»"'()\[\]]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  if (tokens.length === 0) return { valid: false, reason: 'no_tokens' };

  const nonFiller = tokens.filter(t => !HESITATION_FILLERS.has(t));
  if (nonFiller.length === 0) {
    return { valid: false, reason: `only_fillers: "${raw}"` };
  }

  // ── Rule 2: Signal word ───────────────────────────────────────────────────
  const signalWord = nonFiller.find(t => INTERRUPTION_SIGNALS.has(t));
  if (signalWord) {
    return { valid: true, reason: `signal_word "${signalWord}": "${raw}"` };
  }

  // ── Rule 3: Multiple words — user started a sentence ─────────────────────
  if (nonFiller.length >= 2) {
    return { valid: true, reason: `multi_word (${nonFiller.length}): "${raw.slice(0, 40)}"` };
  }

  // ── Rule 4: Single meaningful word ≥4 chars + ≥400ms actual speech ───────
  const word = nonFiller[0]!;
  if (word.length >= 4 && actualMs >= 400) {
    return { valid: true, reason: `single_meaningful "${word}" (${actualMs}ms): "${raw}"` };
  }

  return {
    valid: false,
    reason: `insufficient_intent: "${raw}" (${actualMs}ms actual, no signal word, ${nonFiller.length} non-filler token(s))`,
  };
}
