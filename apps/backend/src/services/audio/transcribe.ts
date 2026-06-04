/**
 * Speech-to-Text via OpenAI Whisper API
 * Uses raw fetch (Node 20 native) — no openai SDK required.
 *
 * LANGUAGE HANDLING:
 *   Always pass explicit language code when known.
 *   Whisper auto-detection for Uzbek is unreliable — it frequently outputs
 *   romanized phonetic text instead of proper Uzbek orthography.
 *   Fix: caller must pass language='uz' for Uzbek audio.
 */

export interface TranscribeResult {
  text: string;
  language: string;        // BCP-47 code detected/confirmed by Whisper
  durationSeconds: number;
}

/**
 * Transcribe an audio buffer using OpenAI Whisper.
 *
 * @param buffer        Raw audio bytes
 * @param filename      Original filename (used for MIME type inference)
 * @param apiKey        OpenAI API key
 * @param language      BCP-47 language code to force.
 *                      REQUIRED for Uzbek ('uz') — do NOT rely on auto-detect.
 *                      Pass 'auto' or undefined to let Whisper guess (acceptable for Russian).
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

  // Normalize: treat 'auto' as no explicit language (let Whisper detect)
  const explicitLang = language && language !== 'auto' ? language : undefined;

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  // Always set explicit language when known — critical for Uzbek quality
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
    text: string;
    language?: string;
    duration?: number;
  };

  const detectedLang = data.language ?? explicitLang ?? 'ru';

  return {
    text: data.text?.trim() ?? '',
    language: detectedLang,
    durationSeconds: Math.round(data.duration ?? 0),
  };
}
