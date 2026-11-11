/**
 * Wall-clock date/time helpers.
 *
 * Personal dates are stored as calendar strings (YYYY-MM-DD) and optional
 * times (HH:mm) so timezone changes preserve the wall-clock value
 * (FR-PROFILE-003). Deadline instants and "today" are derived in the user's
 * academic timezone.
 */

const formatterCache = new Map();

function formatterFor(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function partsInZone(instant, timeZone) {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Today's calendar key in the given IANA timezone. */
export function todayKey(timeZone) {
  const parts = partsInZone(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Current ISO weekday (1 = Monday … 7 = Sunday) in the given timezone. */
export function weekdayInZone(timeZone) {
  const parts = partsInZone(new Date(), timeZone);
  const jsDay = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  ).getUTCDay();
  return ((jsDay + 6) % 7) + 1;
}

function offsetMs(instant, timeZone) {
  const parts = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Convert a wall-clock date+time in a timezone to a UTC instant. */
export function wallClockToInstant(dateKey, time, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = offsetMs(new Date(guess), timeZone);
  let instant = new Date(guess - firstOffset);
  const secondOffset = offsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) {
    // DST boundary: re-resolve with the corrected offset.
    instant = new Date(guess - secondOffset);
  }
  return instant;
}

/**
 * FR-TASK-006 / FR-REM-004: a date-only deadline means end of the academic
 * day (23:59:59) in the relevant timezone.
 */
export function deadlineInstant({ dueDate, dueTime }, timeZone) {
  if (!dueDate) return null;
  if (dueTime) return wallClockToInstant(dueDate, dueTime, timeZone);
  return new Date(wallClockToInstant(dueDate, '23:59', timeZone).getTime() + 59_000);
}

export function isoNow() {
  return new Date().toISOString();
}
