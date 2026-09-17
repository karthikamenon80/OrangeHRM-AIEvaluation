import { Page } from '@playwright/test';
import { waitForAppReady } from '../utils/waits';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/auth/login');
  }

  async login(username: string, password: string): Promise<void> {
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.locator('button[type="submit"]').click();
    await this.page.waitForURL(/dashboard\/index/);
    await waitForAppReady(this.page);
  }

  async logout(): Promise<void> {
    // A direct page.goto('/auth/logout') is unreliable here: OrangeHRM's
    // logout route performs its own follow-up redirect, which Playwright
    // can report as this navigation being aborted (net::ERR_ABORTED) —
    // and unlike a real link click, an aborted goto() can leave the page
    // exactly where it started rather than actually logging out. Driving
    // the real profile-menu link click matches what a user does and lets
    // Playwright track the resulting navigation correctly.
    await this.page.locator('.oxd-userdropdown-tab').click();
    await this.page.locator('a.oxd-userdropdown-link', { hasText: 'Logout' }).click();
    await this.page.waitForURL(/auth\/login/);
  }
}
