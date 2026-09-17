/**
 * The suite runs against a shared, publicly-writable OrangeHRM demo (see
 * playwright.config.ts) rather than an isolated local instance, and that
 * demo's data does not persist reliably between sessions. Every test that
 * needs an employee/login creates its own, uniquely named per run, so tests
 * never depend on fixture data left behind by a previous run or another
 * person using the same public demo.
 */
export function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function uniqueUsername(prefix: string): string {
  return `${prefix}_${uniqueSuffix()}`.slice(0, 40);
}

export const STRONG_PASSWORD = 'Str0ng!QaPass99';
