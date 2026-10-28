import { defineConfig, devices } from '@playwright/test';

// Target defaults to OrangeHRM's official public demo — the same instance
// used to write the Day 1 specs — since Docker isn't set up in this
// environment yet. Point BASE_URL at a local docker-compose instance
// (see /docker) once that's available; nothing else needs to change.
const baseURL = process.env.BASE_URL ?? 'https://opensource-demo.orangehrmlive.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // Serialized on purpose: the suite runs against a shared public demo
  // instance, and several tests create their own employee/entitlement
  // fixtures via the real UI. Running workers in parallel here would risk
  // racing writes against that shared, uncontrolled instance.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // The JSON report is what the Day 6 quality gate reads for the pass rate
  // and per-test results (quality-gate/), so it is written on every run.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'results/results.json' }]]
    : [['list'], ['json', { outputFile: 'results/results.json' }]],
  // Generous headroom: the shared public demo (see baseURL above) can be
  // slow under load from other people using the same instance.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    // Trace/video recording adds real memory overhead per test; keep it for
    // CI's failure diagnostics but skip it for local runs on this dev box.
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
