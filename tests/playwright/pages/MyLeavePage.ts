import { Locator, Page } from '@playwright/test';
import { waitForAppReady } from '../utils/waits';

/**
 * The employee's own "My Leave" list — used to assert the balance/status
 * side effects of apply/approve/reject from the employee's point of view
 * (spec: leave-approval-workflow).
 */
export class MyLeavePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/leave/viewMyLeaveList');
    await waitForAppReady(this.page);
  }

  /** Row for a given date range, e.g. "2026-24-09" for a single-day request. */
  rowForDate(dateText: string): Locator {
    return this.page.locator('.oxd-table-card').filter({ hasText: dateText });
  }
}
