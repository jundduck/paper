import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConferenceStore } from './lib/sync.mjs';
import { createCalendar } from './lib/calendar.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const json = (res, status, data, headers = {}) => { res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };

export function createApp({ store, publicDir = resolve(ROOT, 'public'), refreshCooldownMs = 30000, publicOrigin = process.env.PUBLIC_ORIGIN } = {}) {
  let lastManualAt = 0;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/conferences' && req.method === 'GET') return json(res, 200, store.snapshot());
      if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { app: 'papertrail', status: 'ok', syncStatus: store.sync.status });
      if (url.pathname === '/api/refresh' && req.method === 'POST') {
        const origin = req.headers.origin;
        const expected = publicOrigin ?? `http://${req.headers.host}`;
        const secureExpected = `https://${req.headers.host}`;
        // Browser writes require same-origin proof; CLI can use X-Paper-Refresh: 1.
        if ((origin && origin !== expected && (publicOrigin || origin !== secureExpected)) || (!origin && req.headers['x-paper-refresh'] !== '1') || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '같은 사이트에서만 새로고침할 수 있습니다.' });
        if (store.running) return json(res, 202, { accepted: true, ...store.snapshot() });
        const elapsed = Date.now() - lastManualAt;
        if (elapsed < refreshCooldownMs) return json(res, 429, { error: '공식 사이트 보호를 위해 잠시 후 다시 확인해 주세요.', retryAfter: Math.ceil((refreshCooldownMs - elapsed) / 1000) }, { 'retry-after': String(Math.ceil((refreshCooldownMs - elapsed) / 1000)) });
        lastManualAt = Date.now();
        void store.refresh();
        return json(res, 202, { accepted: true, ...store.snapshot() });
      }
      if (url.pathname === '/api/calendar.ics' && req.method === 'GET') {
        const ids = url.searchParams.has('ids') ? new Set(url.searchParams.get('ids').split(',')) : null;
        const conferences = store.snapshot().conferences.filter(row => !ids || ids.has(row.id));
        res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="paper-conferences.ics"', 'cache-control': 'no-cache' });
        return res.end(createCalendar(conferences));
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'API를 찾을 수 없습니다.' });
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: '지원하지 않는 요청입니다.' }, { allow: 'GET, HEAD' });
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\')) return json(res, 400, { error: '잘못된 경로입니다.' });
      const requested = resolve(publicDir, `.${decoded === '/' ? '/index.html' : decoded}`);
      const canonicalRoot = await realpath(publicDir);
      const canonicalFile = await realpath(requested);
      if (!canonicalFile.startsWith(`${canonicalRoot}${sep}`)) return json(res, 403, { error: '허용되지 않은 경로입니다.' });
      const body = await readFile(canonicalFile);
      res.writeHead(200, { 'content-type': MIME[extname(canonicalFile)] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = ['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : error instanceof URIError ? 400 : 500;
      if (status === 500) console.error('요청 처리 실패:', error.message);
      if (!res.headersSent) json(res, status, { error: status === 404 ? '페이지를 찾을 수 없습니다.' : '요청을 처리하지 못했습니다.' });
      else res.end();
    }
  });
}

export async function startServer() {
  const intervalMinutes = Math.max(5, Math.min(1440, Number(process.env.SYNC_INTERVAL_MINUTES) || 60));
  const store = await new ConferenceStore({ seedPath: resolve(ROOT, 'data/seed.json'), cachePath: resolve(process.env.DATA_DIR || resolve(ROOT, 'data'), 'cache.json'), intervalMinutes }).initialize();
  const server = createApp({ store });
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT) || 3000;
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('error', error => { console.error(`서버 시작 실패: ${error.message}`); process.exitCode = 1; store.stop(); });
  server.listen(port, host, () => {
    console.log(`Papertrail · http://${host}:${port}`);
    console.log(`공식 출처 확인 주기: ${intervalMinutes}분. 서버가 실행 중일 때 자동 동기화합니다.`);
    if (process.env.DISABLE_AUTO_SYNC !== '1') store.start();
    else { store.sync.message = '자동 동기화가 꺼져 있습니다. 저장된 공식 일정만 표시합니다.'; }
  });
  const close = () => { store.stop(); server.close(); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
}
