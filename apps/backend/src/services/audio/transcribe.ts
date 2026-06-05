/**
 * Speech-to-Text via OpenAI Whisper API
 * Uses raw fetch (Node 20 native) — no openai SDK required.
 *
 * BUSINESS RULE:
 *   Only two languages are supported: 'uz' (Uzbek) and 'ru' (Russian).
 *   The caller MUST pass one of these. It is the source of truth.
 *   We never read Whisper's detected language — we always return the
 *   language the caller passed in, unchanged.
 *
 * WHISPER PARAMETER MAPPING:
 *   'ru' → language='ru'   (officially supported by Whisper API)
 *   'uz' → language='kk'   (Kazakh proxy — same Turkic family, officially supported,
 *                            empirically highest quality for Uzbek audio at 50% confidence.
 *                            'uz' itself returns HTTP 400 unsupported_language.)
 *
 * The raw transcript from 'kk' mode is Cyrillic Kazakh-phonetic.
 * The normalizeUzbek() step (in analyze.ts) converts it to literary Uzbek.
 */

export type SupportedLanguage = 'uz' | 'ru';

export interface TranscribeResult {
  text:            string;
  language:        SupportedLanguage; // Always equals the input language — never Whisper's guess
  durationSeconds: number;
  confidence:      number;            // 0.0–1.0, from segment avg_logprob
}

// Whisper API parameter for each supported language.
// 'uz' is NOT accepted by the API — use Kazakh ('kk') as proxy.
const WHISPER_PARAM: Record<SupportedLanguage, string> = {
  ru: 'ru',   // officially supported
  uz: 'kk',   // Kazakh proxy — same Turkic family, best empirical result for Uzbek
};

/**
 * Transcribe audio using OpenAI Whisper.
 *
 * @param buffer    Raw audio bytes
 * @param filename  Original filename (for MIME type)
 * @param apiKey    OpenAI API key
 * @param language  'uz' or 'ru' — REQUIRED, caller's selection is the source of truth
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  apiKey: string,
  language: SupportedLanguage,
): Promise<TranscribeResult> {
  if (language !== 'uz' && language !== 'ru') {
    throw new Error(
      `transcribeAudio: unsupported language "${language}". Only 'uz' and 'ru' are accepted.`,
    );
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? 'wav';
  const mimeMap: Record<string, string> = {
    mp3:  'audio/mpeg',
    wav:  'audio/wav',
    m4a:  'audio/mp4',
    webm: 'audio/webm',
    mp4:  'audio/mp4',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    ogg:  'audio/ogg',
    flac: 'audio/flac',
  };
  const mimeType = mimeMap[ext] ?? 'audio/wav';

  const whisperParam = WHISPER_PARAM[language];
  console.info(
    `[transcribe] file="${filename}" language="${language}" whisper_param="${whisperParam}"`,
  );

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('language', whisperParam);  // Always set — no auto-detection ever

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper API ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    text:      string;
    language?: string;  // Whisper's guess — intentionally IGNORED
    duration?: number;
    segments?: { avg_logprob?: number }[];
  };

  // Confidence from segment avg_logprob (0 = perfect, -1 = noise)
  let confidence = 0.5;
  if (data.segments && data.segments.length > 0) {
    const avgLogprob = data.segments.reduce(
      (sum, s) => sum + (s.avg_logprob ?? -0.5), 0,
    ) / data.segments.length;
    confidence = Math.max(0, Math.min(1, 1 + avgLogprob));
  }

  console.info(
    `[transcribe] done: language="${language}" confidence=${confidence.toFixed(2)} ` +
    `duration=${data.duration ?? 0}s whisper_saw="${data.language ?? '?'}" (ignored)`,
  );

  return {
    text:            data.text?.trim() ?? '',
    language,        // Return the CALLER'S language, not Whisper's detection
    durationSeconds: Math.round(data.duration ?? 0),
    confidence,
  };
}
