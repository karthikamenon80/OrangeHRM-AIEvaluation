import { Page } from '@playwright/test';
import { addDays, nextMonday } from './dates';

const API = '/web/index.php/api/v2/leave';

/** yyyy-mm-dd, the format the OrangeHRM REST API uses (unlike the UI's yyyy-dd-mm). */
function isoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

async function getJson<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${API}${path}`);
  if (!response.ok()) {
    throw new Error(`GET ${API}${path} failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/**
 * A Monday whose Mon-Fri are five full working days, so a "Mon-Fri" leave
 * request really costs 5.00 days. Picking "the next Monday" is not enough:
 * the shared demo has recurring public holidays (e.g. 11 and 12 November),
 * and a request spanning one counts fewer days, which made the suite fail
 * only in some weeks of the year.
 *
 * The whole span (Monday + `spanDays`) must also fall inside the current
 * leave period, because entitlements are granted per period: a request
 * that crosses into next year is rejected as "Leave Balance Exceeded".
 *
 * Reads the demo's own holiday list, work week and leave period through its
 * REST API, so `page` must already be logged in as an admin.
 */
export async function cleanWorkWeekMonday(page: Page, { minDaysAhead = 7, spanDays = 4 } = {}): Promise<Date> {
  const workWeek = await getJson<{ data: Record<string, number> }>(page, '/workweek?model=indexed');
  // 0 = full working day, 4 = half day, 8 = non-working day; keys are 0 (Sun) - 6 (Sat).
  const nonFullWeekdays = ['1', '2', '3', '4', '5'].filter((d) => workWeek.data[d] !== 0);
  if (nonFullWeekdays.length > 0) {
    throw new Error(`Work week has non-full weekdays (${nonFullWeekdays.join(', ')}); Mon-Fri tests assume 5 working days.`);
  }

  const periods = await getJson<{ meta: { currentLeavePeriod: { endDate: string } } }>(page, '/leave-periods');
  const periodEnd = periods.meta.currentLeavePeriod.endDate;

  const first = nextMonday(minDaysAhead);
  const holidays = await getJson<{ data: { date: string }[] }>(page, `/holidays?fromDate=${isoDate(first)}&toDate=${periodEnd}`);
  const holidayDates = new Set(holidays.data.map((h) => h.date));

  for (let monday = first; isoDate(addDays(monday, spanDays)) <= periodEnd; monday = addDays(monday, 7)) {
    const week = [0, 1, 2, 3, 4].map((i) => isoDate(addDays(monday, i)));
    if (!week.some((d) => holidayDates.has(d))) return monday;
  }
  throw new Error(
    `No holiday-free work week with ${spanDays} days of room left in the current leave period (ends ${periodEnd}). ` +
      'This happens in the last weeks of the year; run again once the new leave period has started.'
  );
}
