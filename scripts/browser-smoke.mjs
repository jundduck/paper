// Usage: node scripts/browser-smoke.mjs [http://127.0.0.1:3000]
// Requires Node 22+ and Chrome/Chromium. Set CHROME_PATH to override its location.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.argv[2] || 'http://127.0.0.1:3000';
const dataPath = process.env.PAPER_STATIC === '1' ? 'data.json' : 'api/conferences';
const artifacts = join(root, 'artifacts');
const profile = join(artifacts, `browser-profile-${process.pid}`);
const downloads = join(artifacts, `downloads-${process.pid}`);
const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const checks = [], errors = [];
let socket, browser, intentionallyFailing = false;
await mkdir(downloads, { recursive: true });

async function until(check, message, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const result = await check(); if (result) return result; await sleep(100); }
  throw new Error(`Timed out: ${message}`);
}

try {
  const initial = await until(async () => {
    try { const response = await fetch((origin.endsWith("/") ? origin : origin + "/") + dataPath, { signal: AbortSignal.timeout(2000) }); return response.ok ? response.json() : null; }
    catch { return null; }
  }, 'local server startup');
  assert.equal(initial.conferences.length, 17, 'Expected the 17 requested venues');
  browser = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.on('data', chunk => { stderr += chunk; });
  browser.on('error', error => errors.push({ type: 'browser', message: error.message }));
  const devtoolsPort = await until(async () => {
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { if (browser.exitCode !== null) throw new Error(stderr); return null; }
  }, 'Chrome DevTools startup');
  const targets = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`).then(r => r.json());
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 1;
  const pending = new Map(), handlers = new Map();
  socket.addEventListener('message', async event => {
    const data = JSON.parse(event.data);
    if (data.id) { const call = pending.get(data.id); if (!call) return; pending.delete(data.id); clearTimeout(call.timer); if (data.error) call.reject(new Error(JSON.stringify(data.error))); else call.resolve(data.result); }
    else for (const handler of handlers.get(data.method) || []) await handler(data.params);
  });
  const on = (method, handler) => { handlers.set(method, [...(handlers.get(method) || []), handler]); };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const click = async selector => {
    const point = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing element'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  const select = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const search = value => evaluate(`(() => { const el = document.querySelector('#search'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const count = () => evaluate("document.querySelectorAll('#conference-rows tr').length");
  const key = async (key, code = key) => {
    const virtualKeyCode = { Tab: 9, Escape: 27, Enter: 13 }[key] || 0;
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode });
  };
  const screenshot = async name => { await evaluate('window.scrollTo(0, 0)'); await sleep(120); const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(artifacts, name), Buffer.from(result.data, 'base64')); };
  const check = (name, actual, expected = true) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log(`PASS ${name}`); };
  const loaded = () => until(async () => await count() === 17 && await evaluate("document.querySelector('#load-error').hidden"), 'all conference rows');

  on('Runtime.exceptionThrown', detail => errors.push({ type: 'exception', detail }));
  on('Runtime.consoleAPICalled', entry => { if (entry.type === 'error') errors.push({ type: 'console', entry }); });
  on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error' && !intentionallyFailing) errors.push({ type: 'log', message: entry.text, url: entry.url }); });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: origin }); await loaded();
  check('All 17 venues render', await count(), 17);
  check('Acceptance rate column follows event dates', await evaluate("document.querySelectorAll('thead th')[4].textContent"), '과거 Acceptance Rate');
  check('Every conference row has six columns', await evaluate("[...document.querySelectorAll('#conference-rows tr')].every(row => row.cells.length === 6)"));
  check('Published rates have source links and historical year', await evaluate("[...document.querySelectorAll('.acceptance-cell .acceptance-rate')].every(link => link.href.startsWith('https://') && /20\\d{2}/.test(link.parentElement.textContent)) && document.querySelectorAll('.acceptance-cell .acceptance-rate').length > 0"));
  check('Korean document encoding', await evaluate("document.querySelector('h1').textContent.includes('학회·저널 일정')"));
  check('Desktop has no page overflow', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  check('No automatic nearest-conference selection', await evaluate("document.querySelector('#next-deadline').textContent.includes('학회를 선택하세요')"));
  await click('[data-select="cvpr-2027"]');
  check('Chosen conference drives submission countdown', await evaluate("document.querySelector('.next-title').textContent.includes('CVPR') && document.querySelector('.next-title').textContent.includes('Submission Deadline')"));
  check('Exactly one conference has selection underline', await evaluate("document.querySelectorAll('.countdown-selected').length === 1 && document.querySelector('.countdown-selected').dataset.select === 'cvpr-2027'"));
  await cdp('Page.reload'); await loaded();
  check('Countdown selection survives reload', await evaluate("document.querySelector('.next-title').textContent.includes('CVPR') && document.querySelector('.countdown-selected').dataset.select === 'cvpr-2027'"));
  await click('[data-select="cvpr-2027"]');
  check('Clicking selected venue again clears selection', await evaluate("document.querySelectorAll('.countdown-selected').length === 0 && document.querySelector('#next-deadline').textContent.includes('학회를 선택하세요')"));
  await cdp('Page.reload'); await loaded();
  check('Cleared selection survives reload', await evaluate("document.querySelectorAll('[data-select][aria-pressed=\"true\"]').length === 0 && JSON.parse(localStorage.getItem('papertrail-selected')) === null"));
  check('Summary cards removed', await evaluate("document.querySelector('.stats-grid') === null"));
  await click('[data-select="neurips-2027"]');
  check('Unannounced selection stays selected', await evaluate("document.querySelector('.next-title').textContent.includes('NeurIPS') && document.querySelector('#countdown').textContent.includes('일정 미정')"));
  await click('[data-select="ra-l"]');
  check('Rolling journal selection has no invented countdown', await evaluate("document.querySelector('#countdown').textContent.includes('상시 투고')"));
  await click('[data-select="aaai-2028"]');
  check('Next edition waits for its own official deadline', await evaluate("document.querySelector('.next-title').textContent.includes('AAAI') && document.querySelector('#countdown').textContent.includes('일정 미정')"));
  await evaluate("localStorage.setItem('papertrail-selected', JSON.stringify('iclr-2027')); localStorage.setItem('papertrail-saved', JSON.stringify(['iclr-2027']))");
  await cdp('Page.reload'); await loaded();
  check('Selection migrates to new edition', await evaluate("JSON.parse(localStorage.getItem('papertrail-selected')) === 'iclr-2028' && document.querySelector('.countdown-selected').dataset.select === 'iclr-2028'"));
  check('Bookmark migrates to new edition', await evaluate("JSON.parse(localStorage.getItem('papertrail-saved')).includes('iclr-2028') && !JSON.parse(localStorage.getItem('papertrail-saved')).includes('iclr-2027')"));
  await evaluate("localStorage.setItem('papertrail-saved', '[]')");
  await cdp('Page.reload'); await loaded();
  await click('[data-select="cvpr-2027"]');
  await screenshot('desktop.png');

  for (const category of ['ai', 'robotics', 'driving']) {
    await click(`[data-category="${category}"]`);
    check(`Category ${category} count`, await count(), initial.conferences.filter(c => c.category === category).length);
  }
  await click('[data-category="all"]');
  await search('iclr'); check('Case-insensitive conference search', await count(), 1);
  await search('this-conference-does-not-exist'); check('Empty search state', await evaluate("!document.querySelector('#empty-state').hidden && document.querySelector('#list-view').hidden"));
  await click('#reset-filters'); check('Filters reset', await count(), 17);
  await select('#status-filter', 'rolling'); check('Journal filter', await count(), initial.conferences.filter(c => c.type === 'journal').length);
  await select('#status-filter', 'all');
  const years = [...new Set(initial.conferences.map(c => c.year).filter(Boolean))];
  const lastYear = Math.max(...years);
  await select('#year-filter', String(lastYear)); check('Year filter', await count(), initial.conferences.filter(c => c.year === lastYear).length);
  await select('#year-filter', 'all');

  const first = initial.conferences.find(c => c.acronym === 'ICLR');
  await click(`[data-save="${first.id}"]`);
  check('Saved state persisted', await evaluate(`JSON.parse(localStorage.getItem('papertrail-saved')).includes(${JSON.stringify(first.id)})`));
  await click('[data-nav="saved"]'); check('Saved view', await count(), 1);
  await cdp('Page.reload'); await loaded();
  check('Bookmark remains after reload', await evaluate(`document.querySelector('[data-save="${first.id}"]').getAttribute('aria-pressed')`), 'true');

  const timed = initial.conferences.find(c => c.deadline?.includes('T'));
  const dateOnly = initial.conferences.find(c => /^\d{4}-\d{2}-\d{2}$/.test(c.deadline || ''));
  const deadlineText = c => evaluate(`document.querySelector('[data-select="${c.id}"]').closest('tr').cells[2].innerText`);
  const dateBefore = dateOnly ? (await deadlineText(dateOnly)).split('\n')[0] : null;
  const timedBefore = timed ? await deadlineText(timed) : null;
  await select('#timezone', 'UTC');
  if (dateOnly) check('Date-only deadlines do not shift with timezone', (await deadlineText(dateOnly)).split('\n')[0], dateBefore);
  if (timed) check('Timed deadline converts to UTC', (await deadlineText(timed)).includes('UTC') && await deadlineText(timed) !== timedBefore);
  await select('#timezone', 'Asia/Seoul');

  await click(`.venue-details[data-detail="${first.id}"]`);
  check('Modal opens with accessible name', await evaluate("document.querySelector('#detail-dialog').open && !!document.getElementById(document.querySelector('#detail-dialog').getAttribute('aria-labelledby')).textContent"));
  check('Modal receives focus', await evaluate("document.querySelector('#detail-dialog').contains(document.activeElement)"));
  for (let n = 0; n < 6; n++) await key('Tab');
  check('Tab focus remains in modal', await evaluate("document.querySelector('#detail-dialog').contains(document.activeElement)"));
  await key('Escape');
  await until(() => evaluate(`!document.querySelector('#detail-dialog').open && document.activeElement.dataset.detail === '${first.id}'`), 'dialog close and focus restoration');
  check('Escape closes modal and restores focus', await evaluate(`!document.querySelector('#detail-dialog').open && document.activeElement.dataset.detail === '${first.id}'`));

  await click('[data-view="calendar"]');
  const title = await evaluate("document.querySelector('#calendar-title').textContent");
  await click('#calendar-next'); check('Calendar next month', await evaluate("document.querySelector('#calendar-title').textContent") !== title);
  await click('#calendar-prev'); check('Calendar previous month', await evaluate("document.querySelector('#calendar-title').textContent"), title);
  await click('#calendar-next'); await click('#calendar-today'); check('Calendar today', await evaluate("document.querySelector('#calendar-title').textContent"), title);
  check('Calendar complete week grid', await evaluate("document.querySelectorAll('.calendar-cell').length % 7 === 0"));
  await screenshot('calendar.png');
  await click('[data-view="list"]');

  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await click('a[download]');
  const filename = await until(async () => (await readdir(downloads)).find(f => f.endsWith('.ics')), 'calendar download');
  const ics = await readFile(join(downloads, filename), 'utf8');
  check('Actual ICS download has calendar and events', ics.startsWith('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT') && ics.includes('END:VCALENDAR'));
  await writeFile(join(artifacts, 'downloaded-calendar.ics'), ics);

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.scrollTo(0, 0)');
  check('Mobile has no page overflow', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  check('Mobile deadlines are visible without horizontal scrolling', await evaluate("(() => { const r = document.querySelector('#conference-rows tr td:nth-child(3)').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"));
  check('Mobile acceptance rate fits card', await evaluate("(() => { const r = document.querySelector('.acceptance-cell').getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; })()"));
  await screenshot('mobile.png');
  await click('[data-nav="saved"]'); check('Mobile saved navigation works', await count(), 1);
  await click('[data-nav="all"]');
  await click(`.venue-details[data-detail="${first.id}"]`);
  check('Mobile modal fits screen', await evaluate("(() => { const r = document.querySelector('dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"));
  await screenshot('mobile-detail.png'); await key('Escape');

  const baselineErrors = [...errors];
  on('Fetch.requestPaused', async ({ requestId }) => {
    await cdp('Fetch.fulfillRequest', { requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"error":"test unavailable"}').toString('base64') });
  });
  intentionallyFailing = true;
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*'+dataPath, requestStage: 'Request' }] });
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await until(() => evaluate("!document.querySelector('#load-error').hidden"), 'retained-data error message');
  check('Network error keeps last loaded rows', await count(), 17);
  check('Network error explains retained data', await evaluate("document.querySelector('#load-error').textContent.includes('마지막으로 불러온')"));
  await cdp('Page.reload');
  await until(() => evaluate("document.querySelector('#load-error') && !document.querySelector('#load-error').hidden"), 'initial-load error message');
  check('Initial load failure is visible', await evaluate("document.querySelector('#load-error').textContent.includes('일정을 불러오지 못했어요')"));
  await cdp('Fetch.disable'); intentionallyFailing = false;
  await cdp('Page.reload'); await loaded(); check('Recovered API hides error banner', await evaluate("document.querySelector('#load-error').hidden"));
  check('No browser console, runtime, or resource errors during normal use', baselineErrors, []);

  await writeFile(join(artifacts, 'browser-report.json'), JSON.stringify({ origin, testedAt: new Date().toISOString(), checks, errors, screenshots: ['desktop.png', 'mobile.png', 'calendar.png', 'mobile-detail.png'], venueCount: initial.conferences.length }, null, 2));
  console.log(`\n${checks.length} browser checks passed. Artifacts: ${artifacts}`);
} catch (error) {
  await writeFile(join(artifacts, 'browser-report.json'), JSON.stringify({ origin, testedAt: new Date().toISOString(), checks, errors, failure: error.stack }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), sleep(3000)]); }
  if (profile.startsWith(`${artifacts}\\`) || profile.startsWith(`${artifacts}/`)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  if (downloads.startsWith(`${artifacts}\\`) || downloads.startsWith(`${artifacts}/`)) await rm(downloads, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
}
