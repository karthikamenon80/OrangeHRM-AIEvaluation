import { Locator, Page } from '@playwright/test';
import { waitForAppReady } from '../utils/waits';

/**
 * The approver-side "Leave List" screen. Approve/Reject render as plain
 * labeled buttons inline in the row for another employee's request — but
 * NOT for the logged-in approver's own request (self-approval isn't
 * offered; that row only exposes a kebab menu with Cancel/View actions).
 * Tests must always act on a different employee's row than the one logged in.
 */
export class LeaveListPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/leave/viewLeaveList');
    await waitForAppReady(this.page);
  }

  get employeeNameInput(): Locator {
    return this.page.getByPlaceholder('Type for hints...');
  }

  get searchButton(): Locator {
    return this.page.getByRole('button', { name: 'Search' });
  }

  get successToast(): Locator {
    return this.page.locator('.oxd-toast-container').filter({ hasText: 'Successfully Updated' });
  }

  rowForEmployee(fullName: string): Locator {
    return this.page.locator('.oxd-table-card').filter({ hasText: fullName });
  }

  async filterByEmployee(fullName: string): Promise<void> {
    await this.employeeNameInput.fill(fullName);
    await this.page.getByRole('option', { name: fullName }).click();
    await this.searchButton.click();
  }

  async approve(employeeFullName: string): Promise<void> {
    await this.rowForEmployee(employeeFullName).getByRole('button', { name: 'Approve' }).click();
  }

  async reject(employeeFullName: string): Promise<void> {
    await this.rowForEmployee(employeeFullName).getByRole('button', { name: 'Reject' }).click();
  }
}
