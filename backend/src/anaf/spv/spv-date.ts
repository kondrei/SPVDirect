const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bucharest',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function offsetMs(instant: number): number {
  const p = Object.fromEntries(
    parts.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function parseAnafDateTime(value: string | null): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(
    value?.trim() ?? '',
  );
  if (!m) return null;
  const num = (i: number) => Number(m[i] ?? 0);
  const day = num(1);
  const wall = Date.UTC(num(3), num(2) - 1, day, num(4), num(5), num(6));
  if (new Date(wall).getUTCDate() !== day) return null;
  let instant = wall - offsetMs(wall);
  instant = wall - offsetMs(instant);
  return new Date(instant);
}
