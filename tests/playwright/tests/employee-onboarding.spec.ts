import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AddEmployeePage } from '../pages/AddEmployeePage';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../utils/env';
import { STRONG_PASSWORD, uniqueUsername } from '../utils/testData';

// Spec: openspec/changes/employee-onboarding/spec.md
test.describe('Employee Onboarding — Add Employee', () => {
  test.beforeEach(async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);
  });

  // Spec AC-1: empty First/Last Name blocks Save with inline "Required" errors,
  // no server round trip (client-side validation only).
  test('blocks Save with inline Required errors when First/Last Name are empty', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();

    await addEmployee.save();

    await expect(addEmployee.firstNameError).toHaveText('Required');
    await expect(addEmployee.lastNameError).toHaveText('Required');
    // No navigation happened — still on the Add Employee form.
    await expect(page).toHaveURL(/pim\/addEmployee/);
  });

  // Spec AC-3/AC-4/AC-5: a duplicate username, a too-short password, and a
  // password/confirm mismatch are all reported simultaneously in one submit
  // (this is exactly how the spec documents the observed behavior — one
  // real round trip surfaces all three independent validation failures).
  test('reports duplicate username, weak password, and mismatch together on one submit', async ({ page }) => {
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
    // AC-4
    await expect(addEmployee.passwordError).toContainText('Should have at least 7 characters');
    // AC-5
    await expect(addEmployee.confirmPasswordError).toHaveText('Passwords do not match');
  });

  // Spec AC-6: valid First/Last Name + unique username + matching strong
  // password succeeds, shows a success toast, and redirects to the new
  // employee's Personal Details page.
  test('creates the employee and redirects to Personal Details on valid submit', async ({ page }) => {
    const addEmployee = new AddEmployeePage(page);
    await addEmployee.goto();
    await addEmployee.enableLoginDetails();

    const username = uniqueUsername('qa_onboard');
    await addEmployee.fill({
      firstName: 'QA',
      lastName: 'Onboarding',
      username,
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD,
    });
    await addEmployee.save();

    await expect(addEmployee.successToast).toBeVisible();
    await addEmployee.waitForPersonalDetailsRedirect();
  });
});
