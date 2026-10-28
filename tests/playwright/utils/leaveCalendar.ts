import { Page } from '@playwright/test';
import { addDays, nextMonday } from './dates';
import { DEMO_OUTAGE_RETRIES, DEMO_OUTAGE_WAIT_MS } from './waits';

const API = '/web/index.php/api/v2/leave';

/** yyyy-mm-dd, the format the OrangeHRM REST API uses (unlike the UI's yyyy-dd-mm). */
function isoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/**
 * A 403 here, with a valid admin session, means someone switched the Leave
 * module off on the shared demo (see openScreen in ./waits). Retry like
 * openScreen does before giving up with an explanation.
 */
async function getJson<T>(page: Page, path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const response = await page.request.get(`${API}${path}`);
    if (response.ok()) return (await response.json()) as T;
    const detail = `GET ${API}${path} failed: ${response.status()} ${await response.text()}`;
    if (response.status() !== 403) throw new Error(detail);
    if (attempt > DEMO_OUTAGE_RETRIES) {
      throw new Error(
        `${detail}. Still forbidden after ${DEMO_OUTAGE_RETRIES} retries ${DEMO_OUTAGE_WAIT_MS / 1000} s apart: ` +
          'the Leave module is probably switched off on the shared OrangeHRM demo (Admin -> Configuration -> Modules). ' +
          'Someone else changed the demo; this is not a product or test bug. Re-run later.'
      );
    }
    console.warn(`[demo] ${API}${path} returned 403; retry ${attempt}/${DEMO_OUTAGE_RETRIES} in ${DEMO_OUTAGE_WAIT_MS / 1000} s.`);
    await page.waitForTimeout(DEMO_OUTAGE_WAIT_MS);
  }
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
