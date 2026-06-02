import { getPool } from '../db/client.js';
import { normalizeText } from '../lang/normalize.js';

export interface DetectedIntent {
  intent_id: string;
  name: string;
  display_name_uz: string;
  display_name_ru: string;
  category: string;
  confidence: number;
}

interface CachedIntent {
  intent_id: string;
  name: string;
  display_name_uz: string;
  display_name_ru: string;
  category: string;
  example_questions: string[];
  keywords: string[];
  kb_count: number;
  normalizedExamples: string[];
  tokenSet: Set<string>;
}

const intentCache: Map<string, CachedIntent[]> = new Map();

export async function loadIntentCache(tenantId: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT intent_id, name, display_name_uz, display_name_ru, category, example_questions, keywords, kb_count FROM intent_entries WHERE tenant_id = $1',
    [tenantId],
  );
  const cached: CachedIntent[] = rows.map(r => {
    const exampleQuestions = (r.example_questions as string[]) ?? [];
    const normalizedExamples = exampleQuestions.map(q => normalizeText(q));
    const allTokens = normalizedExamples
      .join(' ')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3);
    const keywords = (r.keywords as string[]) ?? [];
    const tokenSet = new Set([...allTokens, ...keywords.map(k => k.toLowerCase())]);
    return {
      intent_id: r.intent_id as string,
      name: r.name as string,
      display_name_uz: r.display_name_uz as string,
      display_name_ru: r.display_name_ru as string,
      category: r.category as string,
      example_questions: exampleQuestions,
      keywords,
      kb_count: Number(r.kb_count),
      normalizedExamples,
      tokenSet,
    };
  });
  intentCache.set(tenantId, cached);
}

export async function detectIntent(
  tenantId: string,
  query: string,
): Promise<DetectedIntent[]> {
  if (!intentCache.has(tenantId)) {
    await loadIntentCache(tenantId);
  }

  const cached = intentCache.get(tenantId) ?? [];
  if (cached.length === 0) return [];

  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(
    normalizedQuery
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3),
  );

  const scored: (DetectedIntent & { rawScore: number })[] = cached
    .filter(intent => intent.intent_id !== 'INT_022') // skip boshqa_savol catch-all
    .map(intent => {
      // Exact example match
      const exactMatch = intent.normalizedExamples.some(
        ex => ex.includes(normalizedQuery) || normalizedQuery.includes(ex.substring(0, 30)),
      );
      if (exactMatch) {
        return {
          intent_id: intent.intent_id,
          name: intent.name,
          display_name_uz: intent.display_name_uz,
          display_name_ru: intent.display_name_ru,
          category: intent.category,
          rawScore: 0.95,
          confidence: 0.95,
        };
      }

      // Token overlap score
      let hits = 0;
      for (const t of queryTokens) {
        if (intent.tokenSet.has(t)) hits++;
      }
      const precision = queryTokens.size > 0 ? hits / queryTokens.size : 0;
      const recall = intent.tokenSet.size > 0 ? hits / intent.tokenSet.size : 0;
      const f1 =
        precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      return {
        intent_id: intent.intent_id,
        name: intent.name,
        display_name_uz: intent.display_name_uz,
        display_name_ru: intent.display_name_ru,
        category: intent.category,
        rawScore: f1,
        confidence: Math.min(0.95, f1 * 1.2),
      };
    })
    .filter(i => i.rawScore > 0.1)
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, 3);

  // Add boshqa_savol as fallback if no good match
  if (scored.length === 0 || scored[0]!.confidence < 0.4) {
    const catchAll = cached.find(i => i.intent_id === 'INT_022');
    if (catchAll) {
      scored.push({
        intent_id: catchAll.intent_id,
        name: catchAll.name,
        display_name_uz: catchAll.display_name_uz,
        display_name_ru: catchAll.display_name_ru,
        category: catchAll.category,
        rawScore: 0.3,
        confidence: 0.3,
      });
    }
  }

  return scored.map(({ rawScore: _rawScore, ...rest }) => rest);
}

export function invalidateIntentCache(tenantId: string): void {
  intentCache.delete(tenantId);
}
