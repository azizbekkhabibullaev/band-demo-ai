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
 * WHISPER PARAMETER MAPPING (evidence-based, A/B tested 2026-06-05):
 *   'ru' → language='ru'    (officially supported; directly accepted)
 *   'uz' → no language param (Whisper auto-detect)
 *
 * Why no explicit param for Uzbek:
 *   - 'uz' returns HTTP 400 unsupported_language.
 *   - 'kk' (Kazakh proxy) was tested and scored LOWER than auto-detect after
 *     GPT normalization (9 Uzbek words vs 11, garbled artifacts remained).
 *   - Auto-detect misidentifies as "georgian" (30% confidence) but the Latin
 *     phonetic output is actually more amenable to GPT normalization.
 *   - The selected language 'uz' still drives the normalizer and classifier.
 *     Whisper's detected language is ignored in all cases.
 */

export type SupportedLanguage = 'uz' | 'ru';

export interface TranscribeResult {
  text:            string;
  language:        SupportedLanguage; // Always equals the input language — never Whisper's guess
  durationSeconds: number;
  confidence:      number;            // 0.0–1.0, from segment avg_logprob
}

// Whisper API 'language' parameter for each supported language.
// undefined = omit the parameter (Whisper auto-detects the acoustic signal).
const WHISPER_PARAM: Record<SupportedLanguage, string | undefined> = {
  ru: 'ru',       // officially supported; pass explicitly
  uz: undefined,  // 'uz' is unsupported; auto-detect gives better normalization output
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
    `[transcribe] file="${filename}" language="${language}" ` +
    `whisper_param=${whisperParam ? `"${whisperParam}"` : 'omitted (auto)'}`,
  );

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (whisperParam) {
    form.append('language', whisperParam);  // Set only when defined (ru)
    // uz: omitted — auto-detect produces better normalization output than kk proxy
  }

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
