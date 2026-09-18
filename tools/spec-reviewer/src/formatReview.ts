import type { SpecReview } from './types.js';

const SEVERITY_ICON: Record<string, string> = { high: '🔴', medium: '🟠', low: '🟡' };
const CATEGORY_LABEL: Record<string, string> = {
  missing_acceptance_criterion: 'Missing AC coverage',
  missing_edge_case: 'Missing edge case',
  contradiction: 'Contradiction',
  weak_assertion: 'Weak assertion',
  other: 'Other',
};

export function formatReviewMarkdown(slug: string, review: SpecReview): string {
  const lines: string[] = [];
  lines.push(`### AI Spec Review — \`${slug}\``);
  lines.push('');
  lines.push(`**Score: ${review.score}/10**`);
  lines.push('');
  lines.push(review.summary);
  lines.push('');

  if (review.gaps.length === 0) {
    lines.push('No gaps found.');
  } else {
    lines.push('| Severity | Category | Reference | Description |');
    lines.push('|---|---|---|---|');
    for (const gap of review.gaps) {
      const icon = SEVERITY_ICON[gap.severity] ?? '';
      const category = CATEGORY_LABEL[gap.category] ?? gap.category;
      const description = gap.description.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${icon} ${gap.severity} | ${category} | \`${gap.reference}\` | ${description} |`);
    }
  }
  return lines.join('\n');
}

export function formatReviewForConsole(slug: string, review: SpecReview): string {
  const header = `\n=== ${slug} — score ${review.score}/10 ===`;
  const gapLines = review.gaps.length
    ? review.gaps
        .map(
          (gap, i) =>
            `  ${i + 1}. [${gap.severity.toUpperCase()}] ${gap.category} (${gap.reference}): ${gap.description}`
        )
        .join('\n')
    : '  No gaps found.';
  return `${header}\n${review.summary}\n\n${gapLines}`;
}
