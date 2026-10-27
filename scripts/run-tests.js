#!/usr/bin/env node
/*
 * Test runner: runs every tests/test-*.js (each is a standalone script that
 * prints PASS/FAIL and exits non-zero on failure) in parallel, then prints a
 * summary. Logs land in tests/.logs/<name>.log.
 *
 *   npm test                      # everything except the long soak runs
 *   npm test -- --soak            # also the 40-season balance + 100-season soak
 *   npm test -- --jobs 4          # parallelism (default 2)
 *   npm test -- phase1 update12   # only tests whose name contains a filter
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');
const logsDir = path.join(testsDir, '.logs');

// Long soak runs (several minutes each) only run with --soak.
const SOAK = ['test-100seasons', 'test-update15-balance'];

const args = process.argv.slice(2);
const soak = args.includes('--soak');
const jobsIdx = args.indexOf('--jobs');
const jobs = jobsIdx >= 0 ? Math.max(1, parseInt(args[jobsIdx + 1], 10) || 2) : 2;
const filters = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--jobs');

const all = fs.readdirSync(testsDir)
  .filter((f) => /^test-.*\.js$/.test(f))
  .map((f) => f.replace(/\.js$/, ''))
  .sort();
const selected = all.filter((n) => (soak || filters.length || !SOAK.includes(n)) &&
  (!filters.length || filters.some((f) => n.includes(f))));

if (!selected.length) {
  console.log('No tests match.');
  process.exit(1);
}
fs.mkdirSync(logsDir, { recursive: true });

const results = [];
let next = 0;
const started = Date.now();

function runOne(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const log = fs.createWriteStream(path.join(logsDir, name + '.log'));
    const child = spawn(process.execPath, [path.join(testsDir, name + '.js')], { cwd: root });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('close', (code) => {
      log.end();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      results.push({ name, code, secs });
      console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${name}  (${secs}s)`);
      resolve();
    });
  });
}

async function worker() {
  while (next < selected.length) await runOne(selected[next++]);
}

console.log(`Running ${selected.length} test${selected.length === 1 ? '' : 's'} with ${jobs} worker${jobs === 1 ? '' : 's'}${soak ? ' (soak included)' : ''}…`);
Promise.all(Array.from({ length: Math.min(jobs, selected.length) }, worker)).then(() => {
  const failed = results.filter((r) => r.code !== 0);
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n${results.length - failed.length}/${results.length} passed in ${mins} min.`);
  if (failed.length) {
    console.log('Failed: ' + failed.map((r) => r.name).join(', '));
    console.log('Logs: tests/.logs/<name>.log');
  }
  process.exit(failed.length ? 1 : 0);
});
