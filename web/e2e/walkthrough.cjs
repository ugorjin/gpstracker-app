/**
 * Browser walkthrough of the dashboard against a running server with demo data.
 * Logs in as each demo role, clicks through every page on desktop and phone sizes,
 * checks permissions, and saves screenshots. Fails on any browser error.
 *
 *   cd server && npm run seed-demo && npm start          (WEB_DIST_DIR set, DEMO data loaded)
 *   node web/e2e/walkthrough.cjs ./screenshots http://localhost:3000
 *
 * Needs Playwright with Chromium (npx playwright install chromium).
 * Creates a customer "Ngozi Eze" and a tracker 868000111222333: re-seed a fresh database to run it again.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] ?? 'screenshots';
const BASE = process.argv[3] ?? 'http://localhost:3000';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function session(browser, ctxOpts, login, name, steps, password = 'demo-password') {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_FAILED|net::/.test(m.text())) { if (!/502/.test(m.text())) errors.push(`[${name}] console: ${m.text()}`); }; });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await page.goto(BASE + '/');
  await page.getByLabel('Phone number or email').fill(login);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Live', { exact: true }).waitFor({ timeout: 10000 });
  await steps(page, (n) => page.screenshot({ path: `${OUT}/${name}-${n}.png` }));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

  await session(browser, desktop, '0803 000 0101', 'fleet', async (page, shot) => {
    await page.locator('.vehicle-item').first().waitFor();
    await page.waitForTimeout(800);
    await shot('1-live');
    await page.locator('.vehicle-item', { hasText: 'Van – Island' }).click();
    await page.waitForTimeout(900);
    await shot('2-selected');
    await page.getByRole('button', { name: 'Cut engine' }).click();
    await shot('3-cut-dialog');
    const btn = page.locator('.modal-foot button.btn-danger');
    if (!(await btn.isDisabled())) errors.push('cut button should be disabled before typing plate');
    await page.locator('.modal input').fill('eky-552-aa');
    if (await btn.isDisabled()) errors.push('cut button should be enabled after typing plate');
    await btn.click();
    // No real vendor in this demo: expect the "can't reach the platform" error inside the dialog.
    await page.getByText(/Command (sent|not delivered)|Could not reach the tracking platform/).waitFor({ timeout: 30000 });
    await shot('4-cut-result');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'History' }).click();
    await page.locator('.stat').first().waitFor();
    await page.waitForTimeout(800);
    await shot('5-history');
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(1500);
    await shot('6-history-playing');
    await page.getByRole('link', { name: 'Alarms' }).click();
    await page.locator('table').waitFor();
    await shot('7-alarms');
    await page.getByRole('link', { name: 'Vehicles' }).click();
    await page.locator('table').waitFor();
    await shot('8-vehicles');
    // Expired vehicle shows renew notice
    await page.getByRole('link', { name: 'Live map' }).click();
    await page.locator('.vehicle-item', { hasText: 'Old pickup' }).click();
    await page.getByText(/subscription for this vehicle ended/i).waitFor();
    await shot('9-expired');
  });

  await session(browser, desktop, 'admin@demo.ng', 'admin', async (page, shot) => {
    await page.locator('.vehicle-item').first().waitFor();
    await page.waitForTimeout(800);
    await shot('1-live');
    await page.getByRole('link', { name: 'Customers' }).click();
    await page.locator('table').waitFor();
    await shot('2-customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    await page.getByRole('button', { name: 'Individual' }).click();
    await page.getByLabel('Full name').fill('Ngozi Eze');
    await page.locator('#customer-form').getByLabel('Phone').first().fill('0805 123 4567');
    await page.getByLabel('Temporary password').fill('ngozi-pass-1');
    await shot('3-new-customer');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByText('Ngozi Eze created').waitFor();
    await page.getByRole('link', { name: 'Vehicles' }).click();
    await page.locator('table').waitFor();
    await shot('4-vehicles');
    await page.getByRole('button', { name: 'Add tracker' }).click();
    await page.getByLabel('Tracker IMEI / device ID').fill('868000111222333');
    await page.getByLabel('Name').first().fill('Ngozi Corolla');
    await page.getByLabel('Plate number').fill('fst-101-ng');
    await page.getByLabel('Customer').selectOption({ label: 'Ngozi Eze' });
    await shot('5-add-tracker');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Tracker added').waitFor();
    await page.getByRole('link', { name: 'Users' }).click();
    await page.locator('table').waitFor();
    await shot('6-users');
  });

  // The newly created individual logs in and sees only her (silent) car.
  await session(browser, desktop, '08051234567', 'ngozi', async (page, shot) => {
    await page.getByText('Ngozi Corolla').first().waitFor();
    const count = await page.locator('.vehicle-item').count();
    if (count !== 1) errors.push(`ngozi should see 1 vehicle, saw ${count}`);
    await shot('1-live');
  }, 'ngozi-pass-1').catch((e) => errors.push('ngozi login failed: ' + e.message));

  // Operator: no Cut engine button.
  await session(browser, desktop, 'ops@lagoslogistics.ng', 'operator', async (page) => {
    await page.locator('.vehicle-item').first().click();
    await page.waitForTimeout(300);
    if (await page.getByRole('button', { name: 'Cut engine' }).count()) errors.push('operator should not see Cut engine');
  });

  const phone = { ...devices['iPhone 13'] };
  await session(browser, phone, '0803 000 0201', 'phone', async (page, shot) => {
    await page.locator('.vehicle-item').first().waitFor();
    await page.waitForTimeout(800);
    await shot('1-live');
    await page.locator('.vehicle-item').first().click();
    await page.waitForTimeout(800);
    await shot('2-detail');
    await page.getByRole('link', { name: 'History' }).click();
    await page.locator('.stat').first().waitFor();
    await shot('3-history');
    await page.getByRole('link', { name: 'Alarms' }).click();
    await page.waitForTimeout(500);
    await shot('4-alarms');
    await page.getByRole('link', { name: 'Account' }).click();
    await shot('5-account');
  });

  // Login page + wrong password
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.getByLabel('Phone number or email').fill('0803 000 0101');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Wrong login or password').waitFor();
  await page.screenshot({ path: `${OUT}/login-error.png` });

  await browser.close();
  console.log(errors.length ? 'PROBLEMS:\n' + errors.join('\n') : 'no problems found');
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error('FAILED', e); console.log(errors.join('\n')); process.exit(1); });
