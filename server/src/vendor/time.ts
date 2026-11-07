/** Date formatting in the vendor's expected formats, at a fixed UTC offset. */

const pad = (n: number) => String(n).padStart(2, '0');

function shifted(date: Date, utcOffsetHours: number): Date {
  return new Date(date.getTime() + utcOffsetHours * 3_600_000);
}

/** `yyyy-MM-dd HH:mm:ss` in the given UTC offset. */
export function formatDateTime(date: Date, utcOffsetHours: number): string {
  const d = shifted(date, utcOffsetHours);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** `yyyy-MM-dd` in the given UTC offset. */
export function formatDay(date: Date, utcOffsetHours: number): string {
  return formatDateTime(date, utcOffsetHours).slice(0, 10);
}

/** Accepts a Date or an already formatted string. */
export function toDateTime(value: Date | string, utcOffsetHours: number): string {
  return typeof value === 'string' ? value : formatDateTime(value, utcOffsetHours);
}

export function toDay(value: Date | string, utcOffsetHours: number): string {
  return typeof value === 'string' ? value : formatDay(value, utcOffsetHours);
}
