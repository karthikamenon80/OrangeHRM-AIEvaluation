/** Ground-truth label: what (if anything) is deliberately wrong with the response. */
export type EntryLabel =
  | 'good'
  | 'hallucination'
  | 'off_topic'
  | 'inconsistent'
  | 'injection_refused'
  | 'injection_complied'
  | 'incorrect'
  | 'incomplete'
  | 'social_engineering_complied'
  | 'over_refusal'
  | 'unlabeled';

/** Defect flags the platform can raise on an entry. */
export type Flag =
  | 'inaccurate'
  | 'incomplete'
  | 'irrelevant'
  | 'hallucination'
  | 'inconsistent'
  | 'unsafe'
  | 'injection_attempt';

export const ALL_FLAGS: Flag[] = [
  'inaccurate',
  'incomplete',
  'irrelevant',
  'hallucination',
  'inconsistent',
  'unsafe',
  'injection_attempt',
];

export interface DatasetEntry {
  id: string;
  label: EntryLabel;
  prompt: string;
  reference: string;
  response: string;
  /** Knowledge-base section ids a grounded answer may draw on. */
  contextIds?: string[];
  /** Entries sharing a group ask the same question in different words. */
  consistencyGroup?: string;
  /** openspec/changes/<slug> feature this entry relates to (for traceability). */
  feature?: string;
}

export interface Dataset {
  description?: string;
  entries: DatasetEntry[];
}

export interface KbSection {
  id: string;
  title: string;
  text: string;
}

export interface KnowledgeBase {
  title: string;
  sections: KbSection[];
}

export interface AccuracyResult {
  /** 0-1 combined score. */
  score: number;
  lexicalSimilarity: number;
  /** Fraction of the reference's policy facts that the response restates. */
  factRecall: number;
  referenceFacts: string[];
  responseFacts: string[];
}

export interface RelevanceResult {
  /** 0-1: share of the response's content words that are on-topic for the prompt/reference/context. */
  score: number;
  offTopicTerms: string[];
}

export interface HallucinationResult {
  /** 0-1 groundedness: share of the response's policy facts found in reference + context. */
  groundedness: number;
  unsupportedFacts: string[];
}

export interface SafetyResult {
  injectionDetected: boolean;
  injectionSignals: string[];
  refused: boolean;
  leakSignals: string[];
  verdict: 'safe' | 'unsafe';
  rationale: string;
}

export interface ConsistencyResult {
  group: string;
  /** Ids of the other group members this response agrees with. */
  agreesWith: string[];
  disagreesWith: string[];
  consistent: boolean;
}

export interface RuleScores {
  accuracy: AccuracyResult;
  relevance: RelevanceResult;
  hallucination: HallucinationResult;
  safety: SafetyResult;
  consistency?: ConsistencyResult;
  flags: Flag[];
}

export interface JudgeVerdict {
  /** 1-5 scores from the rubric. */
  correctness: number;
  completeness: number;
  relevance: number;
  groundedness: number;
  hallucinatedClaims: string[];
  promptInjectionDetected: boolean;
  safetyVerdict: 'safe' | 'unsafe';
  rationale: string;
}

export type JudgeOutcome =
  | { status: 'ok'; verdict: JudgeVerdict; model: string; flags: Flag[] }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string };

export interface GroupJudgeOutcome {
  group: string;
  status: 'ok' | 'skipped' | 'error';
  inconsistentIds: string[];
  rationale: string;
}

export interface EntryResult {
  entry: DatasetEntry;
  rules: RuleScores;
  judge: JudgeOutcome;
  /** Union of rule flags and judge flags. */
  flags: Flag[];
  /** Headline per-dimension scores, 0-1 (null when not applicable). */
  scores: {
    accuracy: number;
    relevance: number;
    groundedness: number;
    hallucination: boolean;
    safety: 'safe' | 'unsafe';
    consistency: 'consistent' | 'inconsistent' | 'n/a';
  };
  verification?: EntryVerification;
}

export interface EntryVerification {
  /** Flags the label requires to be raised. */
  required: Flag[];
  /** Flags the label requires NOT to be raised. */
  forbidden: Flag[];
  missing: Flag[];
  unexpected: Flag[];
  passed: boolean;
}

export type Method = 'rules' | 'judge' | 'combined';

export interface MethodVerification {
  method: Method;
  available: boolean;
  entriesPassed: number;
  entriesTotal: number;
  /** Ids of entries where this method alone gets the label wrong. */
  failures: { id: string; label: EntryLabel; missing: Flag[]; unexpected: Flag[] }[];
}
