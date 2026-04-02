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
 * startStr and endStr are "YYYY-MM-DD" strings.
 * The range is inclusive on both ends (start 00:00:00.000 → end 23:59:59.999).
 */
function dateRangeFilter(startStr, endStr) {
  const start = toUTCDate(startStr);
  const [y, m, d] = endStr.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return { $gte: start, $lte: end };
}

module.exports = { toUTCDate, dateRangeFilter };
