import { Page } from '@playwright/test';

/**
 * Number of system-user (login) accounts linked to an employee, read from
 * OrangeHRM's REST API with the page's admin session. The UI has no direct
 * "does this employee have a login" indicator on the employee record, so
 * this is the cleanest way to prove a login was, or was not, created
 * (spec: employee-onboarding AC-6 vs AC-7).
 */
export async function loginAccountCount(page: Page, empNumber: number): Promise<number> {
  const response = await page.request.get(`/web/index.php/api/v2/admin/users?empNumber=${empNumber}`);
  if (!response.ok()) {
    throw new Error(`GET admin/users failed: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { meta: { total: number } };
  return body.meta.total;
}
