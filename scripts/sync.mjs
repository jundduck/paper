import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConferenceStore } from '../lib/sync.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = await new ConferenceStore({ seedPath: resolve(root, 'data/seed.json'), cachePath: resolve(process.env.DATA_DIR || resolve(root, 'data'), 'cache.json') }).initialize();
const result = await store.refresh();
console.log(result.sync.message);
for (const source of result.sync.sources) console.log(`${source.name}: ${source.status}${source.error ? ` (${source.error})` : ` / ${source.mode}`}`);
if (result.sync.status === 'error') process.exitCode = 1;
