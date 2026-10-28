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

/**
 * A 10-character Employee Id (the field's limit) unlikely to be taken.
 * Don't rely on the id Add Employee pre-fills: it is "the next free id"
 * when the form opened, and on the shared demo someone else can take it
 * before Save, which fails with "Employee Id already exists".
 */
export function uniqueEmployeeId(): string {
  return `${Date.now()}`.slice(-7) + `${Math.floor(Math.random() * 1000)}`.padStart(3, '0');
}

export const STRONG_PASSWORD = 'Str0ng!QaPass99';
