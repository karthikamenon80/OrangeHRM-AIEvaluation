import { contentTokens, cosineSimilarity, extractFacts, round } from '../text.js';
import type { AccuracyResult } from '../types.js';

export const ACCURACY_THRESHOLD = 0.5;

/**
 * Accuracy vs. the reference answer: 40% bag-of-words cosine similarity
 * (catches paraphrases that keep the same vocabulary), 60% fact recall
 * (did the response restate the reference's numbers, dates and amounts?).
 * Fact recall carries more weight because for HR policy the numbers are what
 * matter; a fluent answer with the wrong day count is a wrong answer.
 * When the reference has no checkable facts (e.g. a yes/no or a refusal),
 * the score falls back to lexical similarity, scaled up so a correct short
 * paraphrase isn't failed for using different words. Facts the response adds
 * in that case are not penalised here: whether they are supported is the
 * hallucination detector's job, which checks them against the context too.
 */
export function scoreAccuracy(response: string, reference: string): AccuracyResult {
  const lexicalSimilarity = cosineSimilarity(contentTokens(response), contentTokens(reference));
  const referenceFacts = extractFacts(reference);
  const responseFacts = extractFacts(response);

  let factRecall: number;
  let score: number;
  if (referenceFacts.length === 0) {
    factRecall = 1;
    score = Math.min(1, lexicalSimilarity * 1.5);
  } else {
    const responseSet = new Set(responseFacts);
    factRecall = referenceFacts.filter((f) => responseSet.has(f)).length / referenceFacts.length;
    score = 0.4 * lexicalSimilarity + 0.6 * factRecall;
  }

  return {
    score: round(score),
    lexicalSimilarity: round(lexicalSimilarity),
    factRecall: round(factRecall),
    referenceFacts,
    responseFacts,
  };
}
