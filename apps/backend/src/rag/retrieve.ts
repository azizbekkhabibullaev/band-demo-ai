import { getPool } from '../db/client.js';

export interface RetrievedChunk {
  id: string;
  chunk_id: string;
  title: string;
  content: string;
  answer: string | null;
  category: string;
  cosine_score: number;
  final_score: number;
  frequency: number;
}

export interface RetrieveParams {
  tenantId: string;
  lang: string;
  embedding: number[];
  query: string;
  topK?: number;
  threshold?: number;
  crossLingual?: boolean; // search across all langs
}

export async function retrieveChunks(params: RetrieveParams): Promise<RetrievedChunk[]> {
  const {
    tenantId,
    lang,
    embedding,
    query,
    topK = 5,
    threshold = 0.25,
    crossLingual = false,
  } = params;
  const pool = getPool();

  // pgvector expects the literal '[f1,f2,...]' cast to vector
  // Safe: embedding is a number[] — no user-controlled strings
  const vectorLiteral = `[${embedding.join(',')}]`;

  const langFilter = crossLingual ? '' : 'AND lang = $3';
  const langParam: unknown[] = crossLingual
    ? [vectorLiteral, tenantId]
    : [vectorLiteral, tenantId, lang];

  const { rows } = await pool.query<{
    id: string;
    chunk_id: string;
    title: string;
    content: string;
    answer: string | null;
    category: string;
    frequency: number;
    cosine_score: number;
  }>(
    `SELECT id, chunk_id, title, content, answer, category, COALESCE(frequency, 1) AS frequency,
            1 - (embedding <=> $1::vector) AS cosine_score
       FROM kb_chunks
      WHERE tenant_id = $2 ${langFilter}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT ${Math.max(Math.floor(topK * 2), 20)}`,
    langParam,
  );

  // Tokenise query: words >= 3 chars, lowercased.
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);

  const scored: RetrievedChunk[] = rows.map(row => {
    const searchTarget = (
      row.content +
      ' ' +
      (row.answer ?? '') +
      ' ' +
      row.title
    ).toLowerCase();
    const hits = queryTokens.filter(t => searchTarget.includes(t)).length;
    const kwScore = queryTokens.length > 0 ? hits / queryTokens.length : 0;
    // Frequency boost: log scale, max 1.15x
    const freqBoost = Math.min(1.15, 1 + Math.log1p(Number(row.frequency) - 1) * 0.03);
    const cosine = Number(row.cosine_score);
    const final_score = (0.65 * cosine + 0.35 * kwScore) * freqBoost;
    return {
      ...row,
      cosine_score: cosine,
      final_score,
      answer: row.answer ?? null,
      frequency: Number(row.frequency),
      category: row.category,
    };
  });

  return scored
    .filter(c => c.final_score >= threshold)
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, topK);
}
