import { contentTokens, round } from '../text.js';
import type { RelevanceResult } from '../types.js';

export const RELEVANCE_THRESHOLD = 0.35;

/**
 * Topical relevance: what share of the response's content words belong to
 * the question's topic vocabulary (prompt + reference + the knowledge-base
 * sections it is grounded in). An off-topic answer — talking about payslips
 * when asked how to book leave — is mostly words that appear nowhere in that
 * vocabulary, regardless of how fluent it is.
 */
export function scoreRelevance(response: string, prompt: string, reference: string, context: string): RelevanceResult {
  const topic = new Set(contentTokens(`${prompt} ${reference} ${context}`));
  const tokens = contentTokens(response);
  if (tokens.length === 0) {
    return { score: 0, offTopicTerms: [] };
  }
  const offTopic = tokens.filter((t) => !topic.has(t));
  return {
    score: round(1 - offTopic.length / tokens.length),
    offTopicTerms: [...new Set(offTopic)],
  };
}
