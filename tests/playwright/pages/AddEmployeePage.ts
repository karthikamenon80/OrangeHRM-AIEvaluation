import { Locator, Page } from '@playwright/test';
import { exactLabel } from '../utils/locators';
import { waitForAppReady } from '../utils/waits';

export interface NewEmployeeDetails {
  firstName: string;
  lastName: string;
  middleName?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
}

export class AddEmployeePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/web/index.php/pim/addEmployee');
    await waitForAppReady(this.page);
    await this.page.locator('input[name="firstName"]').waitFor();
  }

  /**
   * oxd renders label + input as siblings inside one .oxd-input-group, with
   * no `for`/`id` link. Matched on exact label text — "Password" would
   * otherwise also match the "Confirm Password" group as a substring.
   */
  private fieldByLabel(label: string): Locator {
    return this.page
      .locator('.oxd-input-group')
      .filter({ has: this.page.locator('label').filter({ hasText: exactLabel(label) }) })
      .locator('input');
  }

  private errorFor(label: string): Locator {
    return this.page
      .locator('.oxd-input-group')
      .filter({ has: this.page.locator('label').filter({ hasText: exactLabel(label) }) })
      .locator('.oxd-input-field-error-message');
  }

  /**
   * First/Middle/Last Name have NO associated <label> at all (only a
   * placeholder) — the shared "Employee Full Name*" label wraps all three.
   * Their error message is a sibling within the input's own nearest
   * .oxd-input-group ancestor, so it has to be found relative to the input
   * itself rather than by label text.
   */
  private errorNearInput(input: Locator): Locator {
    return input.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " oxd-input-group ")][1]//span[contains(@class, "oxd-input-field-error-message")]'
    );
  }

  get firstNameInput(): Locator {
    return this.page.locator('input[name="firstName"]');
  }

  get lastNameInput(): Locator {
    return this.page.locator('input[name="lastName"]');
  }

  get middleNameInput(): Locator {
    return this.page.locator('input[name="middleName"]');
  }

  get firstNameError(): Locator {
    return this.errorNearInput(this.firstNameInput);
  }

  get lastNameError(): Locator {
    return this.errorNearInput(this.lastNameInput);
  }

  get usernameError(): Locator {
    return this.errorFor('Username');
  }

  get passwordError(): Locator {
    return this.errorFor('Password');
  }

  get confirmPasswordError(): Locator {
    return this.errorFor('Confirm Password');
  }

  get createLoginDetailsToggle(): Locator {
    // The real <input type="checkbox"> is visually hidden under the styled
    // <span class="oxd-switch-input">, which is what actually receives
    // pointer events — click the span, not the input underneath it.
    return this.page.locator('.oxd-switch-wrapper .oxd-switch-input');
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' });
  }

  get successToast(): Locator {
    return this.page.locator('.oxd-toast-container').filter({ hasText: 'Successfully Saved' });
  }

  async enableLoginDetails(): Promise<void> {
    await this.createLoginDetailsToggle.click();
    await this.fieldByLabel('Username').waitFor();
  }

  async fill(details: NewEmployeeDetails): Promise<void> {
    await this.firstNameInput.fill(details.firstName);
    await this.lastNameInput.fill(details.lastName);
    if (details.middleName) {
      await this.middleNameInput.fill(details.middleName);
    }
    if (details.username !== undefined) {
      await this.fieldByLabel('Username').fill(details.username);
    }
    if (details.password !== undefined) {
      await this.fieldByLabel('Password').fill(details.password);
    }
    if (details.confirmPassword !== undefined) {
      await this.fieldByLabel('Confirm Password').fill(details.confirmPassword);
    }
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /** URL becomes /pim/viewPersonalDetails/empNumber/{n} on success (spec AC-6). */
  async waitForPersonalDetailsRedirect(): Promise<void> {
    await this.page.waitForURL(/pim\/viewPersonalDetails\/empNumber\/\d+/);
  }
}
