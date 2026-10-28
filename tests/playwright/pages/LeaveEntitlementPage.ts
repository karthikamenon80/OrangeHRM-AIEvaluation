import { Locator, Page } from '@playwright/test';
import { exactLabel } from '../utils/locators';
import { waitForAppReady } from '../utils/waits';

export class LeaveEntitlementPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/leave/addLeaveEntitlement');
    await waitForAppReady(this.page);
    await this.employeeNameInput.waitFor();
  }

  /** The admin-facing list at Leave -> Entitlements -> Employee Entitlements. */
  async gotoList(): Promise<void> {
    await this.page.goto('/web/index.php/leave/viewLeaveEntitlements');
    await waitForAppReady(this.page);
    await this.employeeNameInput.waitFor();
  }

  get totalDaysText(): Locator {
    return this.page.getByText(/^Total \d+\.\d{2} Day\(s\)$/);
  }

  get searchButton(): Locator {
    return this.page.getByRole('button', { name: 'Search' });
  }

  /** Search the admin Entitlements list for one employee (use after gotoList()). */
  async searchForEmployee(fullName: string): Promise<void> {
    await this.selectEmployee(fullName);
    await this.searchButton.click();
  }

  get employeeNameInput(): Locator {
    return this.page.getByPlaceholder('Type for hints...');
  }

  get leaveTypeDropdown(): Locator {
    return this.page.locator('.oxd-select-text').first();
  }

  private fieldByLabel(label: string): Locator {
    return this.page
      .locator('.oxd-input-group')
      .filter({ has: this.page.locator('label').filter({ hasText: exactLabel(label) }) })
      .locator('input');
  }

  get entitlementInput(): Locator {
    return this.fieldByLabel('Entitlement');
  }

  get entitlementError(): Locator {
    return this.page
      .locator('.oxd-input-group')
      .filter({ has: this.page.locator('label').filter({ hasText: exactLabel('Entitlement') }) })
      .locator('.oxd-input-field-error-message');
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' });
  }

  get confirmUpdateButton(): Locator {
    return this.page.getByRole('button', { name: 'Confirm' });
  }

  /** "Updating Entitlement — Existing Entitlement value X will be updated to Y" (spec AC-5). */
  get replaceDialog(): Locator {
    return this.page.locator('.oxd-dialog-sheet').filter({ hasText: 'Updating Entitlement' });
  }

  async selectEmployee(fullName: string): Promise<void> {
    await this.employeeNameInput.fill(fullName);
    await this.page.getByRole('option', { name: fullName }).click();
  }

  async selectLeaveType(name: string): Promise<void> {
    await this.leaveTypeDropdown.click();
    await this.page.getByRole('option', { name, exact: true }).click();
  }

  async setEntitlement(value: string): Promise<void> {
    await this.entitlementInput.fill(value);
  }

  /**
   * Saves and, if the employee/type/period combination already has an
   * entitlement, confirms the "Existing Entitlement value X will be updated
   * to Y" replace dialog (spec: leave-balance-validation AC-5).
   */
  async save(): Promise<void> {
    await this.saveButton.click();
    try {
      await this.confirmUpdateButton.waitFor({ state: 'visible', timeout: 2_000 });
      await this.confirmUpdateButton.click();
    } catch {
      // No confirm dialog — this was a first-time entitlement, not a replace.
    }
  }

  /** Grants (or replaces) an entitlement for an existing employee in one call. */
  async grant(employeeFullName: string, leaveType: string, days: string): Promise<void> {
    await this.goto();
    await this.selectEmployee(employeeFullName);
    await this.selectLeaveType(leaveType);
    await this.setEntitlement(days);
    await this.save();
  }
}
