import { expect, Locator, Page } from '@playwright/test';
import { exactLabel } from '../utils/locators';
import { waitForAppReady } from '../utils/waits';

/**
 * PIM -> Employee -> Personal Details, where Add Employee redirects on
 * success (spec: employee-onboarding AC-6, AC-8). Its first form holds the
 * name, Employee Id and the optional personal fields.
 */
export class PersonalDetailsPage {
  constructor(private readonly page: Page) {}

  /** Waits for the form to finish loading the saved employee's data. */
  async waitForLoaded(): Promise<void> {
    await this.page.waitForURL(/pim\/viewPersonalDetails\/empNumber\/\d+/);
    await waitForAppReady(this.page);
    await this.firstNameInput.waitFor();
    // The inputs render empty first and are filled by a follow-up API call.
    await expect(this.firstNameInput).not.toHaveValue('');
  }

  /** The employee's internal number from the URL, used by the REST API. */
  empNumber(): number {
    const match = this.page.url().match(/empNumber\/(\d+)/);
    if (!match) throw new Error(`Not on a Personal Details page: ${this.page.url()}`);
    return Number(match[1]);
  }

  private personalForm(): Locator {
    return this.page.locator('form').filter({ has: this.page.locator('input[name="firstName"]') });
  }

  private fieldByLabel(label: string): Locator {
    return this.personalForm()
      .locator('.oxd-input-group')
      .filter({ has: this.page.locator('label').filter({ hasText: exactLabel(label) }) });
  }

  get firstNameInput(): Locator {
    return this.page.locator('input[name="firstName"]');
  }

  get lastNameInput(): Locator {
    return this.page.locator('input[name="lastName"]');
  }

  get employeeIdInput(): Locator {
    return this.fieldByLabel('Employee Id').locator('input');
  }

  /** Select-style fields show "-- Select --" when unset. */
  selectValue(label: string): Locator {
    return this.fieldByLabel(label).locator('.oxd-select-text-input');
  }

  dateOfBirthInput(): Locator {
    return this.fieldByLabel('Date of Birth').locator('input');
  }

  get genderRadios(): Locator {
    return this.personalForm().locator('input[type="radio"]');
  }

  get requiredErrors(): Locator {
    return this.personalForm().locator('.oxd-input-field-error-message');
  }

  get saveButton(): Locator {
    return this.personalForm().getByRole('button', { name: 'Save' });
  }

  get successToast(): Locator {
    return this.page.locator('.oxd-toast-container').filter({ hasText: 'Successfully Updated' });
  }
}
