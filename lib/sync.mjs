import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseConference } from './parsers.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT = 15000;
const hashText = text => createHash('sha256').update(text).digest('hex');
const canonicalHost = hostname => hostname.toLowerCase().replace(/^www\./, '');

function monitoredText(text, conference) {
  if (conference.monitorScope === 'edition') {
    const year = String(conference.year ?? '');
    const acronym = conference.acronym.toLowerCase();
    const matches = text.split('\n').map(line => line.trim()).filter(line => {
      const lower = line.toLowerCase();
      return year && lower.includes(year) && lower.includes(acronym);
    });
    return matches.length ? matches.join('\n') : `${conference.id}:edition-not-announced`;
  }
  if (conference.monitorScope === 'rolling-journal') {
    const heading = `call for papers: ${conference.name}`.toLowerCase();
    const start = text.toLowerCase().indexOf(heading);
    const section = start >= 0 ? text.slice(start, start + 5000) : text;
    const matches = section.split('\n').map(line => line.trim()).filter(line => /seeks submissions|submission instructions|submissions? (?:due|deadline|are closed)|paper submission due|upcoming issues/i.test(line));
    return matches.length ? matches.join('\n') : `${conference.id}:submission-policy-not-found`;
  }
  return text;
}

/** Fixed seed sources only. Redirects cannot switch to arbitrary third-party/internal hosts. */
export async function fetchSource(url, { fetchImpl = fetch, timeout = DEFAULT_TIMEOUT } = {}) {
  const original = new URL(url);
  if (original.protocol !== 'https:' || original.username || original.password) throw new Error('HTTPS 공식 출처만 지원합니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let current = original;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const response = await fetchImpl(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': 'PaperConferenceTracker/1.0 (official schedule monitor; hourly)', accept: 'text/html,application/xhtml+xml' }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('출처의 리디렉션 주소가 없습니다.');
        const next = new URL(location, current);
        if (next.protocol !== 'https:' || canonicalHost(next.hostname) !== canonicalHost(original.hostname) || next.port !== original.port || next.username || next.password) throw new Error('공식 출처의 호스트가 변경되어 검토가 필요합니다.');
        current = next;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
      const type = response.headers.get('content-type') ?? '';
      if (type && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) { await response.body?.cancel(); throw new Error('공식 출처가 HTML 문서가 아닙니다.'); }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('문서 크기 제한을 초과했습니다.'); }
      if (!response.body) throw new Error('비어 있는 응답입니다.');
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_BYTES) { controller.abort(); throw new Error('문서 크기 제한을 초과했습니다.'); }
        chunks.push(Buffer.from(chunk));
      }
      return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: current.href };
    }
    throw new Error('출처 리디렉션 횟수를 초과했습니다.');
  } catch (error) {
    if (controller.signal.aborted && error.name === 'AbortError') throw new Error('공식 출처 응답 시간이 초과되었습니다.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function pooled(items, concurrency, action) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await action(items[index++]);
  }));
}

export class ConferenceStore {
  constructor({ seedPath, cachePath, intervalMinutes = 60, fetchImpl = fetch, now = () => new Date(), timeout = DEFAULT_TIMEOUT } = {}) {
    this.seedPath = seedPath;
    this.cachePath = cachePath;
    this.intervalMinutes = intervalMinutes;
    this.fetchImpl = fetchImpl;
    this.timeout = timeout;
    this.now = now;
    this.running = null;
    this.timer = null;
    this.automatic = false;
    this.conferences = [];
    this.sync = { lastAttemptAt: null, lastSuccessAt: null, nextSyncAt: null, intervalMinutes, status: 'idle', message: '저장된 공식 일정을 불러왔습니다. 자동 확인을 준비합니다.', sources: [] };
  }

  async initialize() {
    const seed = JSON.parse(await readFile(this.seedPath, 'utf8'));
    if (!Array.isArray(seed.conferences) || !seed.conferences.length) throw new Error('data/seed.json의 학회 목록이 비어 있습니다.');
    this.updatedAt = seed.updatedAt;
    let cache = null;
    try { cache = JSON.parse(await readFile(this.cachePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') console.warn('일정 캐시를 읽지 못해 공식 초기 데이터를 사용합니다:', error.message); }
    this.conferences = seed.conferences.map(conference => {
      const saved = cache?.conferences?.find(row => row.id === conference.id && row.sourceUrl === conference.sourceUrl);
      // A newly edited/verified seed must supersede an older cache. Seed metadata owns source URLs.
      if (!saved || new Date(saved.sourceCheckedAt ?? 0) < new Date(conference.verifiedAt ?? seed.updatedAt ?? 0)) return { ...conference };
      const dynamic = Object.fromEntries(['deadline', 'abstractDeadline', 'notificationDate', 'deadlinePrecision', 'timezone', 'status', 'startDate', 'endDate', 'verifiedAt', 'sourceCheckedAt', 'sourceHash', 'syncStatus', 'syncMessage', 'syncMode', 'autoUpdatedFields', 'previousParsedFields', 'reviewRequired', 'lastChangedAt', 'sourceFinalUrl'].filter(key => key in saved).map(key => [key, saved[key]]));
      return { ...conference, ...dynamic };
    });
    if (cache?.sync?.lastAttemptAt) this.sync = { ...this.sync, lastAttemptAt: cache.sync.lastAttemptAt, lastSuccessAt: cache.sync.lastSuccessAt ?? null, status: 'idle', message: '저장된 일정을 표시하고 공식 출처를 다시 확인합니다.' };
    return this;
  }

  snapshot() { return { updatedAt: this.updatedAt, conferences: this.conferences.map(({ sourceHash, previousParsedFields, ...row }) => row), sync: { ...this.sync, sources: [...this.sync.sources] } }; }

  start() {
    this.stop();
    this.automatic = true;
    void this.refresh();
  }

  stop() { this.automatic = false; if (this.timer) clearTimeout(this.timer); this.timer = null; }

  refresh() {
    if (this.running) return this.running;
    if (this.timer) clearTimeout(this.timer);
    this.running = this.#refresh().finally(() => {
      this.running = null;
      if (this.automatic) {
        this.sync.nextSyncAt = new Date(this.now().getTime() + this.intervalMinutes * 60000).toISOString();
        this.timer = setTimeout(() => { void this.refresh(); }, this.intervalMinutes * 60000);
        this.timer.unref();
      } else this.sync.nextSyncAt = null;
    });
    return this.running;
  }

  async #refresh() {
    const startedAt = this.now().toISOString();
    this.sync = { ...this.sync, lastAttemptAt: startedAt, nextSyncAt: new Date(this.now().getTime() + this.intervalMinutes * 60000).toISOString(), status: 'syncing', message: '공식 출처에서 일정과 페이지 변경을 확인하고 있습니다.', sources: [] };
    const sources = [];
    let failed = 0;
    let reviews = 0;
    let parsed = 0;
    let changed = 0;
    // At most three origins concurrently, and one request at a time per origin.
    const groups = new Map();
    for (const conference of this.conferences) {
      const host = new URL(conference.sourceUrl).hostname;
      if (!groups.has(host)) groups.set(host, []);
      groups.get(host).push(conference);
    }
    try {
      await pooled([...groups.values()], 3, async group => {
        for (const conference of group) {
          const checkedAt = this.now().toISOString();
          try {
            const { html, finalUrl } = await fetchSource(conference.sourceUrl, { fetchImpl: this.fetchImpl, timeout: this.timeout });
            const result = parseConference(html, conference);
            if (result.text.length < 100 || /just a moment|verify you are human|access denied|captcha/i.test(result.text.slice(0, 1000))) throw new Error('출처가 자동 접근을 제한하거나 유효한 문서를 반환하지 않았습니다.');
            const sourceHash = hashText(monitoredText(result.text, conference));
            const pageChanged = conference.sourceHash && conference.sourceHash !== sourceHash;
            const changedFields = result.fields.filter(field => conference[field] !== result.patch[field]);
            const previouslyParsed = conference.previousParsedFields ?? conference.autoUpdatedFields ?? [];
            const lostFields = previouslyParsed.some(field => !result.fields.includes(field));
            const unverifiedKnownFields = ['deadline', 'abstractDeadline', 'notificationDate', 'startDate', 'endDate'].some(field => conference[field] && !result.fields.includes(field));
            const needsReview = Boolean(((pageChanged || conference.reviewRequired || conference.syncStatus === 'review') && (!result.fields.length || unverifiedKnownFields)) || lostFields);
            conference.reviewRequired = needsReview;
            if (result.fields.length) {
              // Parsing only updates explicitly identified values. Missing dates never erase good data.
              Object.assign(conference, result.patch, { verifiedAt: checkedAt, autoUpdatedFields: result.fields, previousParsedFields: [...new Set([...previouslyParsed, ...result.fields])] });
              parsed++;
            }
            if (changedFields.length) { changed++; conference.lastChangedAt = checkedAt; }
            if (needsReview) reviews++;
            Object.assign(conference, { sourceCheckedAt: checkedAt, sourceHash, sourceFinalUrl: finalUrl, syncStatus: needsReview ? 'review' : 'ok', syncMode: result.mode, syncMessage: needsReview ? '공식 페이지가 변경되었습니다. 저장된 날짜를 유지하며 원문 검토가 필요합니다.' : result.reason });
            sources.push({ name: conference.acronym, url: conference.sourceUrl, status: needsReview ? 'review' : 'ok', checkedAt, mode: result.mode, parsedFields: result.fields, changedFields });
          } catch (error) {
            failed++;
            const message = String(error.cause?.code ? `${error.message} (${error.cause.code})` : error.message).slice(0, 250);
            Object.assign(conference, { sourceCheckedAt: checkedAt, syncStatus: 'error', syncMessage: `출처 확인 실패 · 이전 일정 유지: ${message}` });
            sources.push({ name: conference.acronym, url: conference.sourceUrl, status: 'error', checkedAt, error: message });
          }
          this.sync.sources = [...sources];
        }
      });
      const completedAt = this.now().toISOString();
      this.updatedAt = completedAt;
      this.sync = { ...this.sync, status: failed === this.conferences.length ? 'error' : failed || reviews ? 'partial' : 'ok', lastSuccessAt: failed < this.conferences.length ? completedAt : this.sync.lastSuccessAt, sources, message: `${this.conferences.length - failed}/${this.conferences.length}개 공식 출처 확인 · ${parsed}개 날짜 자동 해석 · ${changed}개 일정 변경${reviews ? ` · ${reviews}개 원문 검토 필요` : ''}${failed ? ` · ${failed}개 접속 실패, 이전 일정 유지` : ''}` };
      try {
        await mkdir(dirname(this.cachePath), { recursive: true });
        const temporaryPath = `${this.cachePath}.tmp`;
        await writeFile(temporaryPath, JSON.stringify({ updatedAt: this.updatedAt, conferences: this.conferences, sync: this.sync }, null, 2), 'utf8');
        await rename(temporaryPath, this.cachePath);
      } catch (error) {
        if (this.sync.status !== 'error') this.sync.status = 'partial';
        this.sync.message += ' · 캐시 저장 실패 (현재 프로세스에는 반영됨)';
        console.warn('일정 캐시 저장 실패:', error.message);
      }
    } catch (error) {
      this.sync.status = 'error';
      this.sync.message = `동기화 오류 · 이전 일정 유지: ${error.message}`;
    }
    return this.snapshot();
  }
}
