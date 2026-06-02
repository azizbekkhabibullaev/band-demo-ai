import { getPool } from '../db/client.js';
import { normalizeText, expandSynonyms } from '../lang/normalize.js';

export interface FaqResult {
  faq_id: string;
  kb_id: string | null;
  category: string;
  question: string;
  answer: string;
  confidence: number;
  match_type: 'exact' | 'keyword' | 'semantic';
}

// In-memory FAQ cache per tenant
const faqCache: Map<string, CachedFaq[]> = new Map();

interface CachedFaq {
  faq_id: string;
  kb_id: string | null;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  frequency: number;
  score: number;
  normalizedQuestion: string;
  tokens: string[];
}

export async function loadFaqCache(tenantId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT faq_id, kb_id, category, question, answer, keywords, frequency, score FROM faq_entries WHERE tenant_id = $1 ORDER BY score DESC',
    [tenantId],
  );
  const cached: CachedFaq[] = rows.map(r => ({
    faq_id: r.faq_id as string,
    kb_id: (r.kb_id as string | null) ?? null,
    category: r.category as string,
    question: r.question as string,
    answer: r.answer as string,
    keywords: (r.keywords as string[]) ?? [],
    frequency: Number(r.frequency),
    score: Number(r.score),
    normalizedQuestion: normalizeText(r.question as string),
    tokens: normalizeText(r.question as string)
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3),
  }));
  faqCache.set(tenantId, cached);
}

export async function lookupFaq(
  tenantId: string,
  query: string,
  embedding: number[],
  topK = 3,
): Promise<FaqResult[]> {
  // Ensure cache loaded
  if (!faqCache.has(tenantId)) {
    await loadFaqCache(tenantId);
  }

  const cached = faqCache.get(tenantId) ?? [];
  if (cached.length === 0) return [];

  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
  const expandedTokens = expandSynonyms(queryTokens);

  // Exact phrase match
  const exactMatches: FaqResult[] = [];
  for (const faq of cached) {
    if (faq.normalizedQuestion === normalizedQuery) {
      exactMatches.push({ ...faq, confidence: 0.99, match_type: 'exact' });
    }
  }
  if (exactMatches.length > 0) return exactMatches.slice(0, topK);

  // Keyword scoring (BM25-style token overlap)
  const keywordScored: (CachedFaq & { keywordScore: number })[] = cached.map(faq => {
    const hits = expandedTokens.filter(
      t =>
        faq.tokens.includes(t) ||
        faq.keywords.some(k => k.toLowerCase().includes(t)) ||
        faq.normalizedQuestion.includes(t),
    ).length;
    const keywordScore = queryTokens.length > 0 ? hits / Math.max(queryTokens.length, 1) : 0;
    return { ...faq, keywordScore };
  });

  // Vector semantic scoring (use the embedding we already computed)
  const pool = getPool();
  const vectorLiteral = `[${embedding.join(',')}]`;

  let vecMap = new Map<string, number>();
  try {
    const { rows: vecRows } = await pool.query<{ faq_id: string; sim: number }>(
      `SELECT faq_id, 1 - (embedding <=> $1::vector) AS sim
         FROM faq_entries WHERE tenant_id = $2 AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector LIMIT 10`,
      [vectorLiteral, tenantId],
    );
    vecMap = new Map(vecRows.map(r => [r.faq_id, Number(r.sim)]));
  } catch {
    // If embedding column doesn't exist or is empty, use keyword only
  }

  // Combine keyword + semantic
  const results: FaqResult[] = keywordScored
    .map(faq => {
      const vecSim = vecMap.get(faq.faq_id) ?? 0;
      const confidence = Math.min(
        0.99,
        0.45 * faq.keywordScore + 0.55 * Math.max(0, vecSim),
      );
      return {
        faq_id: faq.faq_id,
        kb_id: faq.kb_id,
        category: faq.category,
        question: faq.question,
        answer: faq.answer,
        confidence,
        match_type: (faq.keywordScore > 0.5 ? 'keyword' : 'semantic') as FaqResult['match_type'],
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topK);

  return results;
}

// Call this when FAQ data is updated
export function invalidateFaqCache(tenantId: string): void {
  faqCache.delete(tenantId);
}
