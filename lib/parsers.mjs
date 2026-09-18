const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const DATE = `${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*['’]?(\\d{4}|\\d{2})\\b`;

export function stripHtml(html) {
  const entities = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘' };
  return html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|h[1-6]|li|tr|table|section|article)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (raw, value) => {
      if (!value.startsWith('#')) return entities[value.toLowerCase()] ?? raw;
      const n = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : parseInt(value.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw;
    })
    .replace(/[\t\r \u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const pad = n => String(n).padStart(2, '0');
function ymd(year, month, day) {
  const value = `${year}-${pad(month)}-${pad(day)}`;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/** Parse only a printed date. Never invent end-of-day time when the source omits it. */
export function parseExplicitDate(value, defaultZone = null) {
  const match = value.match(new RegExp(DATE, 'i'));
  if (!match) return null;
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const date = ymd(year, MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]));
  if (!date) return null;
  const tail = value.slice(match.index + match[0].length, match.index + match[0].length + 110);
  const clock = tail.match(/(?:at\s*)?\(?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\b/i);
  const zoneText = tail.match(/\b(?:AoE|Anywhere on Earth|UTC\s*[-−+]\s*\d{1,2}(?::\d{2})?|PST|PDT|GMT|UTC)\b/i)?.[0] ?? defaultZone;
  let offset = null;
  let zone = zoneText;
  if (/^(aoe|anywhere on earth|utc\s*[-−]\s*12)$/i.test(zoneText ?? '')) { offset = '-12:00'; zone = 'AoE'; }
  else if (/^PST$/i.test(zoneText ?? '')) { offset = '-08:00'; zone = 'PST'; }
  else if (/^PDT$/i.test(zoneText ?? '')) { offset = '-07:00'; zone = 'PDT'; }
  else if (/^(UTC|GMT)$/i.test(zoneText ?? '')) { offset = '+00:00'; zone = 'UTC'; }
  else if (zoneText?.match(/^UTC\s*[-−+]\s*\d{1,2}(?::\d{2})?$/i)) {
    const z = zoneText.match(/([-−+])\s*(\d{1,2})(?::(\d{2}))?/);
    if (+z[2] <= 14 && +(z[3] ?? 0) < 60) offset = `${z[1] === '+' ? '+' : '-'}${pad(z[2])}:${pad(z[3] ?? 0)}`;
  }
  if (!clock || !offset) return { value: date, precision: 'date', timezone: zone ?? null };
  let hour = Number(clock[1]);
  if (clock[4]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (clock[4].toUpperCase() === 'PM' ? 12 : 0);
  }
  if (hour > 23 || +clock[2] > 59 || +(clock[3] ?? 0) > 59) return null;
  return { value: `${date}T${pad(hour)}:${clock[2]}:${clock[3] ?? '00'}${offset}`, precision: 'time', timezone: zone };
}

function countdown(html, names) {
  for (const name of names) {
    const match = html.match(new RegExp(`\\bvar\\s+${name}\\s*=\\s*["'](\\d{4})/(\\d{2})/(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) UTC["']`));
    if (!match) continue;
    const instant = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
    if (!Number.isFinite(instant.getTime())) continue;
    // Official countdown is a UTC instant. Keep its exact seconds and show AoE as the source does.
    return { value: `${new Date(instant.getTime() - 12 * 3600_000).toISOString().slice(0, 19)}-12:00`, precision: 'time', timezone: 'AoE' };
  }
  return null;
}

function deadlineNear(text, labels, zone) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    for (const label of labels) {
      const found = line.match(label);
      if (!found || /workshop|supplementary|camera.ready|competition|tutorial|doctoral|demo\b/i.test(line.slice(0, found.index + found[0].length))) continue;
      const after = line.slice(found.index + found[0].length);
      const before = line.slice(0, found.index);
      const parsed = parseExplicitDate(after, zone) ?? (/\|/.test(before) ? parseExplicitDate(before, zone) : null);
      if (parsed) return parsed;
    }
  }
  return null;
}

function ranges(text, expectedYear) {
  const result = [];
  const expression = new RegExp(`${MONTH}\\s+(\\d{1,2})\\s*[–—-]\\s*(?:${MONTH}\\s+)?(\\d{1,2}),?\\s+(\\d{4})`, 'gi');
  for (const match of text.matchAll(expression)) {
    if (+match[5] !== expectedYear) continue;
    const start = ymd(+match[5], MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, +match[2]);
    const end = ymd(+match[5], MONTHS.indexOf((match[3] ?? match[1]).slice(0, 3).toLowerCase()) + 1, +match[4]);
    if (start && end && start <= end) result.push({ startDate: start, endDate: end });
  }
  return result;
}

/** Each parser is anchored to the edition and source; monitor-only pages never fabricate dates. */
export function parseConference(html, conference) {
  const text = stripHtml(html);
  const patch = {};
  const key = conference.acronym.toUpperCase();
  if (conference.type === 'journal') return { patch, fields: [], mode: 'monitor', text, reason: '저널은 상시 투고 정책의 페이지 변경을 감지합니다.' };
  // Other venues are deliberately monitor-only until their edition-specific parser is verified.
  // A future-meetings navigation link must never turn an older CFP into a new edition's deadline.
  if (!['ICLR', 'CVPR', 'AAAI', 'ICRA', 'IROS', 'IV'].includes(key)) return { patch, fields: [], mode: 'monitor', text, reason: '날짜 자동 해석을 지원하지 않아 페이지 변경을 감지합니다.' };
  const year = conference.year;
  const escapedAcronym = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const editionHeading = new RegExp(`(?:${escapedAcronym}[ :–—-]*${year}|${year}[^\\n]{0,180}${escapedAcronym}|${escapedAcronym}[ :–—-]*${String(year).slice(-2)}\\b)`, 'i');
  const headings = [...html.matchAll(/<(title|h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(match => stripHtml(match[2]));
  if (!year || !headings.some(heading => editionHeading.test(heading))) return { patch, fields: [], mode: 'monitor', text, reason: '해당 연도 일정이 문서 제목에서 확인되지 않았습니다.' };
  const isPortal = /^(ICLR|CVPR|ICML|NEURIPS|ICCV|ECCV)$/.test(key);
  let deadline = null;
  let abstract = null;
  if (isPortal && /Anywhere on Earth|UTC-12|\bAoE\b/i.test(text)) {
    deadline = countdown(html, ['paper_deadline', 'full_paper_submission_deadline', 'paper_submission_deadline', 'submission_deadline_1', 'full_paper_submission_deadline_1', 'paper_submission_deadline_1']);
    abstract = countdown(html, ['abstract_deadline', 'abstract_submission_deadline', 'abstract_submission_deadline_1', 'paper_registration_deadline_1']);
  }
  const globalZone = /\ball (?:times|deadlines|dates(?: and times)?)[^.\n]{0,80}(?:UTC[-−]12|\bAoE\b|Anywhere on Earth)/i.test(text) ? 'AoE' : null;
  deadline ??= deadlineNear(text, [/\bPaper submission deadline\s*:?/i, /\bFull paper(?:s)? (?:submission )?deadline\s*:?/i, /\bPaper deadline\s*:?/i, /^Submission\s+Deadline\s*[:|]?/i], globalZone);
  abstract ??= deadlineNear(text, [/\bAbstract(?:s)? (?:submission )?deadline\s*:?/i, /\bPaper\s+Registration\s+Deadline\s*[:|]?/i], globalZone);
  if (key === 'AAAI') {
    const paper = text.match(new RegExp(`(${DATE})\\s*Full papers due at ([^\\n]+)`, 'i'));
    const abs = text.match(new RegExp(`(${DATE})\\s*Abstracts due at ([^\\n]+)`, 'i'));
    if (paper) deadline = parseExplicitDate(`${paper[1]} ${paper[5]}`);
    if (abs) abstract = parseExplicitDate(`${abs[1]} ${abs[5]}`);
  }
  for (const [field, parsed] of [['deadline', deadline], ['abstractDeadline', abstract]]) {
    if (!parsed) continue;
    const dateYear = Number(parsed.value.slice(0, 4));
    if (dateYear < year - 1 || dateYear > year) continue;
    patch[field] = parsed.value;
    if (field === 'deadline') { patch.deadlinePrecision = parsed.precision; patch.timezone = parsed.timezone; patch.status = 'announced'; }
  }
  // Event ranges are accepted only in the source section that names this conference edition.
  if (key === 'CVPR') {
    const section = text.match(new RegExp(`CVPR ${year} Meeting Dates([\\s\\S]{0,700}?)(?:Dates and Deadlines|Your timezone)`));
    if (section) {
      const eventDates = ranges(section[1], year);
      if (eventDates.length) Object.assign(patch, { startDate: eventDates.map(d => d.startDate).sort()[0], endDate: eventDates.map(d => d.endDate).sort().at(-1) });
    }
  } else if (key === 'ICRA') {
    const section = text.match(/will take place[\s\S]{0,260}/i);
    const event = section && ranges(section[0], year)[0];
    if (event) Object.assign(patch, event);
  }
  const fields = Object.keys(patch).filter(field => ['deadline', 'abstractDeadline', 'startDate', 'endDate'].includes(field));
  return { patch, fields, mode: fields.length ? 'automatic' : 'monitor', text, reason: fields.length ? '공식 페이지의 명시된 날짜를 자동 반영했습니다.' : '날짜 자동 해석을 지원하지 않아 페이지 변경을 감지합니다.' };
}
