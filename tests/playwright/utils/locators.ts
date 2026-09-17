/**
 * oxd labels are matched by substring by default in Playwright's `hasText`,
 * which breaks when one label's text is a substring of another's (e.g.
 * "Password" vs "Confirm Password"). Anchor to the full (optionally
 * required-marked with a trailing "*") label text instead.
 */
export function exactLabel(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\*?$`);
}
