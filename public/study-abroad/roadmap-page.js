// Loads the shared conference schedule and renders the research roadmap below the map.
import { renderRoadmap } from '../roadmap.js';

const STATIC_MODE = document.querySelector('meta[name="paper-mode"]')?.content === 'static';
const host = document.querySelector('#research-roadmap');
let loaded = false, loading = false;

async function loadRoadmap() {
  if (!host || loading) return;
  loading = true;
  try {
    const response = await fetch(STATIC_MODE ? '../data.json' : '../api/conferences', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.conferences)) throw new Error('일정 데이터 형식이 올바르지 않습니다.');
    renderRoadmap(payload.conferences);
    loaded = true;
    host.removeAttribute('aria-busy');
  } catch {
    // Keep a previously rendered roadmap; only explain the failure when nothing is shown yet.
    if (loaded) return;
    host.removeAttribute('aria-busy');
    const message = host.querySelector('p') || host.appendChild(document.createElement('p'));
    message.className = 'rm-load-error';
    message.setAttribute('role', 'alert');
    message.textContent = '학회 일정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
  } finally {
    loading = false;
  }
}

loadRoadmap();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadRoadmap(); });
