const STATIC_MODE = document.querySelector('meta[name="paper-mode"]')?.content === "static";
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  refresh: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  stack: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3v4c0 2 5 5 5 5s5-3 5-5V3M7 21v-4c0-2 5-5 5-5s5 3 5 5v4"/>',
  book: '<path d="M12 5v15M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  sort: '<path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  'chevron-left': '<path d="m14 6-6 6 6 6"/>',
  'chevron-right': '<path d="m10 6 6 6-6 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  infinity: '<path d="M12 12c-4-8-10-5-10 0s6 8 10 0 10-5 10 0-6 8-10 0Z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? escapeHtml(url.href) : '#'; } catch { return '#'; } };
const categories = { ai: 'AI', robotics: 'Robotics', driving: 'Autonomous Driving' };
const zoneNames = { 'Asia/Seoul': 'KST', 'Etc/GMT+12': 'AoE', UTC: 'UTC' };
const DAY = 86400000;
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode keeps session state. */ } },
};
const initialSaved = storage.get('papertrail-saved', []);
const state = {
  conferences: [], sync: {}, category: 'all', nav: 'all', view: 'list', search: '', year: 'all', status: 'all',
  timezone: storage.get('papertrail-timezone', 'Asia/Seoul'), saved: new Set(Array.isArray(initialSaved) ? initialSaved.filter(x => typeof x === 'string') : []),
  month: new Date().getMonth(), calendarYear: new Date().getFullYear(), reverse: false, loaded: false, next: null, selectedId: storage.get('papertrail-selected', null),
};
if (!(state.timezone in zoneNames)) state.timezone = 'Asia/Seoul';
$('#timezone').value = state.timezone;
let loading = false;
let toastTimer;
let refreshTimer;
let dialogReturnFocus = null;

function openDialog() {
  if ($('#detail-dialog').open) return;
  const active = document.activeElement;
  dialogReturnFocus = active?.dataset?.detail
    ? `${active.classList.contains('venue-details') ? '.venue-details' : ''}[data-detail="${CSS.escape(active.dataset.detail)}"]`
    : active?.id ? `#${CSS.escape(active.id)}` : null;
  $('#detail-dialog').showModal();
}

function dateOnly(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ''); }
function parts(value, zone = state.timezone) {
  if (!value) return null;
  if (dateOnly(value)) { const [year, month, day] = value.split('-'); return { year, month, day }; }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
function dateKey(value, zone = state.timezone) { const p = parts(value, zone); return p ? `${p.year}-${p.month}-${p.day}` : ''; }
function dateText(value, withTime = false) { const p = parts(value); return p ? `${p.year}.${p.month}.${p.day}${withTime && p.hour ? ` ${p.hour}:${p.minute} ${zoneNames[state.timezone]}` : ''}` : '확인 대기'; }
function longDate(value) { const p = parts(value); return p ? `${p.year}년 ${Number(p.month)}월 ${Number(p.day)}일${p.hour ? ` ${p.hour}:${p.minute} (${zoneNames[state.timezone]})` : ' · 시각 미발표'}` : '공식 발표 확인 대기'; }
function daysUntil(value) { if (!value) return null; return dateOnly(value) ? Math.round((Date.parse(value) - Date.parse(dateKey(new Date().toISOString()))) / DAY) : Math.ceil((Date.parse(value) - Date.now()) / DAY); }
function isPast(value) { return dateOnly(value) ? value < dateKey(new Date().toISOString()) : Date.parse(value) <= Date.now(); }
function statusOf(c) { return c.type === 'journal' || c.status === 'rolling' ? 'rolling' : !c.deadline ? 'pending' : isPast(c.deadline) ? 'closed' : 'upcoming'; }
function periodText(c) { if (!c.startDate) return c.type === 'journal' ? '저널 · 개최 일정 없음' : '개최일 확인 대기'; const start = parts(c.startDate); const end = parts(c.endDate); if (!end || c.startDate === c.endDate) return dateText(c.startDate); return `${start.year}.${start.month}.${start.day} – ${start.year === end.year ? '' : `${end.year}.`}${end.month}.${end.day}`; }
function badge(c) { return `<span class="category-badge ${escapeHtml(c.category)}"><i class="dot ${escapeHtml(c.category)}"></i>${escapeHtml(categories[c.category] || c.category)}</span>`; }
function sourceWarning(c) { return c.syncStatus === 'error' ? '출처 연결 실패 · 마지막 확인값' : c.syncStatus === 'review' ? '원문 변경 감지 · 재확인 필요' : !c.verifiedAt ? '원문 확인 필요' : ''; }
function showToast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }

function filteredConferences() {
  return state.conferences.filter(c => (state.nav !== 'saved' || state.saved.has(c.id)) && (state.category === 'all' || state.category === c.category) && (state.year === 'all' || String(c.year) === state.year) && (state.status === 'all' || statusOf(c) === state.status) && `${c.acronym} ${c.name} ${c.year ?? ''} ${c.location ?? ''}`.toLowerCase().includes(state.search.toLowerCase())).sort((a, b) => {
    const rank = { upcoming: 0, pending: 1, closed: 2, rolling: 3 };
    const group = rank[statusOf(a)] - rank[statusOf(b)];
    if (group) return group;
    const direction = state.reverse ? -1 : 1;
    if (a.deadline && b.deadline) return (Date.parse(a.deadline) - Date.parse(b.deadline)) * direction;
    return a.acronym.localeCompare(b.acronym) * direction;
  });
}
function renderStats() {
  $('#nav-total').textContent = state.conferences.length;
  $('#nav-saved').textContent = state.conferences.filter(c => state.saved.has(c.id)).length;

  const today = parts(new Date().toISOString(), 'Asia/Seoul');
  $('#today-date').textContent = `${today.year}. ${today.month}. ${today.day}`;
  $('#today-weekday').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' }).format(new Date());
}
function renderNext() {
  const c = state.conferences.find(c => c.id === state.selectedId);
  state.next = c?.deadline ? { conference: c, value: c.deadline, label: 'Submission Deadline' } : null;
  if (!c) {
    $('#next-deadline').innerHTML = '<div class="next-empty">카운트다운을 표시할 학회를 선택하세요.<p>아래 목록의 학회명을 누르면 선택한 항목에 밑줄이 표시됩니다.</p></div>';
    return;
  }
  const description = c.deadline ? dateText(c.deadline, true) + (dateOnly(c.deadline) ? ' · 시각 미발표' : '') : c.type === 'journal' ? '일반 논문 투고 기준' : '공식 제출 일정 발표 대기';
  $('#next-deadline').innerHTML = `<div><div class="next-eyebrow"><i class="status-dot"></i>SELECTED CONFERENCE</div><div class="next-title"><strong>${escapeHtml(c.acronym)} ${c.year || ''}</strong><span>Submission Deadline</span></div><div class="next-description">${escapeHtml(description)}${sourceWarning(c) ? ' · 원문 재확인 필요' : ''}</div></div><div class="countdown" id="countdown" aria-label="선택한 학회의 마감 상태">${!c.deadline ? `<span class="countdown-status">${c.type === 'journal' ? '상시 투고' : '일정 미정'}</span>` : ''}</div><button class="next-link" data-detail="${escapeHtml(c.id)}"><span class="link-text">일정 확인</span>${icon('arrow-up-right')}</button>`;
  tickCountdown();
}
function selectConference(id) {
  if (!state.conferences.some(c => c.id === id)) return;
  state.selectedId = state.selectedId === id ? null : id;
  storage.set('papertrail-selected', state.selectedId);
  renderNext();
  renderRows();
  document.querySelector(`[data-select="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}
function tickCountdown() {
  if (!state.next || !$('#countdown')) return;
  const value = state.next.value;
  if (isPast(value)) { $('#countdown').innerHTML = '<span class="countdown-status">마감됨</span>'; return; }
  if (dateOnly(value)) { $('#countdown').innerHTML = `<div class="countdown-part"><strong>${daysUntil(value)}</strong><span>DAYS · 날짜 기준</span></div>`; return; }
  const seconds = Math.max(0, Math.floor((Date.parse(value) - Date.now()) / 1000));
  const numbers = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  $('#countdown').innerHTML = numbers.map((number, index) => `${index ? '<span class="countdown-sep">:</span>' : ''}<div class="countdown-part"><strong>${String(number).padStart(2, '0')}</strong><span>${['DAYS', 'HOURS', 'MINS', 'SECS'][index]}</span></div>`).join('');
}
function deadlineMarkup(c) {
  const status = statusOf(c);
  if (status === 'rolling') return `<div class="rolling-text">${icon('infinity')}상시 투고</div><div class="deadline-sub">일반 논문 기준</div>`;
  if (!c.deadline) return `<div class="pending-text">${icon('hourglass')}확인 대기</div><div class="deadline-sub">공식 마감 미확인</div>`;
  const days = daysUntil(c.deadline);
  const calendarDays = Math.round((Date.parse(dateKey(c.deadline)) - Date.parse(dateKey(new Date().toISOString()))) / DAY);
  const text = status === 'closed' ? '마감됨' : calendarDays === 0 ? (dateOnly(c.deadline) ? '오늘 · 시각 미정' : 'D-DAY') : `D-${Math.max(0, calendarDays)}`;
  let sub = dateOnly(c.deadline) ? `${c.timezone ? `${c.timezone} 날짜 · ` : ''}시각·시간대 ${c.timezone ? '변환 없음' : '미발표'}` : `${parts(c.deadline).hour}:${parts(c.deadline).minute} ${zoneNames[state.timezone]}`;
  if (c.abstractDeadline && status !== 'closed') sub += ` · ${c.acronym === 'CVPR' ? '등록' : '초록'} ${isPast(c.abstractDeadline) ? '마감됨' : dateText(c.abstractDeadline).slice(5)}`;
  return `<div class="deadline-main"><span class="deadline-date">${dateText(c.deadline)}</span><span class="deadline-status ${status === 'closed' ? 'closed' : days <= 14 ? 'soon' : 'open'}">${text}</span></div><div class="deadline-sub">${escapeHtml(sub)}</div>`;
}
function acceptanceMarkup(c, detailed = false) {
  const history = (c.acceptanceHistory || []).filter(a => Number.isFinite(a.rate) && a.rate >= 0 && a.rate <= 100 && Number.isInteger(a.year)).slice().sort((a, b) => b.year - a.year);
  if (!history.length) return `<span class="acceptance-unknown">미확인</span>${detailed ? `<small>${escapeHtml(c.acceptanceNotes || '공개 통계 미확인')}</small>` : '<div class="acceptance-meta">공개 통계 미확인</div>'}`;
  return (detailed ? history : history.slice(0, 1)).map(a => `<div class="acceptance-entry"><a class="acceptance-rate" href="${safeUrl(a.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(c.acronym)} ${a.year}년 채택률 ${a.rate}% 출처" title="${escapeHtml(a.sourceName)}">${a.approximate ? '약 ' : ''}${a.rate}%${icon('arrow-up-right')}</a><div class="acceptance-meta">${a.year} · ${escapeHtml(a.track)}</div>${detailed ? `<small>${escapeHtml(a.sourceName)}${a.accepted != null && a.submitted != null ? ` · 채택 ${Number(a.accepted).toLocaleString()} / 제출 ${Number(a.submitted).toLocaleString()}편` : ''}<br>${escapeHtml(a.notes || '')}<br>자료 확인: ${escapeHtml(a.checkedAt)}</small>` : ''}</div>`).join('') + (detailed ? `<small>${escapeHtml(c.acceptanceNotes)}</small>` : '');
}
function renderRows() {
  const rows = filteredConferences();
  $('#result-count').textContent = rows.length;
  $('#showing-count').textContent = `${state.conferences.length}개 학회·저널 중 ${rows.length}개 표시`;
  $('#conference-rows').innerHTML = rows.map(c => `<tr data-area="${escapeHtml(c.category)}">
    <td><div class="venue-main"><button class="venue-link ${state.selectedId === c.id ? 'countdown-selected' : ''}" data-select="${escapeHtml(c.id)}" aria-pressed="${state.selectedId === c.id}" title="상단 카운트다운에 표시">${escapeHtml(c.acronym)}<span class="venue-year">${c.year || ''}</span></button><button class="venue-details" data-detail="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.acronym)} 상세 일정">${icon('info')}</button>${c.type === 'journal' ? '<span class="venue-abbreviation">J</span>' : ''}</div><div class="venue-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</div></td>
    <td>${badge(c)}</td><td>${deadlineMarkup(c)}${sourceWarning(c) ? `<div class="deadline-sub warning">${sourceWarning(c)}</div>` : ''}</td>
    <td><div class="${c.startDate ? 'deadline-date' : 'pending-text'}">${periodText(c)}</div>${c.location ? `<div class="location">${icon('pin')}${escapeHtml(c.location)}</div>` : ''}</td>
    <td class="acceptance-cell">${acceptanceMarkup(c)}</td>
    <td><button class="save-button ${state.saved.has(c.id) ? 'saved' : ''}" data-save="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.acronym)} ${state.saved.has(c.id) ? '저장 해제' : '저장'}" aria-pressed="${state.saved.has(c.id)}">${icon('bookmark')}</button></td></tr>`).join('');
  $('#empty-state').hidden = rows.length > 0;
  $('#list-view').hidden = state.view !== 'list' || rows.length === 0;
  $('#calendar-view').hidden = state.view !== 'calendar' || rows.length === 0;
  if (state.view === 'calendar') renderCalendar(rows);
  document.querySelectorAll('[data-category]').forEach(el => { const active = el.dataset.category === state.category; el.classList.toggle('active', active); el.setAttribute('aria-pressed', active); });
  document.querySelectorAll('[data-area]').forEach(el => el.classList.toggle('active', el.dataset.area === state.category));
  document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === state.nav; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === state.view; el.classList.toggle('active', active); el.setAttribute('aria-pressed', active); });
  const title = state.nav === 'saved' ? '저장한 학회' : state.view === 'calendar' ? '일정 캘린더' : '전체 일정';
  $('#schedule-title').textContent = title;
  $('#breadcrumb-current').textContent = title;
}
function renderCalendar(rows) {
  const year = state.calendarYear, month = state.month;
  $('#calendar-title').textContent = `${year}년 ${month + 1}월`;
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const milestones = rows.flatMap(c => [
    ...(c.deadline ? [{ c, date: dateKey(c.deadline), type: 'paper', label: '본문' }] : []),
    ...(c.abstractDeadline ? [{ c, date: dateKey(c.abstractDeadline), type: 'abstract', label: c.acronym === 'CVPR' ? '등록' : '초록' }] : []),
    ...(c.startDate ? [{ c, date: c.startDate, type: 'start', label: '개최' }] : []),
  ]);
  const today = dateKey(new Date().toISOString());
  $('#calendar-grid').innerHTML = Array.from({ length: cellCount }, (_, i) => {
    const d = new Date(year, month, i - firstWeekday + 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `<div class="calendar-cell ${d.getMonth() !== month ? 'outside' : ''} ${key === today ? 'today' : ''}"><span class="calendar-number">${d.getDate()}</span>${milestones.filter(e => e.date === key).map(e => `<button class="calendar-event ${e.type}" data-detail="${escapeHtml(e.c.id)}" title="${escapeHtml(e.c.acronym)} ${e.label} · ${key}">${escapeHtml(e.c.acronym)} ${e.label}</button>`).join('')}</div>`;
  }).join('');
}
function renderSync() {
  const s = state.sync;
  const busy = s.status === 'syncing';
  $('#refresh').disabled = busy;
  $('#refresh').classList.toggle('spinning', busy);
  const checked = s.lastAttemptAt ? dateText(s.lastAttemptAt, true) : '';
  const statusText = STATIC_MODE && s.lastAttemptAt && Date.now() - Date.parse(s.lastAttemptAt) > 3 * 3600000 ? '정기 갱신 지연 · 마지막 확인값' : busy ? '공식 출처 확인 중' : s.status === 'error' ? '갱신 실패 · 저장된 일정 표시' : s.status === 'partial' ? '일부 출처 재확인 필요' : s.lastAttemptAt ? '출처 확인 완료' : '초기 확인 데이터';
  $('#sync-summary').textContent = `${statusText}${checked ? ` · ${checked}` : ''}`;
  $('#sync-summary').title = `${s.message || ''}\n다음 갱신: ${s.nextSyncAt ? dateText(s.nextSyncAt, true) : STATIC_MODE ? '매시간 정기 실행 · 지연 가능' : '서버 시작 후 예약'}`;
  if (busy && !refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; fetchData(); }, 2500);
}
function renderAll() { renderStats(); renderNext(); renderRows(); renderSync(); }

function showDetail(id) {
  const c = state.conferences.find(c => c.id === id);
  if (!c) return;
  const sourceStatus = sourceWarning(c);
  const original = c.deadline && !dateOnly(c.deadline) ? `${c.deadline.replace('T', ' ').replace(/([+-]\d\d:\d\d|Z)$/, '')} ${c.timezone || ''}` : '';
  $('#dialog-content').innerHTML = `<div class="dialog-eyebrow">${c.type === 'journal' ? 'JOURNAL' : 'CONFERENCE'} DETAILS</div><h2 class="dialog-title" id="dialog-title">${escapeHtml(c.acronym)} ${c.year || ''}</h2><p class="dialog-subtitle">${escapeHtml(c.name)}</p><div class="dialog-badges">${badge(c)}<span class="category-badge">${c.type === 'journal' ? '상시 투고 저널' : `${c.year} 학회`}</span></div>
  <dl class="detail-grid"><dt class="submission-label">Submission Deadline</dt><dd class="submission-value">${c.type === 'journal' ? '상시 투고 · 일반 논문' : escapeHtml(longDate(c.deadline))}${original ? `<small>원문: ${escapeHtml(original)}</small>` : ''}${dateOnly(c.deadline) ? `<small>${escapeHtml(c.timezone || '시간대 미발표')} · 날짜만 발표되어 시간대 변환을 하지 않습니다.</small>` : ''}</dd>
  ${c.abstractDeadline ? `<dt>${c.acronym === 'CVPR' ? '논문 등록 마감' : '초록 제출 마감'}</dt><dd>${escapeHtml(longDate(c.abstractDeadline))}${isPast(c.abstractDeadline) && !isPast(c.deadline) ? '<small>사전 등록이 마감되었습니다. 기존 등록 논문의 본문 제출 여부를 공식 안내에서 확인하세요.</small>' : ''}</dd>` : ''}
  <dt>개최 일정</dt><dd>${periodText(c)}</dd><dt>장소</dt><dd>${escapeHtml(c.location || (c.type === 'journal' ? '해당 없음' : '발표 대기'))}</dd>
  <dt>과거 Acceptance Rate</dt><dd>${acceptanceMarkup(c, true)}</dd>
  <dt>갱신 방식</dt><dd>${c.syncMode === 'automatic' ? '공식 날짜 자동 반영' : c.syncMode === 'monitor' ? '공식 페이지 변경 감지' : '초기 자료 · 출처 접속 확인 대기'}<small>${c.syncMode === 'monitor' ? '변경 시 재확인 표시 · 날짜는 원문 검토 후 반영합니다.' : '안전하게 해석할 수 있는 일정 항목만 자동 반영합니다.'}</small></dd>
  <dt>일정 확인</dt><dd>${c.verifiedAt ? escapeHtml(dateText(c.verifiedAt, true)) : '공식 원문 재확인 필요'}<small>${escapeHtml(sourceStatus || '공식 자료를 기준으로 확인했습니다.')}</small></dd>
  ${c.sourceCheckedAt ? `<dt>최근 출처 접속</dt><dd>${escapeHtml(dateText(c.sourceCheckedAt, true))}<small>출처 접속 시각과 일정 검증 시각은 다를 수 있습니다.</small></dd>` : ''}</dl>
  ${c.notes ? `<div class="detail-note">${c.autoUpdatedFields?.length ? '<strong>초기 확인 메모 · 자동 갱신 전 기준</strong><br>' : ''}${escapeHtml(c.notes)}</div>` : ''}
  <div class="dialog-actions"><a class="button primary" href="${safeUrl(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 일정 확인${icon('arrow-up-right')}</a><a class="button secondary" href="${safeUrl(c.website)}" target="_blank" rel="noopener noreferrer">홈페이지${icon('arrow-up-right')}</a><button class="button secondary" data-save="${escapeHtml(c.id)}">${icon('bookmark')}${state.saved.has(c.id) ? '저장 해제' : '학회 저장'}</button></div>`;
  openDialog();
}
function showSources() {
  const s = state.sync;
  $('#dialog-content').innerHTML = `<div class="dialog-eyebrow">A NOTE ON OUR DATA</div><h2 class="dialog-title" id="dialog-title">믿을 수 있는 일정의 기준</h2><div class="source-description"><p>공식 홈페이지와 논문 모집 공고를 우선합니다. 아직 확인되지 않은 마감일은 비워두고, 저널의 일반 투고는 상시 투고로 구분합니다.</p><p>공식 출처는 <strong>${Number(s.intervalMinutes) || 60}분 간격</strong>으로 확인합니다. 이 화면은 1분마다 공개된 결과를 불러옵니다. ${STATIC_MODE ? "화면 새로고침은 최신 공개 데이터를 다시 읽습니다. 예약 실행은 지연되거나 중단될 수 있습니다." : ""} 원문 변경 직후의 즉시 반영을 보장하지는 않습니다.</p><p>지원되는 형식의 제출 마감은 자동 반영합니다. 날짜를 안전하게 읽을 수 없는 페이지의 내용이 달라지면 <strong>재확인 필요</strong>로 표시합니다. 연결 실패 시에는 마지막 확인 일정을 유지합니다. 개최 일정과 출처의 연도 전환도 원문 재확인이 필요할 수 있습니다.</p><p>마감 시각·시간대가 명시된 경우에만 한국 시간·AoE·UTC로 변환합니다. 날짜만 발표된 일정은 원문의 날짜를 그대로 표시합니다. 캘린더 내보내기는 현재 일정의 사본이며 이후 변경은 다시 내려받아야 합니다.</p><p>마지막 시도: <strong>${s.lastAttemptAt ? dateText(s.lastAttemptAt, true) : '아직 없음'}</strong><br>다음 확인: <strong>${s.nextSyncAt ? dateText(s.nextSyncAt, true) : STATIC_MODE ? '매시간 정기 실행 · 지연 가능' : '서버에서 예약 중'}</strong><br>${escapeHtml(s.message || '')}</p></div><div class="source-list">${state.conferences.map(c => `<div class="source-row"><a href="${safeUrl(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.acronym)} ${c.year || ''} ↗</a><span class="${sourceWarning(c) ? 'error' : ''}">${escapeHtml(sourceWarning(c) || (c.sourceCheckedAt ? '출처 접속 완료' : c.verifiedAt ? '초기 공식 자료 확인' : '확인 대기'))}</span></div>`).join('')}</div>`;
  openDialog();
}
function toggleSaved(id) {
  const wasSaved = state.saved.has(id);
  if (wasSaved) state.saved.delete(id); else state.saved.add(id);
  storage.set('papertrail-saved', [...state.saved]);
  renderStats(); renderRows();
  if ($('#detail-dialog').open && $('#dialog-content [data-save]')) { showDetail(id); $('#dialog-content [data-save]')?.focus(); }
  showToast(wasSaved ? '저장한 학회에서 제외했어요.' : '학회를 저장했어요. 이 브라우저에서 다시 확인할 수 있어요.');
}
async function fetchData() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch(STATIC_MODE ? './data.json' : './api/conferences', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.conferences)) throw new Error('일정 데이터 형식이 올바르지 않습니다.');
    state.conferences = payload.conferences; state.sync = payload.sync || {}; state.loaded = true;
    for (const conference of state.conferences) {
      for (const previousId of conference.previousIds || []) {
        if (state.selectedId === previousId) {
          state.selectedId = conference.id;
          storage.set('papertrail-selected', state.selectedId);
        }
        if (state.saved.delete(previousId)) {
          state.saved.add(conference.id);
          storage.set('papertrail-saved', [...state.saved]);
        }
      }
    }
    const years = [...new Set(state.conferences.map(c => c.year).filter(Boolean))].sort();
    $('#year-filter').innerHTML = '<option value="all">모든 연도</option>' + years.map(y => `<option value="${Number(y)}">${Number(y)}년</option>`).join('');
    if (!years.map(String).includes(state.year)) state.year = 'all';
    $('#year-filter').value = state.year;
    $('#load-error').hidden = true;
    renderAll();
  } catch (error) {
    $('#load-error').textContent = state.loaded ? '서버 연결을 확인할 수 없습니다. 마지막으로 불러온 일정을 표시합니다. 잠시 후 새로고침해 주세요.' : '일정을 불러오지 못했어요. 서버가 실행 중인지 확인하고 새로고침해 주세요.';
    $('#load-error').hidden = false;
    $('#sync-summary').textContent = '서버 연결 실패';
    if (!state.loaded) { $('#conference-rows').innerHTML = ''; $('#next-deadline').innerHTML = '<div class="next-empty">서버에 연결하면 가까운 마감일을 보여드릴게요.</div>'; }
  } finally { loading = false; }
}
async function requestRefresh() {
  if (STATIC_MODE) { await fetchData(); showToast('공개된 최신 데이터를 불러왔습니다. 공식 출처는 매시간 정기 확인합니다.'); return; }
  const button = $('#refresh'); button.disabled = true; button.classList.add('spinning');
  try {
    const response = await fetch('./api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
    if (response.status === 429) { showToast('최근 갱신이 진행되었습니다. 잠시 후 다시 시도해 주세요.'); }
    else if (!response.ok) throw new Error('refresh failed');
    else showToast('공식 출처를 확인하고 있어요. 결과가 도착하면 화면에 반영됩니다.');
    await fetchData();
    if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; fetchData(); }, 2500);
  } catch { showToast('갱신 요청에 실패했어요. 서버 연결을 확인해 주세요.'); }
  finally { if (state.sync.status !== 'syncing') { button.disabled = false; button.classList.remove('spinning'); } }
}
function resetFilters() { state.search = ''; state.category = 'all'; state.year = 'all'; state.status = 'all'; $('#search').value = ''; $('#year-filter').value = 'all'; $('#status-filter').value = 'all'; renderRows(); }
document.addEventListener('click', event => {
  const selected = event.target.closest('[data-select]'); if (selected) { selectConference(selected.dataset.select); return; }
  const detail = event.target.closest('[data-detail]'); if (detail) { showDetail(detail.dataset.detail); return; }
  const save = event.target.closest('[data-save]'); if (save) { toggleSaved(save.dataset.save); return; }
  const category = event.target.closest('[data-category]'); if (category) { state.category = category.dataset.category; renderRows(); return; }
  const area = event.target.closest('button[data-area]'); if (area) { state.category = area.dataset.area; state.nav = 'all'; renderRows(); return; }
  const nav = event.target.closest('[data-nav]'); if (nav) { state.nav = nav.dataset.nav; state.view = state.nav === 'calendar' ? 'calendar' : 'list'; resetFilters(); return; }
  const view = event.target.closest('[data-view]'); if (view) { state.view = view.dataset.view; if (state.nav === 'calendar' && state.view === 'list') state.nav = 'all'; renderRows(); }
});
$('#search').addEventListener('input', event => { state.search = event.target.value.trim(); renderRows(); });
$('#year-filter').addEventListener('change', event => { state.year = event.target.value; renderRows(); });
$('#status-filter').addEventListener('change', event => { state.status = event.target.value; renderRows(); });
$('#timezone').addEventListener('change', event => { state.timezone = event.target.value; storage.set('papertrail-timezone', state.timezone); renderAll(); });
$('#sort-deadline').addEventListener('click', () => { state.reverse = !state.reverse; $('#sort-deadline').closest('th').setAttribute('aria-sort', state.reverse ? 'descending' : 'ascending'); renderRows(); });
$('#reset-filters').addEventListener('click', resetFilters);
$('#refresh').addEventListener('click', requestRefresh);

$('#footer-sources').addEventListener('click', showSources);
$('#close-dialog').addEventListener('click', () => $('#detail-dialog').close());
$('#detail-dialog').addEventListener('close', () => { if (dialogReturnFocus) $(dialogReturnFocus)?.focus({ preventScroll: true }); });
$('#detail-dialog').addEventListener('click', event => { if (event.target === $('#detail-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('#calendar-prev').addEventListener('click', () => { const d = new Date(state.calendarYear, state.month - 1); state.calendarYear = d.getFullYear(); state.month = d.getMonth(); renderRows(); });
$('#calendar-next').addEventListener('click', () => { const d = new Date(state.calendarYear, state.month + 1); state.calendarYear = d.getFullYear(); state.month = d.getMonth(); renderRows(); });
$('#calendar-today').addEventListener('click', () => { const p = parts(new Date().toISOString()); state.calendarYear = Number(p.year); state.month = Number(p.month) - 1; renderRows(); });
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('#detail-dialog').open) { event.preventDefault(); $('#search').focus(); } });
window.addEventListener('storage', event => { if (event.key === 'papertrail-selected') { state.selectedId = storage.get('papertrail-selected', null); renderNext(); renderRows(); } if (event.key === 'papertrail-saved') { const saved = storage.get('papertrail-saved', []); state.saved = new Set(Array.isArray(saved) ? saved : []); renderStats(); renderRows(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchData(); });
renderStats();
fetchData();
setInterval(() => { if (!document.hidden) fetchData(); }, 60000);
setInterval(() => { if (!document.hidden) tickCountdown(); }, 1000);
