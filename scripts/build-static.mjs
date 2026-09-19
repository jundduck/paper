import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConferenceStore } from '../lib/sync.mjs';
import { createCalendar } from '../lib/calendar.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = await new ConferenceStore({ seedPath: resolve(root, 'data/seed.json'), cachePath: resolve(root, 'data/cache.json') }).initialize();
const snapshot = process.argv.includes('--offline') ? store.snapshot() : await store.refresh();
snapshot.sync.nextSyncAt = null;
snapshot.sync.intervalMinutes = 30;
const destination = resolve(root, 'dist');
await mkdir(destination, { recursive: true });
await cp(resolve(root, 'public'), destination, { recursive: true });
const assetVersion = encodeURIComponent(snapshot.updatedAt || Date.now());
const html = (await readFile(resolve(destination, 'index.html'), 'utf8'))
  .replace('<head>', '<head>\n  <meta name="paper-mode" content="static">')
  .replace('./api/calendar.ics', './calendar.ics')
  .replace('./styles.css', `./styles.css?v=${assetVersion}`)
  .replace('./app.js', `./app.js?v=${assetVersion}`);
await writeFile(resolve(destination, 'index.html'), html);
await writeFile(resolve(destination, 'data.json'), JSON.stringify(snapshot));
await writeFile(resolve(destination, 'calendar.ics'), createCalendar(snapshot.conferences));
await writeFile(resolve(destination, '.nojekyll'), '');
console.log(snapshot.sync.message);
console.log('Static site built: dist/');
