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
  // Step 2: Appearance (Update 12: human avatar builder with sliders)
  await page.waitForSelector('#coach-avatar-preview');
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

// Pin a page's randomness: replaces Math.random with a seeded generator
// (mulberry32) before any game script runs. The new-game menu draws the world
// seed from Math.random, so this fixes the generated world — and every other
// Math.random roll — making a dynasty reproducible run to run. Call before the
// page navigates (newDynasty does this when given `seed`).
async function pinRandom(page, seed) {
  await page.addInitScript((s) => {
    let t = s >>> 0;
    Math.random = () => {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

// `seed` (optional): pin the world and every Math.random roll (see pinRandom)
// for a test whose assertions depend on the shape of the generated world.
async function newDynasty(page, { archetype = 'Developer', role = null, school = null, seed = null } = {}) {
  if (seed != null) await pinRandom(page, seed);
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await walkCoachWizard(page, { archetype, role });
  // School selection (optionally search for a specific program)
  await page.waitForSelector('.school-pick');
  if (school) {
    await page.fill('#school-search', school);
    await page.waitForTimeout(60);
  }
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');
  await skipTutorial(page);
}

// Update 15: a brand-new dynasty opens on the origin story + tutorial offer.
// Tests dismiss it (story → prompt → skip) unless they test the tutorial itself.
async function skipTutorial(page) {
  await page.waitForSelector('#tut-begin', { timeout: 5000 });
  await page.click('#tut-begin');
  await page.waitForSelector('#tut-skip');
  await page.click('#tut-skip');
  await page.waitForTimeout(80);
}

// The offseason Available Jobs popup opens over the shell (and blocks the
// Advance button) the first week offers exist. Tests that advance through the
// offseason via the UI close it with "Decide Later", as a player would.
async function dismissJobOffers(page) {
  const later = await page.$('#job-later');
  if (later) await later.click();
}

function wireErrors(page, errors) {
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
}

module.exports = { newDynasty, pinRandom, walkCoachWizard, skipTutorial, dismissJobOffers, wireErrors, launchOpts };
