import { extractFacts, round } from '../text.js';
import type { HallucinationResult } from '../types.js';

/**
 * Flags policy details the response states that appear in neither the
 * reference answer nor the knowledge-base context it was supposed to draw
 * on. Only checkable facts (quantities, amounts, dates) are compared, so a
 * hallucination that is purely qualitative — e.g. inventing an approver —
 * is out of reach for this rule and left to the AI judge.
 */
export function detectHallucination(response: string, reference: string, context: string): HallucinationResult {
  const grounding = new Set([...extractFacts(reference), ...extractFacts(context)]);
  const responseFacts = extractFacts(response);
  const unsupportedFacts = responseFacts.filter((f) => !grounding.has(f));
  return {
    groundedness: responseFacts.length === 0 ? 1 : round(1 - unsupportedFacts.length / responseFacts.length),
    unsupportedFacts,
  };
}
