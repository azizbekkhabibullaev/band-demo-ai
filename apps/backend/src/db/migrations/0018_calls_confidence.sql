-- Add Whisper detection confidence and raw detected language to calls table.
-- confidence: 0.0–1.0 derived from segment avg_logprob (1 = perfect, 0 = noise)
-- detected_language: full language name returned by Whisper (e.g. "uzbek", "russian")
--   stored separately from the normalised ISO code in `language`

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS confidence float,
  ADD COLUMN IF NOT EXISTS detected_language text;
