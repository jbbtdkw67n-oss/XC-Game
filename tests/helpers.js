// Shared test helpers for the Update 1 test suite.
async function newDynasty(page, { archetype = 'Developer' } = {}) {
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  // Step 1: coach creation
  await page.waitForSelector('[data-arch]');
  await page.click(`[data-arch="${archetype}"]`);
  await page.click('#btn-next');
  // Step 2: school selection
  await page.waitForSelector('.school-pick');
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');
}

function wireErrors(page, errors) {
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
}

module.exports = { newDynasty, wireErrors };
