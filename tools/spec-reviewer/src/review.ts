import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getChangedFiles } from './changedFiles.js';
import { runReview } from './claudeClient.js';
import { formatReviewForConsole, formatReviewMarkdown } from './formatReview.js';
import { postOrUpdatePrComment } from './githubComment.js';
import { buildUserPrompt } from './prompt.js';
import { discoverAllFeatures, featureForSlug, REPO_ROOT, slugsForChangedFiles } from './specMap.js';
import type { FeatureTarget, SpecReview } from './types.js';

function parseArgs(argv: string[]) {
  const slugs: string[] = [];
  let all = false;
  let noComment = false;
  let outDir = path.join(import.meta.dirname, '..', 'reports');

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--slug') {
      slugs.push(argv[++i]);
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--no-comment') {
      noComment = true;
    } else if (arg === '--out') {
      outDir = argv[++i];
    }
  }
  return { slugs, all, noComment, outDir };
}

function resolveTargets(cliSlugs: string[], all: boolean): FeatureTarget[] {
  if (all) {
    return discoverAllFeatures();
  }
  if (cliSlugs.length > 0) {
    return cliSlugs
      .map((slug) => featureForSlug(slug))
      .filter((feature): feature is FeatureTarget => feature !== null);
  }

  // No explicit selection: figure out what changed. This is the path the
  // GitHub Action actually uses on every push/PR.
  const changed = getChangedFiles();
  const changedSlugs = slugsForChangedFiles(changed);
  if (changedSlugs.length > 0) {
    return changedSlugs
      .map((slug) => featureForSlug(slug))
      .filter((feature): feature is FeatureTarget => feature !== null);
  }

  console.log('[spec-reviewer] No changed spec/test files detected — reviewing all features.');
  return discoverAllFeatures();
}

async function reviewFeature(feature: FeatureTarget): Promise<SpecReview> {
  const specMarkdown = readFileSync(feature.specPath, 'utf8');
  const testFiles = feature.testPaths.map((p) => ({
    path: path.relative(REPO_ROOT, p),
    content: readFileSync(p, 'utf8'),
  }));
  const userPrompt = buildUserPrompt({ slug: feature.slug, specMarkdown, testFiles });
  return runReview(userPrompt);
}

async function main() {
  const { slugs, all, noComment, outDir } = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(slugs, all);

  if (targets.length === 0) {
    console.log('[spec-reviewer] No features to review.');
    return;
  }

  mkdirSync(outDir, { recursive: true });

  const markdownSections: string[] = [];
  let highestSeverityScore = 10;
  let sawHighSeverityGap = false;

  for (const feature of targets) {
    console.log(`[spec-reviewer] Reviewing "${feature.slug}"...`);
    const review = await reviewFeature(feature);

    console.log(formatReviewForConsole(feature.slug, review));

    const md = formatReviewMarkdown(feature.slug, review);
    markdownSections.push(md);

    writeFileSync(path.join(outDir, `${feature.slug}.json`), JSON.stringify(review, null, 2));
    writeFileSync(path.join(outDir, `${feature.slug}.md`), md);

    highestSeverityScore = Math.min(highestSeverityScore, review.score);
    sawHighSeverityGap ||= review.gaps.some((g) => g.severity === 'high');
  }

  const combinedMarkdown = markdownSections.join('\n\n---\n\n');
  writeFileSync(path.join(outDir, 'combined.md'), combinedMarkdown);

  if (!noComment) {
    await postOrUpdatePrComment(combinedMarkdown);
  }

  if (process.env.SPEC_REVIEWER_STRICT === '1' && sawHighSeverityGap) {
    console.error('[spec-reviewer] Failing: at least one HIGH severity gap was found (SPEC_REVIEWER_STRICT=1).');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[spec-reviewer] Failed:', error);
  process.exitCode = 1;
});
