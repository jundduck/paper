// Start locally and open the site; reuse an existing Papertrail server.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startServer } from '../server.mjs';

const port = Number(process.env.PORT) || 3000;
const address = `http://127.0.0.1:${port}`;
let running = false;
try {
  const response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1500) });
  running = response.ok && (await response.json()).app === 'papertrail';
} catch { /* No existing server. */ }
if (!running) {
  const { server } = await startServer();
  await once(server, 'listening');
} else console.log(`Papertrail is already running: ${address}`);

const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', address] : [address];
const browser = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' });
browser.on('error', () => console.log(`Open ${address} in your browser.`));
browser.unref();
