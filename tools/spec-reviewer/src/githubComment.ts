import { readFileSync } from 'node:fs';

interface PullRequestEvent {
  pull_request?: { number: number };
}

function getPullRequestNumber(): number | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as PullRequestEvent;
    return event.pull_request?.number ?? null;
  } catch {
    return null;
  }
}

/**
 * Posts (or updates) one PR comment containing every reviewed feature's
 * section, so re-running on new pushes to the same PR edits one comment
 * instead of spamming a new one each time.
 */
export async function postOrUpdatePrComment(bodyMarkdown: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  const prNumber = getPullRequestNumber();

  if (!token || !repo || !prNumber) {
    console.log('[spec-reviewer] Not running in a GitHub PR context (missing GITHUB_TOKEN/GITHUB_REPOSITORY/PR number) — skipping comment post.');
    return;
  }

  const marker = '<!-- ai-spec-reviewer -->';
  const body = `${marker}\n## 🤖 AI Spec Reviewer\n\n${bodyMarkdown}`;
  const apiBase = `https://api.github.com/repos/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'content-type': 'application/json',
  };

  const existing = await fetch(`${apiBase}/issues/${prNumber}/comments?per_page=100`, { headers });
  if (!existing.ok) {
    throw new Error(`Failed to list PR comments: ${existing.status} ${await existing.text()}`);
  }
  const comments = (await existing.json()) as { id: number; body: string }[];
  const previous = comments.find((c) => c.body.startsWith(marker));

  if (previous) {
    const update = await fetch(`${apiBase}/issues/comments/${previous.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body }),
    });
    if (!update.ok) {
      throw new Error(`Failed to update PR comment: ${update.status} ${await update.text()}`);
    }
    console.log(`[spec-reviewer] Updated existing PR comment #${previous.id}.`);
    return;
  }

  const create = await fetch(`${apiBase}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!create.ok) {
    throw new Error(`Failed to create PR comment: ${create.status} ${await create.text()}`);
  }
  console.log('[spec-reviewer] Posted new PR comment.');
}
