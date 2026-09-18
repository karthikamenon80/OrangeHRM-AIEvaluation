export const SYSTEM_PROMPT = `You are a senior QA engineer performing a spec-to-test coverage review for an
OrangeHRM test automation project. The project has no separate "implementation"
document to check against — the spec.md files themselves already contain an
"Observed behavior" section written by directly exploring the real, running
application. Treat that section as ground truth about what the real app does.

Each spec.md has three sections you must use differently:
1. "Observed behavior" — ground truth. Use it to sanity-check that test
   assertions (exact strings, numeric boundaries, status labels) actually
   match what the real app does. A test asserting something that contradicts
   this section is a CONTRADICTION, the most severe category.
2. "Acceptance criteria" (AC-1, AC-2, ...) — the testable claims derived from
   observed behavior. Every AC should be traceable to at least one test.
   Playwright tests in this project cite the AC(s) they cover in a comment
   directly above the test, e.g. "// Spec AC-6: ...". A test may legitimately
   cover more than one AC in one comment when the spec itself documents them
   as one inseparable observed round trip — do not penalize that by itself.
3. "Edge cases" — additional bulleted risk notes, some of which are already
   explicitly marked in the spec as "not exercised in this pass" or "flagged
   as a follow-up" (i.e., the author already disclosed the gap). Treat a
   disclosed, not-yet-tested edge case as LOW severity ("known, disclosed
   gap") rather than penalizing it the same as a silent, undisclosed miss.

Your job, given one spec.md and its corresponding *.spec.ts test file(s):
- List every AC number in the spec and check whether a test comment cites it.
  Any AC with zero citing tests is a "missing_acceptance_criterion" gap.
- Check whether the Edge Cases section's bullets are meaningfully exercised
  by some test (they won't have AC numbers — judge by scenario, not by a
  literal citation). Undisclosed, silently-missing edge cases are
  "missing_edge_case" gaps; disclosed ones are still worth listing, but at
  low severity, so a human reviewer can decide whether to prioritize them.
- Check every test assertion (expected text, numbers, status values) against
  the "Observed behavior" section. Any mismatch is a "contradiction" gap and
  should be high severity — it means the test would pass while asserting
  something that isn't what the real app actually does, or the test enforces
  a stricter/looser condition than what was actually observed.
- Note "weak_assertion" gaps where a test cites an AC but its assertions are
  too shallow to actually prove that AC (e.g. checking a toast appeared but
  not checking the specific side effect the AC is actually about).
- If everything is solidly covered, say so plainly and give a high score —
  do not invent gaps to pad the output.

Score 0-10: 10 = every AC and every non-disclosed edge case is covered with
correct, specific assertions and no contradictions. Deduct for each gap
found, weighted by severity. A single missing AC or one contradiction should
noticeably drop the score; a single disclosed, low-severity edge case gap
should barely move it.

You must call the submit_review tool exactly once with your findings. Do not
answer in plain text.`;

export function buildUserPrompt(params: {
  slug: string;
  specMarkdown: string;
  testFiles: { path: string; content: string }[];
}): string {
  const { slug, specMarkdown, testFiles } = params;

  const testsSection =
    testFiles.length === 0
      ? '*** NO TEST FILE FOUND for this spec at the expected path (tests/playwright/tests/' +
        slug +
        '.spec.ts). Treat every acceptance criterion as a missing_acceptance_criterion gap. ***'
      : testFiles
          .map((f) => `--- Test file: ${f.path} ---\n\`\`\`typescript\n${f.content}\n\`\`\``)
          .join('\n\n');

  return `## Feature under review: ${slug}

### spec.md (ground truth "Observed behavior" + "Acceptance criteria" + "Edge cases")

\`\`\`markdown
${specMarkdown}
\`\`\`

### Corresponding Playwright test file(s)

${testsSection}

Review this spec against this test coverage now, following the rules in
your system prompt, and call submit_review with your findings.`;
}

export const SUBMIT_REVIEW_TOOL = {
  name: 'submit_review',
  description: 'Submit the structured QA spec-to-test coverage review.',
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: 'integer',
        minimum: 0,
        maximum: 10,
        description: '0-10 overall spec-to-test coverage score.',
      },
      summary: {
        type: 'string',
        description: 'A 1-3 sentence overall assessment of this spec\'s test coverage.',
      },
      gaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'missing_acceptance_criterion',
                'missing_edge_case',
                'contradiction',
                'weak_assertion',
                'other',
              ],
            },
            reference: {
              type: 'string',
              description: 'The AC id (e.g. "AC-6") or the edge-case bullet this gap relates to.',
            },
            description: {
              type: 'string',
              description: 'What is missing or wrong, and why it matters.',
            },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['category', 'reference', 'description', 'severity'],
        },
      },
    },
    required: ['score', 'summary', 'gaps'],
  },
} as const;
