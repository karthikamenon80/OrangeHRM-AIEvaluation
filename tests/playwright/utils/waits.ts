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

/** How long to wait out a module that someone else disabled on the shared demo. */
export const DEMO_OUTAGE_RETRIES = 4;
export const DEMO_OUTAGE_WAIT_MS = 15_000;

/**
 * Opens an OrangeHRM screen and waits for it to be ready.
 *
 * Anyone using the shared public demo can switch a module off under
 * Admin -> Configuration -> Modules. The server then renders a
 * `<disabled-module>` placeholder ("403 Module Forbidden") instead of the
 * screen, for every user, until someone switches it back on. This happened
 * mid-run on 2026-10-28 (Leave, between two navigations 4 s apart). So
 * instead of failing later on a missing element, wait and retry for about a
 * minute, then fail with a message that names the real cause.
 */
export async function openScreen(page: Page, path: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const response = await page.goto(path);
    const html = response ? await response.text().catch(() => '') : '';
    if (!html.includes('<disabled-module')) break;
    if (attempt > DEMO_OUTAGE_RETRIES) {
      throw new Error(
        `${path} shows "403 Module Forbidden": this module is switched off on the shared OrangeHRM demo ` +
          `(Admin -> Configuration -> Modules), still after ${DEMO_OUTAGE_RETRIES} retries ` +
          `${DEMO_OUTAGE_WAIT_MS / 1000} s apart. Someone else changed the demo; this is not a product or test bug. Re-run later.`
      );
    }
    console.warn(`[demo] ${path} is disabled on the shared demo; retry ${attempt}/${DEMO_OUTAGE_RETRIES} in ${DEMO_OUTAGE_WAIT_MS / 1000} s.`);
    await page.waitForTimeout(DEMO_OUTAGE_WAIT_MS);
  }
  await waitForAppReady(page);
}
