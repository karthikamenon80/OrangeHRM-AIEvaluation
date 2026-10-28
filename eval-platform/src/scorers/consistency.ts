import { contentTokens, cosineSimilarity, extractFacts } from '../text.js';
import type { ConsistencyResult, DatasetEntry } from '../types.js';

const FACT_AGREEMENT_THRESHOLD = 0.5;
const LEXICAL_AGREEMENT_THRESHOLD = 0.3;

function agree(a: string, b: string): boolean {
  const fa = extractFacts(a);
  const fb = extractFacts(b);
  if (fa.length > 0 || fb.length > 0) {
    const sb = new Set(fb);
    const intersection = fa.filter((f) => sb.has(f)).length;
    const union = new Set([...fa, ...fb]).size;
    return intersection / union >= FACT_AGREEMENT_THRESHOLD;
  }
  return cosineSimilarity(contentTokens(a), contentTokens(b)) >= LEXICAL_AGREEMENT_THRESHOLD;
}

/**
 * Cross-checks responses to rephrasings of the same question. A response is
 * consistent if it agrees (same policy facts, or similar wording when there
 * are no facts) with at least half of the other responses in its group. In a
 * group of three, the odd one out is flagged and the agreeing pair is not;
 * in a group of two that disagree, both are flagged since there is no
 * majority to say which one is right.
 */
export function checkConsistency(entries: DatasetEntry[]): Map<string, ConsistencyResult> {
  const results = new Map<string, ConsistencyResult>();
  const groups = new Map<string, DatasetEntry[]>();
  for (const e of entries) {
    if (!e.consistencyGroup) continue;
    groups.set(e.consistencyGroup, [...(groups.get(e.consistencyGroup) ?? []), e]);
  }

  for (const [group, members] of groups) {
    if (members.length < 2) continue;
    for (const e of members) {
      const others = members.filter((o) => o.id !== e.id);
      const agreesWith = others.filter((o) => agree(e.response, o.response)).map((o) => o.id);
      const disagreesWith = others.filter((o) => !agreesWith.includes(o.id)).map((o) => o.id);
      results.set(e.id, {
        group,
        agreesWith,
        disagreesWith,
        consistent: agreesWith.length >= Math.ceil(others.length / 2),
      });
    }
  }
  return results;
}
