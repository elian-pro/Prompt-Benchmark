/**
 * Business days and the deadline a demo link carries.
 *
 * Everything here speaks `YYYY-MM-DD`, never an instant. The admin picks a day
 * and the client is told a day, so storing a timestamp would only add a
 * conversion that renders the wrong one: `new Date("2026-08-14")` parses as UTC
 * midnight, which in Mexico is the 13th at six in the evening.
 *
 * The deadline is inclusive: a link that expires on the 14th still takes
 * reports all through the 14th, Mexico City time, and stops at midnight. That
 * comparison is a string compare between two `YYYY-MM-DD`, which is why the
 * only date arithmetic in the app lives in this file.
 *
 * ponytail: Mexican holidays are not modelled, so "15 días hábiles" can land on
 * September 16. The date is editable afterwards, which is the escape hatch; a
 * holiday table goes here if that ever costs someone a day.
 */

/** Monday to Friday. A working week, told to someone on Monday, ends Friday. */
export const WORKING_WEEK = 5;
export const THREE_WORKING_WEEKS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today in Mexico City, as YYYY-MM-DD.
 *
 * `en-CA` formats as YYYY-MM-DD, and the IANA zone does the offset, so nobody
 * has to remember that mainland Mexico dropped DST in 2022 while Baja
 * California kept it.
 */
export function todayInMexico(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** A date-only value as an instant at UTC noon: far enough from either
 *  midnight that no offset can push it into the neighbouring day. */
function atNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00Z`);
}

function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isWeekend(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The deadline `count` business days out, counting `from` itself as the first
 * when it is a business day. Monday plus a working week is that Friday, which
 * is what "tienes una semana hábil" means to someone told it on Monday.
 *
 * A weekend start rolls to Monday first, so a link created on Saturday gets
 * the whole following week.
 */
export function businessDaysFrom(from: string, count: number): string {
  let ms = atNoon(from);
  while (isWeekend(ms)) ms += DAY_MS;
  let remaining = Math.max(count, 1) - 1;
  while (remaining > 0) {
    ms += DAY_MS;
    if (!isWeekend(ms)) remaining--;
  }
  return toISO(ms);
}

/** Null means no deadline: the link stays open until someone closes it. */
export function isExpired(expiresOn: string | null, now: number = Date.now()): boolean {
  if (!expiresOn) return false;
  return todayInMexico(now) > expiresOn;
}

/** "viernes 14 de agosto", for the client's card and the admin's list. */
export function formatDeadlineEs(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(atNoon(iso)));
}

/** "14 ago", for a list row where the weekday is noise. */
export function formatDeadlineShortEs(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(atNoon(iso)));
}
