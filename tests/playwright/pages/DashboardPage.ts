import { Locator, Page } from '@playwright/test';
import { waitForAppReady } from '../utils/waits';

/** The home Dashboard; its "My Actions" widget is the approver's only in-app notification (spec: leave-approval-workflow). */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/dashboard/index');
    await waitForAppReady(this.page);
  }

  /** e.g. "(1) Leave Request to Approve" or, on the shared demo, "(3) Leave Requests to Approve". */
  get leaveRequestsToApprove(): Locator {
    return this.page.locator('p').filter({ hasText: /\(\d+\) Leave Requests? to Approve/ });
  }
}
