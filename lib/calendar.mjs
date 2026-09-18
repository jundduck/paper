const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateStamp = value => value.replace(/-/g, '');
function nextDay(value) { return new Date(new Date(`${value}T00:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10); }

// RFC 5545 folds at 75 octets, not 75 JavaScript characters (Korean titles need byte counting).
export function foldLine(line) {
  let result = '';
  let width = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, 'utf8');
    if (width + bytes > 75) { result += '\r\n '; width = 1; }
    result += char;
    width += bytes;
  }
  return result;
}

export function createCalendar(conferences, generatedAt = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paper//Conference Tracker//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Paper · 학회 일정', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const add = (conference, kind, title, start, end) => {
    if (!start || !Number.isFinite(new Date(start).getTime())) return;
    const allDay = isoDate.test(start);
    lines.push('BEGIN:VEVENT', `UID:${escapeText(conference.id)}-${kind}@paper-conference-tracker`, `DTSTAMP:${stamp(generatedAt)}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(start)}`, `DTEND;VALUE=DATE:${dateStamp(nextDay(end && isoDate.test(end) ? end : start))}`);
    } else {
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start).getTime() + 60000)}`);
    }
    lines.push(`SUMMARY:${escapeText(`${conference.acronym}${conference.year ? ` ${conference.year}` : ''} · ${title}`)}`,
      `DESCRIPTION:${escapeText(`${conference.name}\n${conference.timezone ? `원문 시간대: ${conference.timezone}\n` : ''}${conference.notes ?? ''}\n공식 출처: ${conference.sourceUrl}\n마지막 날짜 확인: ${conference.verifiedAt ?? '미확인'}\n공식 발표가 변경될 수 있으므로 제출 전 출처를 확인하세요.`)}`,
      `URL:${String(conference.sourceUrl ?? conference.website).replace(/[\r\n]/g, '')}`);
    if (conference.location) lines.push(`LOCATION:${escapeText(conference.location)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  };
  for (const conference of conferences) {
    if (conference.type === 'journal' || conference.status === 'rolling') continue;
    add(conference, 'abstract', conference.abstractDeadlineLabel ?? '초록 제출 마감', conference.abstractDeadline);
    add(conference, 'deadline', conference.deadlineLabel ?? '논문 제출 마감', conference.deadline);
    add(conference, 'event', '학회 개최', conference.startDate, conference.endDate);
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
