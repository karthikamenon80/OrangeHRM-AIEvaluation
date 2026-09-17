import { Page } from '@playwright/test';

/**
 * OrangeHRM shows a full-page `.oxd-form-loader` overlay while a screen's
 * data loads, which intercepts pointer events until it's gone. The shared
 * public demo this suite targets (see playwright.config.ts) can be slow
 * under concurrent load from other users, so navigations wait for the
 * loader to clear before any Page Object interacts with the form.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page
    .locator('.oxd-form-loader')
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => {
      // No loader ever appeared for this screen — nothing to wait out.
    });
}
