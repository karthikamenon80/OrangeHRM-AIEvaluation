import { SUBMIT_REVIEW_TOOL, SYSTEM_PROMPT } from './prompt.js';
import type { SpecReview } from './types.js';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';

interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: unknown }).type === 'tool_use'
  );
}

function assertIsSpecReview(value: unknown): asserts value is SpecReview {
  if (typeof value !== 'object' || value === null) {
    throw new Error('submit_review input was not an object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.score !== 'number' || typeof v.summary !== 'string' || !Array.isArray(v.gaps)) {
    throw new Error(`submit_review input missing required fields: ${JSON.stringify(value)}`);
  }
}

export async function runReview(userPrompt: string): Promise<SpecReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }
  const model = process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [SUBMIT_REVIEW_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_REVIEW_TOOL.name },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API request failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const data = (await response.json()) as { content?: unknown[] };
  const toolUse = (data.content ?? []).find(
    (block): block is ToolUseBlock => isToolUseBlock(block) && block.name === SUBMIT_REVIEW_TOOL.name
  );
  if (!toolUse) {
    throw new Error(`Claude did not call ${SUBMIT_REVIEW_TOOL.name}. Raw response: ${JSON.stringify(data)}`);
  }

  assertIsSpecReview(toolUse.input);
  return toolUse.input;
}
