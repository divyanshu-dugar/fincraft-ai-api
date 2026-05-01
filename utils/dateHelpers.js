/**
 * True iff the input is a bare YYYY-MM-DD string (no time/timezone info).
 */
function isDateOnly(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

/**
 * Parse a YYYY-MM-DD date string into a UTC midnight Date.
 * Always returns the same calendar date regardless of server timezone.
 *
 * @param {string} dateStr – "YYYY-MM-DD"
 * @returns {Date}
 */
function toUTCDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Build a Mongoose date range filter { $gte, $lte } for a query.
 *
 * Accepts two formats for each end of the range:
 *   1. Bare YYYY-MM-DD strings (legacy callers, server-side cron jobs).
 *      Treated as UTC midnight (start) / UTC end-of-day (end).
 *   2. Full ISO-8601 timestamps with timezone offset (preferred — sent by
 *      browser clients). Used as-is, so the user's local-day boundaries
 *      are preserved end-to-end.
 *
 * Mixing formats is allowed (e.g. legacy date-only start + ISO end).
 */
function dateRangeFilter(startStr, endStr) {
  const start = isDateOnly(startStr) ? toUTCDate(startStr) : new Date(startStr);

  let end;
  if (isDateOnly(endStr)) {
    const [y, m, d] = endStr.split('-').map(Number);
    end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  } else {
    end = new Date(endStr);
  }

  return { $gte: start, $lte: end };
}

module.exports = { toUTCDate, dateRangeFilter, isDateOnly };
