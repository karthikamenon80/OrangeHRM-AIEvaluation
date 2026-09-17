import { Locator, Page } from '@playwright/test';
import { exactLabel } from '../utils/locators';
import { waitForAppReady } from '../utils/waits';

export class ApplyLeavePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/leave/applyLeave');
    await waitForAppReady(this.page);
  }

  private fieldByLabel(label: string): Locator {
    return this.page
      .locator('.oxd-input-group')
      .filter({ has: this.page.locator('label').filter({ hasText: exactLabel(label) }) });
  }

  get noLeaveTypesMessage(): Locator {
    return this.page.getByText('No Leave Types with Leave Balance');
  }

  get leaveTypeDropdown(): Locator {
    return this.page.locator('.oxd-select-text').first();
  }

  get fromDateInput(): Locator {
    return this.fieldByLabel('From Date').locator('input');
  }

  get toDateInput(): Locator {
    return this.fieldByLabel('To Date').locator('input');
  }

  get toDateError(): Locator {
    return this.fieldByLabel('To Date').locator('.oxd-input-field-error-message');
  }

  /** The `.orangehrm-leave-balance-text` class is purpose-built for this one value. */
  get leaveBalanceText(): Locator {
    return this.page.locator('.orangehrm-leave-balance-text');
  }

  get applyButton(): Locator {
    return this.page.getByRole('button', { name: 'Apply' });
  }

  get successToast(): Locator {
    return this.page.locator('.oxd-toast-container').filter({ hasText: 'Successfully Saved' });
  }

  get errorToast(): Locator {
    return this.page.locator('.oxd-toast-container').filter({ hasText: 'Leave Balance Exceeded' });
  }

  async selectLeaveType(name: string): Promise<void> {
    await this.leaveTypeDropdown.click();
    await this.page.getByRole('option', { name, exact: true }).click();
  }

  /**
   * Dates use the app's own yyyy-dd-mm text format, not a native date
   * picker. The balance/validity recalculation is blur-triggered, not
   * input-triggered, so each setter blurs the field afterwards — matching
   * what a real user does by tabbing or clicking away.
   */
  async setFromDate(yyyyDdMm: string): Promise<void> {
    await this.fromDateInput.fill(yyyyDdMm);
    await this.fromDateInput.blur();
  }

  async setToDate(yyyyDdMm: string): Promise<void> {
    await this.toDateInput.fill(yyyyDdMm);
    await this.toDateInput.blur();
  }

  async apply(): Promise<void> {
    await this.applyButton.click();
  }
}
