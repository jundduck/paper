import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseExplicitDate, parseConference, stripHtml } from '../lib/parsers.mjs';
import { createCalendar } from '../lib/calendar.mjs';
import { ConferenceStore, fetchSource } from '../lib/sync.mjs';
import { createApp } from '../server.mjs';

const conference = (patch = {}) => ({ id: 'iclr-2027', acronym: 'ICLR', name: 'Learning Representations', category: 'ai', type: 'conference', year: 2027, sourceUrl: 'https://iclr.cc/Conferences/2027/CallForPapers', deadline: '2026-09-25T23:59:59-12:00', abstractDeadline: null, startDate: null, endDate: null, status: 'announced', verifiedAt: '2026-09-16T00:00:00Z', ...patch });
const iclrHtml = `<h1>ICLR 2027 Call for Papers</h1><p>The planned dates are as follows (all times are UTC-12h, aka Anywhere on Earth):</p><p><strong>Paper deadline</strong> Sep 25, 2026 11:59 PM AOE or <script>var paper_deadline = "2026/09/26 11:59:59 UTC";</script></p><p>Abstract deadline Sep 18, 2026 11:59 PM AOE <script>var abstract_deadline = "2026/09/19 11:59:59 UTC";</script></p>`;

test('explicit dates preserve source offset, date-only precision, and invalid dates are rejected', () => {
  assert.deepEqual(parseExplicitDate('September 16, 2026 (23:59 PST)'), { value: '2026-09-16T23:59:00-08:00', precision: 'time', timezone: 'PST' });
  assert.equal(parseExplicitDate('Sep 25, 2026 11:59 PM AOE').value, '2026-09-25T23:59:00-12:00');
  assert.equal(parseExplicitDate("Nov 16 '26 (Anywhere on Earth)").precision, 'date');
  assert.equal(parseExplicitDate('February 30, 2027'), null);
  assert.equal(parseExplicitDate('March 1, 2027 29:99 UTC'), null);
});

test('official ICLR countdown retains exact seconds and edition guard rejects old editions', () => {
  const parsed = parseConference(iclrHtml, conference());
  assert.equal(parsed.patch.deadline, '2026-09-25T23:59:59-12:00');
  assert.equal(parsed.patch.abstractDeadline, '2026-09-18T23:59:59-12:00');
  assert.equal(parsed.patch.deadlinePrecision, 'time');
  assert.deepEqual(parseConference(iclrHtml.replace(/ICLR 2027/, 'ICLR 2026') + '<p>Future conference 2027</p>', conference()).patch, {});
  assert.deepEqual(parseConference(iclrHtml.replace(/ICLR 2027/, 'ICLR 2026') + '<nav>Future meeting: ICLR 2027</nav>', conference()).patch, {});
  assert.deepEqual(parseConference(iclrHtml.replace(/ICLR/g, 'NeurIPS'), conference({ acronym: 'NeurIPS' })).patch, {});
});

test('an unrelated AoE mention does not invent a timezone for another deadline', () => {
  const result = parseConference('<h1>ICRA 2027</h1><p>Paper submission deadline: September 16, 2026 at 23:59</p><p>Workshop submissions: September 1, 2026 at 23:59 Anywhere on Earth</p>', conference({ acronym: 'ICRA' }));
  assert.equal(result.patch.deadline, '2026-09-16');
  assert.equal(result.patch.deadlinePrecision, 'date');
  assert.equal(result.patch.timezone, null);
});

test('ICRA extension, AAAI preceding dates, and IROS reversed table labels parse correctly', () => {
  const icra = parseConference('<h1>ICRA 2027</h1><p>Paper submission deadline: September 16, 2026 (23:59 PST)</p><p>will take place in Seoul on May 24-28, 2027.</p>', conference({ acronym: 'ICRA' }));
  assert.equal(icra.patch.deadline, '2026-09-16T23:59:00-08:00');
  assert.equal(icra.patch.startDate, '2027-05-24');
  const aaai = parseConference('<h1>AAAI-27</h1><p>July 21, 2026</p><p>Abstracts due at 11:59 PM UTC-12</p><p>July 28, 2026</p><p>Full papers due at 11:59 PM UTC-12</p>', conference({ acronym: 'AAAI' }));
  assert.equal(aaai.patch.deadline, '2026-07-28T23:59:00-12:00');
  assert.equal(aaai.patch.abstractDeadline, '2026-07-21T23:59:00-12:00');
  const iros = parseConference('<h1>2027 IEEE/RSJ IROS</h1><p>September 26, 2027 @ 12:00 am - October 1, 2027 @ 11:59 pm</p><table><tr><td>Mar 1, 2027</td><td>Paper submission deadline: IROS</td></tr></table>', conference({ acronym: 'IROS' }));
  assert.equal(iros.patch.deadline, '2027-03-01');
  assert.equal(iros.patch.deadlinePrecision, 'date');
  assert.equal(iros.patch.startDate, '2027-09-26');
  assert.equal(iros.patch.endDate, '2027-10-01');
  const itsc = parseConference('<h1>IEEE ITSC 2027</h1><p>September 21 – 24, 2027</p><p>Submission deadline for Regular & Special Session papers: March 1, 2027</p><p>Notification of Acceptance: May 1, 2027</p>', conference({ acronym: 'ITSC' }));
  assert.equal(itsc.patch.deadline, '2027-03-01');
  assert.equal(itsc.patch.notificationDate, '2027-05-01');
  assert.equal(itsc.patch.startDate, '2027-09-21');
  assert.equal(itsc.patch.endDate, '2027-09-24');
});

test('CVPR conference range includes workshops and exact official deadline instant', () => {
  const html = `<h1>CVPR 2027 Meeting Dates</h1><table><tr><td>Workshops and Tutorials</td><td>June 20-21, 2027</td></tr><tr><td>Main Conference Sessions</td><td>June 22-25, 2027</td></tr></table><h2>Dates and Deadlines</h2><p>Final Decisions |</p><p>Feb 25 '27 (Anywhere on Earth) |</p><p>Submission Deadline Nov 16 '26 (Anywhere on Earth)<script>var submission_deadline_1 = "2026/11/17 11:59:59 UTC";</script></p>`;
  const result = parseConference(html, conference({ acronym: 'CVPR' }));
  assert.equal(result.patch.deadline, '2026-11-16T23:59:59-12:00');
  assert.equal(result.patch.notificationDate, '2027-02-25');
  assert.equal(result.patch.startDate, '2027-06-20');
  assert.equal(result.patch.endDate, '2027-06-25');
});

test('HTML normalization keeps inline split dates and excludes scripts from change fingerprints', () => {
  assert.equal(stripHtml('<p><span>202</span><span>7</span> <b>ICRA</b></p><script nonce="dynamic">1</script>'), '2027 ICRA');
});

test('calendar converts AoE to UTC, excludes rolling/unknown, uses exclusive all-day end, escapes/folds UTF8', () => {
  const rows = [conference({ name: '한글 일정 '.repeat(30), startDate: '2027-04-26', endDate: '2027-04-30', location: 'Seoul, COEX; Hall' }), conference({ id: 'rolling', type: 'journal', status: 'rolling' }), conference({ id: 'unknown', deadline: null })];
  const ics = createCalendar(rows, new Date('2026-09-17T00:00:00Z'));
  assert.match(ics, /DTSTART:20260926T115959Z/);
  assert.match(ics, /DTEND;VALUE=DATE:20270501/);
  assert.match(ics, /LOCATION:Seoul\\, COEX\\; Hall/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
});

test('every venue has sourced result timing without presenting prior editions as current', async () => {
  const seed = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
  assert.equal(seed.conferences.length, 17);
  for (const row of seed.conferences) {
    if (row.type === 'journal') {
      assert.ok(row.notificationPolicy?.label, `${row.id} needs a decision policy`);
      assert.match(row.notificationPolicy.sourceUrl, /^https:\/\//);
      continue;
    }
    assert.ok(Number.isInteger(row.notification?.edition), `${row.id} needs a notification edition`);
    assert.match(row.notification.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(row.notification.date)));
    assert.ok(row.notification.edition <= row.year, `${row.id} notification cannot use a future edition`);
    assert.match(row.notification.sourceUrl, /^https:\/\//);
  }
});

test('failed fetch preserves verified fields, concurrent refresh shares one run, cache persists', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seedPath = join(dir, 'seed.json');
  const cachePath = join(dir, 'cache.json');
  await writeFile(seedPath, JSON.stringify({ updatedAt: '2026-09-16T00:00:00Z', conferences: [conference()] }));
  let calls = 0;
  const store = await new ConferenceStore({ seedPath, cachePath, fetchImpl: async () => { calls++; throw new Error('offline'); } }).initialize();
  const a = store.refresh();
  const b = store.refresh();
  assert.equal(a, b);
  await a;
  assert.equal(calls, 1);
  assert.equal(store.conferences[0].deadline, '2026-09-25T23:59:59-12:00');
  assert.equal(store.conferences[0].verifiedAt, '2026-09-16T00:00:00Z');
  assert.equal(store.sync.status, 'error');
  assert.equal(JSON.parse(await readFile(cachePath, 'utf8')).conferences[0].syncStatus, 'error');
});

test('unparsed source changes require review and do not claim date verification', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'seed.json'), JSON.stringify({ conferences: [conference({ acronym: 'RSS', deadline: null, status: 'pending' })] }));
  let text = `<h1>RSS 2027</h1><p>${'Conference information. '.repeat(8)}</p>`;
  let offline = false;
  const fetchImpl = async () => { if (offline) throw new Error('offline'); return new Response(text, { headers: { 'content-type': 'text/html' } }); };
  const options = { seedPath: join(dir, 'seed.json'), cachePath: join(dir, 'cache.json'), fetchImpl };
  const store = await new ConferenceStore(options).initialize();
  await store.refresh();
  text += '<p>A new announcement appeared.</p>';
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'review');
  assert.equal(store.conferences[0].deadline, null);
  assert.equal(store.conferences[0].verifiedAt, '2026-09-16T00:00:00Z');
  offline = true;
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'error');
  offline = false;
  const restarted = await new ConferenceStore(options).initialize();
  await restarted.refresh();
  assert.equal(restarted.conferences[0].syncStatus, 'review', 'A network failure and restart must not erase a pending review');
});


test('scoped monitoring ignores unrelated page churn but detects relevant publication changes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-scoped-monitor-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seedPath = join(dir, 'seed.json');
  const cachePath = join(dir, 'cache.json');
  const row = conference({ id: 'eccv-2028', acronym: 'ECCV', year: 2028, deadline: null, status: 'pending', monitorScope: 'edition' });
  await writeFile(seedPath, JSON.stringify({ conferences: [row] }));
  let html = `<h1>ECCV 2026</h1><p>${'Conference information. '.repeat(8)}</p>`;
  const store = await new ConferenceStore({ seedPath, cachePath, fetchImpl: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) }).initialize();
  await store.refresh();
  html += '<footer>Unrelated navigation changed.</footer>';
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'ok');
  html += '<p>ECCV 2028 dates will be announced here.</p>';
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'review');
});

test('rolling-journal monitoring ignores footer churn but detects submission policy changes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-journal-monitor-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seedPath = join(dir, 'seed.json');
  const cachePath = join(dir, 'cache.json');
  const row = conference({ id: 'tpami', acronym: 'TPAMI', name: 'IEEE Transactions on Pattern Analysis and Machine Intelligence', type: 'journal', year: null, deadline: null, status: 'rolling', monitorScope: 'rolling-journal' });
  await writeFile(seedPath, JSON.stringify({ conferences: [row] }));
  let html = `<h1>Call for Papers: ${row.name}</h1><p>TPAMI seeks submissions for upcoming issues.</p><h2>Submission Instructions</h2><p>${'General manuscript guidance. '.repeat(8)}</p>`;
  const store = await new ConferenceStore({ seedPath, cachePath, fetchImpl: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) }).initialize();
  await store.refresh();
  html += '<footer>Copyright year changed.</footer>';
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'ok');
  html = html.replace('seeks submissions for upcoming issues', 'submissions are closed');
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'review');
});

test('partial parser cannot clear missing fields or silently verify unparsed event changes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-partial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'seed.json'), JSON.stringify({ conferences: [conference({ startDate: '2027-04-26', endDate: '2027-04-30' })] }));
  let html = iclrHtml;
  const store = await new ConferenceStore({ seedPath: join(dir, 'seed.json'), cachePath: join(dir, 'cache.json'), fetchImpl: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) }).initialize();
  await store.refresh();
  html = iclrHtml.replace(/<p>Abstract deadline[\s\S]*$/, '<p>Abstract schedule changed. Please check the new instructions.</p>');
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'review');
  assert.equal(store.conferences[0].abstractDeadline, '2026-09-18T23:59:59-12:00');
  await store.refresh();
  assert.equal(store.conferences[0].syncStatus, 'review');
});

test('fetch rejects redirected host changes and oversized responses', async () => {
  await assert.rejects(fetchSource('https://iclr.cc/', { fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }) }), /호스트/);
  await assert.rejects(fetchSource('https://iclr.cc/', { fetchImpl: async () => new Response('x', { headers: { 'content-length': '3000000', 'content-type': 'text/html' } }) }), /크기/);
});

test('HTTP APIs deliver data/calendar, protect static paths, reject foreign refresh origins, enforce cooldown', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'paper-http-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'index.html'), '<h1>Paper</h1>');
  const store = { sync: { status: 'idle' }, running: null, snapshot: () => ({ conferences: [conference()], sync: { status: 'idle' } }), refresh: () => Promise.resolve() };
  const app = createApp({ store, publicDir: dir, publicOrigin: 'https://paper.example' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(`${base}/api/conferences`).then(r => r.json())).conferences.length, 1);
  assert.match(await fetch(`${base}/api/calendar.ics`).then(r => r.text()), /BEGIN:VCALENDAR/);
  assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST', headers: { origin: 'https://paper.example' } })).status, 202);
  assert.equal((await fetch(`${base}/api/refresh`, { method: 'POST', headers: { origin: 'https://paper.example' } })).status, 429);
  assert.equal((await fetch(`${base}/%2e%2e%5csecret`)).status, 400);
  assert.equal((await fetch(`${base}/`)).status, 200);
});
