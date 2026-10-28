import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AddEmployeePage } from '../pages/AddEmployeePage';
import { PersonalDetailsPage } from '../pages/PersonalDetailsPage';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../utils/env';
import { STRONG_PASSWORD, uniqueEmployeeId, uniqueUsername } from '../utils/testData';
import { loginAccountCount } from '../utils/api';

// Spec: openspec/changes/employee-onboarding/spec.md
test.describe('Employee Onboarding — Add Employee', () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);
  });

  // Spec AC-1: empty First/Last Name blocks Save with inline "Required" errors,
  // no server round trip (client-side validation only).
  test('AC-1: blocks Save with inline Required errors when First/Last Name are empty', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();

    await addEmployee.save();

    await expect(addEmployee.firstNameError).toHaveText('Required');
    await expect(addEmployee.lastNameError).toHaveText('Required');
    // No navigation happened — still on the Add Employee form.
    await expect(page).toHaveURL(/pim\/addEmployee/);
  });

  // Spec AC-2: Middle Name and Employee Id are optional — leaving both empty
  // (Employee Id is pre-filled, so it is cleared here) still saves.
  test('AC-2: saves with Middle Name and Employee Id left empty', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    const lastName = uniqueUsername('Optional');
    await addEmployee.fill({ firstName: 'QA', lastName });
    await addEmployee.employeeIdInput.clear();
    await addEmployee.save();

    await expect(addEmployee.successToast).toBeVisible();
    const details = new PersonalDetailsPage(page);
    await details.waitForLoaded();
    await expect(details.lastNameInput).toHaveValue(lastName);
    await expect(page.locator('input[name="middleName"]')).toHaveValue('');
    await expect(details.employeeIdInput).toHaveValue('');
  });

  // Spec AC-3/AC-4/AC-5: a duplicate username, a too-short password, and a
  // password/confirm mismatch are all reported simultaneously in one submit
  // (this is exactly how the spec documents the observed behavior — one
  // real round trip surfaces all three independent validation failures).
  test('AC-3/AC-4/AC-5: reports duplicate username, weak password, and mismatch together on one submit', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    await addEmployee.enableLoginDetails();

    await addEmployee.fill({
      firstName: 'QA',
      lastName: uniqueUsername('Onboarding'),
      username: ADMIN_USERNAME, // known to already exist
      password: 'abc', // under the 7-character minimum
      confirmPassword: 'xyz', // deliberately different from password
    });
    await addEmployee.save();

    // AC-3
    await expect(addEmployee.usernameError).toHaveText('Username already exists');
    // AC-4: both the length error and the strength badge.
    await expect(addEmployee.passwordError).toContainText('Should have at least 7 characters');
    await expect(addEmployee.passwordStrengthChip).toHaveText('Very Weak');
    // AC-5
    await expect(addEmployee.confirmPasswordError).toHaveText('Passwords do not match');
    // Nothing was created.
    await expect(page).toHaveURL(/pim\/addEmployee/);
  });

  // Spec edge case "Weak/short password boundary": length and strength are
  // separate signals — an 8-character password passes the length-7 minimum
  // but is still rated "Very Weak".
  test('edge case: a password long enough for the minimum can still be rated Very Weak', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    await addEmployee.enableLoginDetails();
    await addEmployee.fill({ firstName: 'QA', lastName: uniqueUsername('Strength'), password: 'abcdefgh' });

    await expect(addEmployee.passwordStrengthChip).toHaveText('Very Weak');
    await expect(addEmployee.passwordError).not.toContainText('Should have at least 7 characters');
  });

  // Spec AC-6: valid First/Last Name + unique username + matching strong
  // password succeeds, shows a success toast, and redirects to the new
  // employee's Personal Details page with the entered name and Employee Id
  // preserved — and a login account now exists for the employee.
  test('AC-6: creates the employee with a login and keeps the name and Employee Id', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    const employeeId = uniqueEmployeeId();
    await addEmployee.enableLoginDetails();

    const lastName = uniqueUsername('Onboarding');
    await addEmployee.fill({
      firstName: 'QA',
      lastName,
      employeeId,
      username: uniqueUsername('qa_onboard'),
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    });
    await addEmployee.save();

    await expect(addEmployee.successToast).toBeVisible();
    await addEmployee.waitForPersonalDetailsRedirect();
    const details = new PersonalDetailsPage(page);
    await details.waitForLoaded();
    await expect(details.firstNameInput).toHaveValue('QA');
    await expect(details.lastNameInput).toHaveValue(lastName);
    await expect(details.employeeIdInput).toHaveValue(employeeId);
    expect(await loginAccountCount(page, details.empNumber())).toBe(1);
  });

  // Spec AC-7: with Create Login Details left off, First + Last Name alone
  // save successfully and no login account is created.
  // Spec AC-8: every other Personal Details field (Nationality, Marital
  // Status, Date of Birth, Gender, ...) starts empty and is not required —
  // saving the Personal Details form untouched succeeds.
  test('AC-7/AC-8: saves without a login, creates no account, and leaves personal fields optional', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    await addEmployee.fill({ firstName: 'QA', lastName: uniqueUsername('NoLogin'), employeeId: uniqueEmployeeId() });
    await addEmployee.save();

    // AC-7
    await expect(addEmployee.successToast).toBeVisible();
    const details = new PersonalDetailsPage(page);
    await details.waitForLoaded();
    expect(await loginAccountCount(page, details.empNumber())).toBe(0);

    // AC-8
    await expect(details.selectValue('Nationality')).toHaveText('-- Select --');
    await expect(details.selectValue('Marital Status')).toHaveText('-- Select --');
    await expect(details.dateOfBirthInput()).toHaveValue('');
    for (const radio of await details.genderRadios.all()) {
      await expect(radio).not.toBeChecked();
    }
    await details.saveButton.click();
    await expect(details.successToast).toBeVisible();
    await expect(details.requiredErrors).toHaveCount(0);
  });

  // Spec edge case "Non-unique Employee Id": a second employee cannot reuse
  // an existing Employee Id — Save is blocked with "Employee Id already
  // exists". (This test corrected the Day 1 spec, which guessed the opposite.)
  test('edge case: a duplicate Employee Id is rejected with "Employee Id already exists"', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    const sharedId = uniqueEmployeeId();
    await addEmployee.fill({ firstName: 'QA', lastName: uniqueUsername('IdFirst'), employeeId: sharedId });
    await addEmployee.save();
    await new PersonalDetailsPage(page).waitForLoaded();

    await addEmployee.goto();
    await addEmployee.fill({ firstName: 'QA', lastName: uniqueUsername('IdSecond') });
    await addEmployee.employeeIdInput.fill(sharedId);
    await addEmployee.save();

    await expect(addEmployee.employeeIdError).toHaveText('Employee Id already exists');
    await expect(page).toHaveURL(/pim\/addEmployee/);
  });
});
