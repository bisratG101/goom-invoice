/**
 * Timezone and date utilities following design.md Section 7.
 *
 * Rules:
 * - Overdue is derived at read time using the business timezone.
 * - Overdue: subset of outstanding (status = 'sent') with due_date < today in the business timezone.
 * - An invoice is NOT overdue on its due date. It becomes overdue only after its due date has passed.
 */

/**
 * Returns today's date formatted as YYYY-MM-DD in the specified IANA timezone.
 */
export function getTodayInTimezone(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback if timezone string is unrecognized
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Addis_Ababa',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }
}

/**
 * Checks whether an invoice is overdue as of a given moment in the business timezone.
 */
export function isInvoiceOverdue(
  status: string,
  dueDate: string | Date,
  timezone: string,
  asOf: Date = new Date()
): boolean {
  if (status !== 'sent') {
    return false;
  }
  const today = getTodayInTimezone(timezone, asOf);
  const dueStr =
    dueDate instanceof Date
      ? dueDate.toISOString().slice(0, 10)
      : String(dueDate).slice(0, 10);
  return dueStr < today;
}
