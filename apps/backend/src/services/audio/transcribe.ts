/**
 * Speech-to-Text via OpenAI Whisper API
 * Uses raw fetch (Node 20 native) — no openai SDK required.
 *
 * IMPORTANT — OFFICIAL LANGUAGE SUPPORT:
 *   OpenAI whisper-1 accepts the `language` parameter only for languages in
 *   the officially tested list. Uzbek ('uz') is NOT in that list.
 *   Passing language='uz' returns HTTP 400: "Language 'uz' is not supported."
 *
 *   Source: https://platform.openai.com/docs/guides/speech-to-text
 *
 *   FIX: only pass `language` to the API if the code is in WHISPER_SUPPORTED_LANGS.
 *   For Uzbek, omit the language parameter → auto-detection.
 *   Whisper was trained on Uzbek data and CAN transcribe it; the API simply
 *   does not accept 'uz' as a forced code.
 *   The detected language name ("uzbek") is mapped back to ISO 639-1 in the response.
 */

export interface TranscribeResult {
  text:            string;
  language:        string;   // ISO 639-1 code mapped from Whisper's language name
  detectedName:    string;   // Raw language name Whisper returned (e.g. "uzbek")
  durationSeconds: number;
  confidence:      number;   // 0.0–1.0, derived from segment avg_logprob
}

// ─── Languages officially supported by the whisper-1 `language` parameter ─────
// Source: https://platform.openai.com/docs/guides/speech-to-text (2024-06)
// Do NOT add 'uz' here — it causes HTTP 400 unsupported_language.
const WHISPER_SUPPORTED_LANGS = new Set([
  'af','ar','hy','az','be','bs','bg','ca','zh','hr','cs','da','nl','en',
  'et','fi','fr','gl','de','el','he','hi','hu','is','id','it','ja','kn',
  'kk','ko','lv','lt','mk','ms','mr','mi','ne','no','fa','pl','pt','ro',
  'ru','sr','sk','sl','es','sw','sv','tl','ta','th','tr','uk','ur','vi','cy',
]);

// ─── Map Whisper verbose_json language names → ISO 639-1 codes ────────────────
// verbose_json returns full English names ("uzbek", "russian"), not ISO codes.
const WHISPER_LANG_NAME_TO_ISO: Record<string, string> = {
  uzbek:        'uz',
  russian:      'ru',
  english:      'en',
  kazakh:       'kk',
  turkish:      'tr',
  arabic:       'ar',
  french:       'fr',
  german:       'de',
  spanish:      'es',
  italian:      'it',
  japanese:     'ja',
  chinese:      'zh',
  korean:       'ko',
  portuguese:   'pt',
  ukrainian:    'uk',
  azerbaijani:  'az',
  tajik:        'tg',
  indonesian:   'id',
  hindi:        'hi',
  persian:      'fa',
  belarusian:   'be',
};

/**
 * Transcribe an audio buffer using OpenAI Whisper.
 *
 * @param buffer    Raw audio bytes
 * @param filename  Original filename (used for MIME type inference)
 * @param apiKey    OpenAI API key
 * @param language  Caller's language hint ('ru', 'uz', 'auto', or undefined).
 *                  Only languages in WHISPER_SUPPORTED_LANGS are forwarded to
 *                  the API. 'uz' and unknown codes trigger auto-detection.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  apiKey: string,
  language?: string,
): Promise<TranscribeResult> {
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

  // Only pass language to the API if it is officially supported.
  // 'uz', 'auto', undefined, and any unsupported code → auto-detect.
  const normalised  = language && language !== 'auto' ? language.toLowerCase() : undefined;
  const explicitLang = normalised && WHISPER_SUPPORTED_LANGS.has(normalised)
    ? normalised
    : undefined;

  if (normalised && !explicitLang) {
    // Log when we silently fall back to auto-detect (e.g. 'uz')
    console.info(
      `[transcribe] language='${normalised}' is not in Whisper's supported list → using auto-detection`,
    );
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  if (explicitLang) {
    form.append('language', explicitLang);
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
    text:       string;
    language?:  string;   // Full name: "uzbek", "russian", …
    duration?:  number;
    segments?:  { avg_logprob?: number; no_speech_prob?: number }[];
  };

  // ── Language: map full name → ISO code ───────────────────────────────────
  const rawLangName = (data.language ?? '').toLowerCase().trim();
  const isoCode = WHISPER_LANG_NAME_TO_ISO[rawLangName]
    ?? explicitLang       // fall back to the code we sent
    ?? normalised         // fall back to the hint
    ?? 'ru';              // final default

  // ── Confidence: derived from segment avg_logprob ─────────────────────────
  // avg_logprob ≈ 0 → probability ≈ 1.0 (perfect)
  // avg_logprob ≈ -1 → probability ≈ 0.0 (noise/garbled)
  // Linear clamp: confidence = 1 + avg_logprob, clamped to [0, 1]
  let confidence = 0.5; // default if no segments
  if (data.segments && data.segments.length > 0) {
    const avgLogprob = data.segments.reduce(
      (sum, s) => sum + (s.avg_logprob ?? -0.5),
      0,
    ) / data.segments.length;
    confidence = Math.max(0, Math.min(1, 1 + avgLogprob));
  }

  console.info(
    `[transcribe] file="${filename}" whisper_lang="${rawLangName}" iso="${isoCode}" confidence=${confidence.toFixed(2)} duration=${data.duration ?? 0}s`,
  );

  return {
    text:            data.text?.trim() ?? '',
    language:        isoCode,
    detectedName:    rawLangName || isoCode,
    durationSeconds: Math.round(data.duration ?? 0),
    confidence,
  };
}
