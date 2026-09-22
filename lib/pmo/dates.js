// Dates, the way a reporting calendar uses them.
//
// Everything is held at UTC midnight. A project week that shifts by a
// timezone offset silently moves progress between reports, and a PMO that
// cannot reconcile last week's number to this week's loses the room.

export const DAY = 86400000;

export function asDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Strip the time, keeping the calendar day it was written as. */
export function startOfDay(value) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(value, days) {
  const date = startOfDay(value);
  return date ? new Date(date.getTime() + days * DAY) : null;
}

export function daysBetween(from, to) {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export function isoDay(value) {
  const date = startOfDay(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

/** 15 Jan 2026 — the format Indian project reporting actually reads in. */
export function formatDate(value) {
  const date = startOfDay(value);
  if (!date) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getUTCDate()).padStart(2, '0')} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatMonth(value) {
  const date = startOfDay(value);
  if (!date) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The week containing `value`, starting on `weekStartsOn` (1 = Monday). */
export function weekRange(value, weekStartsOn = 1) {
  const date = startOfDay(value);
  if (!date) return null;
  const offset = (date.getUTCDay() - weekStartsOn + 7) % 7;
  const from = addDays(date, -offset);
  return { from, to: addDays(from, 6), label: `Week of ${formatDate(from)}` };
}

export function monthRange(value) {
  const date = startOfDay(value);
  if (!date) return null;
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from, to, label: formatMonth(from) };
}

/**
 * The quarter containing `value`.
 *
 * `fiscal` gives the Indian financial year (Apr–Mar), which is the one a
 * client's board actually reviews against.
 */
export function quarterRange(value, { fiscal = true } = {}) {
  const date = startOfDay(value);
  if (!date) return null;
  const month = date.getUTCMonth();
  const startMonth = fiscal ? Math.floor(((month - 3 + 12) % 12) / 3) * 3 + 3 : Math.floor(month / 3) * 3;
  const year = fiscal && month < 3 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  const from = new Date(Date.UTC(year, startMonth % 12 === startMonth ? startMonth : startMonth, 1));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 3, 0));
  const index = fiscal ? Math.floor(((from.getUTCMonth() - 3 + 12) % 12) / 3) + 1 : Math.floor(from.getUTCMonth() / 3) + 1;
  const fy = fiscal ? `FY${String((from.getUTCMonth() >= 3 ? from.getUTCFullYear() + 1 : from.getUTCFullYear()) % 100).padStart(2, '0')}` : from.getUTCFullYear();
  return { from, to, label: `Q${index} ${fy}`, index };
}

export function rangeLabel(from, to) {
  return `${formatDate(from)} to ${formatDate(to)}`;
}

export function withinRange(value, from, to) {
  const date = startOfDay(value);
  if (!date) return false;
  if (from && date < startOfDay(from)) return false;
  if (to && date > startOfDay(to)) return false;
  return true;
}

/** Every calendar day in a range, inclusive. */
export function eachDay(from, to) {
  const days = [];
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  if (!cursor || !end) return days;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Every month start in a range, inclusive of the month containing `to`. */
export function eachMonth(from, to) {
  const months = [];
  const end = startOfDay(to);
  if (!from || !end) return months;
  let cursor = monthRange(from).from;
  while (cursor <= end) {
    months.push(cursor);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

export function eachWeek(from, to, weekStartsOn = 1) {
  const weeks = [];
  const end = startOfDay(to);
  if (!from || !end) return weeks;
  let cursor = weekRange(from, weekStartsOn).from;
  while (cursor <= end) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function minDate(...values) {
  const dates = values.map(startOfDay).filter(Boolean);
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}

export function maxDate(...values) {
  const dates = values.map(startOfDay).filter(Boolean);
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
}
