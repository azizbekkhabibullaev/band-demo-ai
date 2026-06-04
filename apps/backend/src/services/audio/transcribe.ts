/**
 * Speech-to-Text via OpenAI Whisper API
 * Uses raw fetch (Node 20 native) — no openai SDK required.
 */

export interface TranscribeResult {
  text: string;
  language: string;
  durationSeconds: number;
}

/**
 * Transcribe an audio buffer using OpenAI Whisper.
 * Supports mp3, wav, m4a, webm, mp4, mpeg, mpga, ogg, flac.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  apiKey: string,
  hintLanguage?: string,
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

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (hintLanguage) form.append('language', hintLanguage);

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

  return {
    text: data.text?.trim() ?? '',
    language: data.language ?? hintLanguage ?? 'ru',
    durationSeconds: Math.round(data.duration ?? 0),
  };
}
