// Planning estimates stay separate from the verified conference schedule.
const FIRST = '2026-10', LAST = '2029-02';
const lanes = { deadline: ['Submission Deadline', '논문 제출 마감'], decision: ['합격 결과', 'Acceptance notification'], talk: ['학회 발표', '개최 기간 · 개별 발표일은 추후 확인'] };
const patterns = {
  NeurIPS: [[0,5],[0,9],[0,12]], ICML: [[0,1],[0,5],[0,7]],
  ICCV: [[0,3],[0,6],[0,10]], ECCV: [[0,3],[0,6],[0,9]],
  CVPR: [[-1,11],[0,2],[0,6]], ICLR: [[-1,9],[-1,12],[0,4]],
  CoRL: [[0,5],[0,9],[0,10]], AAAI: [[-1,7],[-1,11],[0,2]],
  ICRA: [[-1,9],[0,1],[0,5]], IROS: [[0,3],[0,6],[0,9]],
  RSS: [[-1,12],[0,4],[0,7]], HRI: [[-1,9],[-1,11],[0,3]],
  'RO-MAN': [[0,3],[0,5],[0,8]], IV: [[-1,11],[0,1],[0,6]], ITSC: [[0,3],[0,5],[0,9]]
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url = value => { try { const u = new URL(value); return u.protocol === 'https:' ? escape(u.href) : '#'; } catch { return '#'; } };
const month = (year, n) => year + '-' + String(n).padStart(2, '0');
const inRange = date => date && date.slice(0,7) >= FIRST && date.slice(0,7) <= LAST;
function kst(date) {
  if (!date || !Number.isFinite(Date.parse(date))) return null;
  if (date.length === 10) return date;
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
}
export function buildRoadmap(conferences) {
  const events = [];
  for (const c of conferences) {
    if (c.type === 'journal' || !patterns[c.acronym]) continue;
    for (let year = 2027; year <= 2029; year++) {
      if (c.acronym === 'ICCV' && year % 2 === 0 || c.acronym === 'ECCV' && year % 2 !== 0) continue;
      // Do not invent new submissions for an edition whose first deadline already passed.
      const same = Number(c.year) === year;
      const history = c.previousDeadline;
      let first = same && c.deadline ? kst(c.deadline) : null;
      if (!first && c.deadline) first = month(year + Number(c.deadline.slice(0,4)) - Number(c.year), Number(c.deadline.slice(5,7)));
      if (!first && history?.date) first = month(year + Number(history.date.slice(0,4)) - history.edition, Number(history.date.slice(5,7)));
      if (!first) first = month(year + patterns[c.acronym][0][0], patterns[c.acronym][0][1]);
      if (first.slice(0,7) < FIRST) continue;
      for (const [i, kind] of Object.keys(lanes).entries()) {
        let date = null, end = null, source = c.sourceUrl || c.website, basis = '최근 회차의 개최 월을 참고한 계획용 예상';
        let label = kind === 'deadline' ? '본문 제출' : kind === 'decision' ? '최종 결과' : '학회 개최';
        if (same) {
          if (kind === 'deadline') { date = kst(c.deadline); label = c.deadlineLabel || label; }
          if (kind === 'decision') { date = kst(c.notificationDate || (c.notification?.edition === year ? c.notification.date : null)); source = c.notificationDate ? c.sourceUrl : c.notification?.sourceUrl || source; }
          if (kind === 'talk') { date = kst(c.startDate); end = kst(c.endDate); }
        }
        // RAS currently has conflicting ICRA 2028 deadline records; keep this tentative.
        const conflict = c.acronym === 'ICRA' && year === 2028 && kind === 'deadline';
        let estimate = !date || conflict;
        if (estimate) {
          let ref = kind === 'deadline' ? (c.deadline ? {date:c.deadline, edition:c.year, sourceUrl:c.sourceUrl} : history) : kind === 'decision' ? (c.notificationDate ? {date:c.notificationDate,edition:c.year,sourceUrl:c.sourceUrl} : c.notification) : (c.startDate ? {date:c.startDate,edition:c.year,sourceUrl:c.sourceUrl} : null);
          if (ref?.date && ref.edition) {
            date = month(year + Number(ref.date.slice(0,4)) - Number(ref.edition), Number(ref.date.slice(5,7)));
            basis = ref.edition + '년 회차의 공식 일정 기준 · 차기 회차 미확정'; source = ref.sourceUrl || source;
          } else date = month(year + patterns[c.acronym][i][0], patterns[c.acronym][i][1]);
          end = null;
          if (conflict) { date = year - 1 + '-08'; label = '8–9월 · 공식 자료 상충'; basis = 'IEEE RAS 행사 기록에 8/16과 9/15가 혼재하여 확정 마감으로 사용하지 않습니다.'; }
        }
        if (c.acronym === 'RSS' && kind === 'deadline') label = '1차 · 확장 초록';
        if (inRange(date)) events.push({id:c.acronym + '-' + year + '-' + kind,acronym:c.acronym,year,kind,date,end,estimate,label,source,basis,category:c.category});
      }
      if (c.acronym === 'RSS') {
        const final = same && c.finalPaperDeadline ? kst(c.finalPaperDeadline) : null;
        const date = final || (year === 2027 ? '2027-04-17' : month(year,4));
        if (inRange(date)) events.push({id:c.acronym + '-' + year + '-final',acronym:c.acronym,year,kind:'deadline',date,estimate:!final && year !== 2027,label:'2차 · 초청자만 최종 논문',source:c.sourceUrl,basis:'RSS 2027의 2단계 심사 일정 기준 · 4월 신규 투고 불가',category:c.category});
      }
    }
  }
  return events.sort((a,b) => a.date.localeCompare(b.date) || a.acronym.localeCompare(b.acronym));
}
let data = [], category = 'all', selectedYear = 'all', confirmedOnly = false, mounted = false;
// Shift+click marks a card with a red border; marks stay in this browser only.
const MARK_KEY = 'papertrail-roadmap-marked';
const marked = new Set((() => { try { const v = JSON.parse(localStorage.getItem(MARK_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } })());
function toggleMark(cardEl) {
  const id = cardEl.dataset.id;
  if (marked.has(id)) marked.delete(id); else marked.add(id);
  const on = marked.has(id);
  cardEl.classList.toggle('rm-marked', on);
  cardEl.querySelector('.rm-status').textContent = cardEl.querySelector('.rm-status').textContent.replace(/ · 표시함$/, '') + (on ? ' · 표시함' : '');
  try { localStorage.setItem(MARK_KEY, JSON.stringify([...marked])); } catch {}
}
function card(e) {
  const when = e.estimate ? Number(e.date.slice(5,7)) + '월 예상' : e.date.slice(5).replace('-', '.') + (e.end && e.end !== e.date ? '–' + e.end.slice(5).replace('-', '.') : '');
  const on = marked.has(e.id);
  const status = (e.estimate ? '예상' : '공식') + (on ? ' · 표시함' : '');
  return '<a class="rm-event rm-' + e.kind + ' rm-cat-' + escape(e.category) + (e.estimate ? ' rm-estimate' : '') + (on ? ' rm-marked' : '') + '" data-id="' + escape(e.id) + '" href="' + url(e.source) + '" target="_blank" rel="noopener noreferrer" title="' + escape(e.label + ' · ' + (e.estimate ? e.basis : '공식 일정 · 날짜는 KST 기준, 날짜만 발표된 경우 원문 날짜')) + '"><span class="rm-event-head"><strong>' + escape(e.acronym) + ' <small>' + e.year + '</small></strong><span class="rm-status">' + status + '</span></span><span class="rm-when">' + when + '</span></a>';
}
function phase(y,m) {
  if (y === 2026 || y === 2027 && m <= 2) return '연구 인턴';
  if (y === 2027) return m < 9 ? '석사 1학기' : '석사 2학기';
  if (y === 2028) return m < 3 ? '석사 2학기' : m < 9 ? '석사 3학기' : '석사 4학기';
  return '석사 종료 후';
}
const monthsOf = y => Array.from({length: y === 2026 ? 3 : y === 2029 ? 2 : 12}, (_, i) => y === 2026 ? i + 10 : i + 1);
const rangeOf = y => y === 2026 ? '10–12월' : y === 2029 ? '1–2월' : '1–12월';
let drawnYear = null;
// US PhD application window for Spring/Fall 2029 entry (planning estimate, see the note under the table).
const APPLY_FROM = '2028-08', APPLY_TO = '2028-12';
const applying = key => key >= APPLY_FROM && key <= APPLY_TO;
// One continuous table for the whole period; it scrolls sideways instead of stacking a panel per year.
function draw() {
  const events = buildRoadmap(data).filter(e => (category === 'all' || e.category === category) && (!confirmedOnly || !e.estimate));
  const years = [2026,2027,2028,2029].filter(y => selectedYear === 'all' || String(y) === selectedYear);
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
  const columns = years.flatMap(y => monthsOf(y).map((m, i) => ({y, m, key: month(y, m), first: i === 0})));
  const cls = (base, c) => base + (c.first ? ' rm-year-start' : '') + (applying(c.key) ? ' rm-apply' : '') + (c.key === today ? ' rm-current' : '');
  const shown = events.filter(e => years.includes(Number(e.date.slice(0,4))));
  const yearRow = '<div class="rm-row rm-years-row"><div class="rm-label">연도</div>' + years.map(y => '<div class="rm-year-cell rm-year-start" style="grid-column:span ' + monthsOf(y).length + '"><div><strong>' + y + '</strong><span>' + rangeOf(y) + ' · ' + shown.filter(e => Number(e.date.slice(0,4)) === y).length + '개 일정</span></div></div>').join('') + '</div>';
  const monthRow = '<div class="rm-row rm-months"><div class="rm-label">일정 / 월</div>' + columns.map(c => '<div class="' + cls('rm-month', c) + '"' + (applying(c.key) ? ' title="미국 PhD 원서접수 기간 (예상)"' : '') + '><strong>' + c.m + '월</strong><span>' + phase(c.y, c.m) + '</span></div>').join('') + '</div>';
  const rows = Object.entries(lanes).map(([kind,[name,subtitle]]) => '<div class="rm-row"><div class="rm-label rm-' + kind + '"><strong>' + name + '</strong><small>' + subtitle + '</small></div>' + columns.map(c => '<div class="' + cls('rm-cell', c) + '">' + shown.filter(e => e.kind === kind && e.date.slice(0,7) === c.key).map(card).join('') + '</div>').join('') + '</div>').join('');
  const admissions = years.includes(2028) ? '<div class="rm-application"><span>PhD 원서접수 · 2028</span><p><b>Spring 2029</b> 8–10월 예상 · 모집 학교만 <span>→</span> <b>Fall 2029</b> 9–12월 예상 · 학교별 마감 확인</p></div>' : '';
  const host = document.querySelector('#roadmap-years');
  const previous = host.querySelector('.rm-scroll');
  const keep = previous && drawnYear === selectedYear ? previous.scrollLeft : null;
  const label = years.length === 1 ? years[0] + '년 학회 로드맵' : '2026년 10월부터 2029년 2월까지 학회 로드맵';
  host.innerHTML = '<section class="rm-year rm-timeline"><div class="rm-scroll" tabindex="0" role="region" aria-label="' + label + ', 좌우로 스크롤"><div class="rm-grid" style="--months:' + columns.length + '">' + yearRow + monthRow + rows + '</div></div>' + admissions + '</section>';
  const scroller = host.querySelector('.rm-scroll');
  if (keep !== null) scroller.scrollLeft = keep;
  else {
    // First view of a range: start at the current month when it is inside the table.
    const current = scroller.querySelector('.rm-month.rm-current');
    const labelWidth = scroller.querySelector('.rm-label')?.offsetWidth || 0;
    if (current) scroller.scrollLeft = current.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft - labelWidth;
  }
  drawnYear = selectedYear;
}
export function renderRoadmap(conferences) {
  const host = document.querySelector('#research-roadmap');
  if (!host) return;
  data = conferences;
  if (!mounted) {
    host.innerHTML = '<div class="rm-heading"><h2 id="roadmap-title">논문 투고 계획</h2></div><div class="rm-controls"><div class="rm-filters" role="group" aria-label="로드맵 분야"><button data-rm-category="all" aria-pressed="true">전체</button><button data-rm-category="ai" aria-pressed="false"><i class="rm-dot"></i>AI</button><button data-rm-category="robotics" aria-pressed="false"><i class="rm-dot"></i>Robotics</button><button data-rm-category="driving" aria-pressed="false"><i class="rm-dot"></i>Autonomous Driving</button></div><div class="rm-options"><label>연도 <select id="roadmap-year"><option value="all">전체 기간</option><option>2026</option><option>2027</option><option>2028</option><option>2029</option></select></label><label><input id="roadmap-confirmed" type="checkbox"> 공식 일정만</label></div></div><div class="rm-legend"><span class="rm-solid"></span><span>실선 · 공식 일정</span><span class="rm-dashed"></span><span>점선 · 예상 일정</span><span class="rm-apply-swatch"></span><span>분홍 · 2028.08–12 PhD 원서접수 예상</span><span class="rm-mark-swatch"></span><span>Shift+클릭 · 빨간 테두리 표시</span></div><div id="roadmap-years"></div><div class="rm-footnote"><p>공식 일정은 위 목록과 함께 갱신됩니다. 미공개 회차는 최근 일정의 월을 참고한 예상이며, 실제 제출 마감으로 사용하지 마세요. 카드를 누르면 공식 출처가 열리고, Shift+클릭하면 빨간 테두리로 표시됩니다. 표시는 이 브라우저에만 저장됩니다.</p><p>시간이 공개된 일정은 KST로 환산합니다. 학회 발표는 개최 기간이며 개인 발표일은 별도입니다. RSS 2차 제출은 1차 통과자만 대상입니다. 상시 투고 저널은 제외합니다.</p><p>석사: 2027.03–2028.12 계획 · Spring 2029는 보통 1월 입학, Fall 2029는 8–9월 입학입니다. 원서접수는 계획용 예상 기간입니다.</p></div>';
    host.querySelectorAll('[data-rm-category]').forEach(button => button.addEventListener('click', () => { category = button.dataset.rmCategory; host.querySelectorAll('[data-rm-category]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); draw(); }));
    host.querySelector('#roadmap-year').addEventListener('change', e => { selectedYear = e.target.value; draw(); });
    host.querySelector('#roadmap-confirmed').addEventListener('change', e => { confirmedOnly = e.target.checked; draw(); });
    // Shift+click (or Shift+Enter) toggles the red mark instead of opening the source in a new window.
    host.addEventListener('mousedown', e => { if (e.shiftKey && e.target.closest('.rm-event')) e.preventDefault(); });
    host.addEventListener('click', e => { const el = e.target.closest('.rm-event'); if (!el || !e.shiftKey) return; e.preventDefault(); toggleMark(el); });
    host.addEventListener('keydown', e => { const el = e.target.closest('.rm-event'); if (!el || !e.shiftKey || e.key !== 'Enter') return; e.preventDefault(); toggleMark(el); });
    // Inside the table a vertical wheel scrolls sideways: down moves right, up moves left.
    // At either end the page scrolls as usual; trackpad sideways swipes, Shift+wheel and Ctrl+wheel zoom stay native.
    host.addEventListener('wheel', e => {
      const scroller = e.target.closest('.rm-scroll');
      if (!scroller || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const delta = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? scroller.clientWidth : 1);
      const max = scroller.scrollWidth - scroller.clientWidth;
      if (delta > 0 ? scroller.scrollLeft >= max - 1 : scroller.scrollLeft <= 0) return;
      e.preventDefault();
      scroller.scrollLeft += delta;
    }, { passive: false });
    mounted = true;
  }
  draw();
}
