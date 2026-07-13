// Shared test helpers for the automated test suite.
const launchOpts = () => (process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});

// Walk the Update 6 multi-step coach creation wizard from the current step
// through the summary screen. Assumes the wizard is on Step 1 (Identity).
async function walkCoachWizard(page, { archetype = 'Developer', role = null } = {}) {
  // Step 1: Identity (role lives here now)
  await page.waitForSelector('#coach-first');
  if (role) await page.click(`[data-role="${role}"]`);
  await page.click('#btn-next');
  // Step 2: Appearance
  await page.waitForSelector('[data-portrait]');
  await page.click('#btn-next');
  // Step 3: Archetype (required)
  await page.waitForSelector('[data-arch]');
  await page.click(`[data-arch="${archetype}"]`);
  await page.click('#btn-next');
  // Step 4: Training philosophy (defaults to balanced)
  await page.waitForSelector('[data-tp]');
  await page.click('#btn-next');
  // Step 5: Race philosophy (defaults to even)
  await page.waitForSelector('[data-rp]');
  await page.click('#btn-next');
  // Step 6: Summary → confirm
  await page.waitForSelector('.wizard-summary-box');
  await page.click('#btn-next');
}

async function newDynasty(page, { archetype = 'Developer', role = null } = {}) {
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await walkCoachWizard(page, { archetype, role });
  // School selection
  await page.waitForSelector('.school-pick');
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');
}

function wireErrors(page, errors) {
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
}

module.exports = { newDynasty, walkCoachWizard, wireErrors, launchOpts };
