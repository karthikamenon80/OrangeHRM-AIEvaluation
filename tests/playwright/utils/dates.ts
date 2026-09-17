/** OrangeHRM's leave date fields use yyyy-dd-mm (not ISO yyyy-mm-dd) — see spec: leave-balance-validation. */
export function toOhrmDate(date: Date): string {
  const yyyy = date.getFullYear();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${dd}-${mm}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * A Monday at least `minDaysAhead` days in the future, so date-range tests
 * never land on "today" or drift into the past as the suite ages, and never
 * collide with same-day data from a previous run.
 */
export function nextMonday(minDaysAhead = 7): Date {
  const date = addDays(new Date(), minDaysAhead);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysUntilMonday = (8 - day) % 7;
  return addDays(date, daysUntilMonday);
}

export { addDays };
