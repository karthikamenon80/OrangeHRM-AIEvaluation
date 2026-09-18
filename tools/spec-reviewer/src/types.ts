export type GapCategory =
  | 'missing_acceptance_criterion'
  | 'missing_edge_case'
  | 'contradiction'
  | 'weak_assertion'
  | 'other';

export type Severity = 'high' | 'medium' | 'low';

export interface ReviewGap {
  category: GapCategory;
  /** The AC id (e.g. "AC-6") or the edge-case bullet this gap relates to. */
  reference: string;
  description: string;
  severity: Severity;
}

export interface SpecReview {
  /** 0-10: 10 = every AC and edge case is covered by a correct test, no contradictions. */
  score: number;
  summary: string;
  gaps: ReviewGap[];
}

export interface FeatureTarget {
  slug: string;
  specPath: string;
  testPaths: string[];
}
