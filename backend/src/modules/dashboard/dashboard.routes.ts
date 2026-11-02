import { Router, Request, Response } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth';
import { getDbPool } from '../../db/pool';
import { formatInvoiceDisplayNumber } from '../invoices/invoices.routes';

export const dashboardRouter = Router();

/**
 * Pure helper to reliably determine which currencies are in use for a business:
 * 1. The business default currency is always included.
 * 2. Any currency with at least one legitimate invoice record (draft, sent, paid, void)
 *    belonging to the tenant is included.
 */
export function determineCurrenciesInUse(
  defaultCurrency: 'ETB' | 'USD' | string | undefined,
  invoiceCurrencies: string[]
): Array<'ETB' | 'USD'> {
  const defaultCurr: 'ETB' | 'USD' = defaultCurrency === 'USD' ? 'USD' : 'ETB';
  const usedCurrenciesSet = new Set<'ETB' | 'USD'>([defaultCurr]);
  for (const c of invoiceCurrencies) {
    if (c === 'ETB' || c === 'USD') {
      usedCurrenciesSet.add(c);
    }
  }
  return Array.from(usedCurrenciesSet);
}

/**
 * GET /api/v1/dashboard/summary
 * Per-currency metrics for the authenticated business owner:
 * - Outstanding: sum of sent invoice totals.
 * - Overdue: sent invoices with due_date earlier than today's date in the business timezone.
 * - Paid this month: paid invoice totals where paid_at falls within the current calendar month in the business timezone.
 */
dashboardRouter.get('/summary', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const business = req.business!;
  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  const timezone = business.timezone || 'Africa/Addis_Ababa';

  try {
    /**
     * Exact SQL aggregation using the business timezone:
     * - today_in_tz: (now() AT TIME ZONE $2)::date
     * - start_of_month_in_tz: date_trunc('month', now() AT TIME ZONE $2)
     * - start_of_next_month_in_tz: date_trunc('month', now() AT TIME ZONE $2) + interval '1 month'
     */
    const summarySql = `
      SELECT
        currency,
        COALESCE(SUM(CASE WHEN status = 'sent' THEN total_minor ELSE 0 END), 0)::bigint AS outstanding_minor,
        COALESCE(SUM(CASE WHEN status = 'sent' AND due_date < (now() AT TIME ZONE $2)::date THEN total_minor ELSE 0 END), 0)::bigint AS overdue_minor,
        COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= (date_trunc('month', now() AT TIME ZONE $2) AT TIME ZONE $2) AND paid_at < ((date_trunc('month', now() AT TIME ZONE $2) + interval '1 month') AT TIME ZONE $2) THEN total_minor ELSE 0 END), 0)::bigint AS paid_this_month_minor
      FROM invoices
      WHERE business_id = $1
      GROUP BY currency
    `;

    const summaryRes = await pool.query<{
      currency: 'ETB' | 'USD';
      outstanding_minor: string;
      overdue_minor: string;
      paid_this_month_minor: string;
    }>(summarySql, [business.id, timezone]);

    // Format output as per-currency records
    const currencies: Array<'ETB' | 'USD'> = ['ETB', 'USD'];
    const summary: Record<string, {
      outstandingMinor: number;
      overdueMinor: number;
      paidThisMonthMinor: number;
    }> = {};

    // Initialize both supported currencies with 0
    for (const c of currencies) {
      summary[c] = {
        outstandingMinor: 0,
        overdueMinor: 0,
        paidThisMonthMinor: 0,
      };
    }

    for (const row of summaryRes.rows) {
      summary[row.currency] = {
        outstandingMinor: Number(row.outstanding_minor),
        overdueMinor: Number(row.overdue_minor),
        paidThisMonthMinor: Number(row.paid_this_month_minor),
      };
    }

    const currenciesInUse = determineCurrenciesInUse(
      business.default_currency,
      summaryRes.rows.map((r) => r.currency)
    );
    const hasInvoices = summaryRes.rows.length > 0;

    res.status(200).json({ summary, currenciesInUse, hasInvoices });
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve dashboard summary' },
    });
  }
});

/**
 * GET /api/v1/dashboard/revenue?months=6
 * Monthly paid revenue series grouped by calendar month in the business timezone.
 * Defaults to 6 months. Validates months parameter (1 to 24).
 * Returns series grouped separately by currency. Never combines ETB and USD.
 */
dashboardRouter.get('/revenue', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const business = req.business!;
  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  let months = 6;
  if (req.query.months !== undefined) {
    const parsed = parseInt(String(req.query.months), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 24) {
      res.status(400).json({
        error: {
          code: 'INVALID_MONTHS_PARAMETER',
          message: 'months query parameter must be an integer between 1 and 24',
        },
      });
      return;
    }
    months = parsed;
  }

  const timezone = business.timezone || 'Africa/Addis_Ababa';

  try {
    /**
     * Generates a monthly series spanning the requested number of calendar months
     * up to the current calendar month in the business timezone.
     * Uses SQL aggregation with date_trunc in the business timezone.
     */
    const revenueSql = `
      WITH month_series AS (
        SELECT generate_series(
          date_trunc('month', (now() AT TIME ZONE $2)) - (($3::int - 1) * interval '1 month'),
          date_trunc('month', (now() AT TIME ZONE $2)),
          interval '1 month'
        ) AS month_start_tz
      ),
      currencies AS (
        SELECT unnest(ARRAY['ETB', 'USD']) AS currency
      ),
      grid AS (
        SELECT
          to_char(m.month_start_tz, 'YYYY-MM') AS month,
          m.month_start_tz,
          c.currency
        FROM month_series m
        CROSS JOIN currencies c
      ),
      paid_revenue AS (
        SELECT
          to_char(date_trunc('month', i.paid_at AT TIME ZONE $2), 'YYYY-MM') AS month,
          i.currency,
          SUM(i.total_minor) AS revenue_minor
        FROM invoices i
        WHERE i.business_id = $1
          AND i.status = 'paid'
          AND i.paid_at IS NOT NULL
          AND i.paid_at >= ((date_trunc('month', (now() AT TIME ZONE $2)) - (($3::int - 1) * interval '1 month')) AT TIME ZONE $2)
          AND i.paid_at < (((date_trunc('month', (now() AT TIME ZONE $2)) + interval '1 month')) AT TIME ZONE $2)
        GROUP BY 1, 2
      )
      SELECT
        g.month,
        g.currency,
        COALESCE(p.revenue_minor, 0)::bigint AS revenue_minor
      FROM grid g
      LEFT JOIN paid_revenue p ON p.month = g.month AND p.currency = g.currency
      ORDER BY g.month ASC, g.currency ASC
    `;

    const revenueRes = await pool.query<{
      month: string;
      currency: 'ETB' | 'USD';
      revenue_minor: string;
    }>(revenueSql, [business.id, timezone, months]);

    const revenueByCurrency: Record<string, Array<{ month: string; revenueMinor: number }>> = {
      ETB: [],
      USD: [],
    };

    for (const row of revenueRes.rows) {
      if (!revenueByCurrency[row.currency]) {
        revenueByCurrency[row.currency] = [];
      }
      revenueByCurrency[row.currency].push({
        month: row.month,
        revenueMinor: Number(row.revenue_minor),
      });
    }

    res.status(200).json({
      months,
      revenue: revenueByCurrency,
    });
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve revenue series' },
    });
  }
});

/**
 * GET /api/v1/dashboard/analytics
 * Shared timeline analytics query for both Line chart (Revenue trend) and
 * Histogram/Bar chart (Invoiced vs Collected).
 *
 * Query params:
 *   - period: '7d' | '30d' | '3m' | '6m' | '12m' | 'all' (default: '6m')
 *
 * Returns:
 *   - period: string
 *   - interval: 'day' | 'month'
 *   - timezone: string
 *   - series: { ETB: AnalyticsPoint[], USD: AnalyticsPoint[] }
 *   - totals: { ETB: AnalyticsTotals, USD: AnalyticsTotals }
 */
dashboardRouter.get('/analytics', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const business = req.business!;
  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  const validPeriods = ['7d', '30d', '3m', '6m', '12m', 'all'] as const;
  type Period = (typeof validPeriods)[number];

  const rawPeriod = req.query.period !== undefined ? String(req.query.period).toLowerCase() : '6m';
  if (!validPeriods.includes(rawPeriod as Period)) {
    res.status(400).json({
      error: {
        code: 'INVALID_PERIOD_PARAMETER',
        message: 'period query parameter must be one of: 7d, 30d, 3m, 6m, 12m, all',
      },
    });
    return;
  }

  const period = rawPeriod as Period;
  const timezone = business.timezone || 'Africa/Addis_Ababa';

  try {
    const isDaily = period === '7d' || period === '30d';
    let querySql = '';
    let queryParams: any[] = [];

    if (isDaily) {
      const days = period === '7d' ? 7 : 30;
      queryParams = [business.id, timezone, days];
      querySql = `
        WITH date_series AS (
          SELECT generate_series(
            (now() AT TIME ZONE $2)::date - ($3::int - 1),
            (now() AT TIME ZONE $2)::date,
            interval '1 day'
          )::date AS day_tz
        ),
        currencies AS (
          SELECT unnest(ARRAY['ETB', 'USD']) AS currency
        ),
        grid AS (
          SELECT
            to_char(d.day_tz, 'YYYY-MM-DD') AS bucket_key,
            to_char(d.day_tz, 'Mon DD') AS label,
            d.day_tz,
            c.currency
          FROM date_series d
          CROSS JOIN currencies c
        ),
        paid_agg AS (
          SELECT
            to_char(date_trunc('day', i.paid_at AT TIME ZONE $2), 'YYYY-MM-DD') AS bucket_key,
            i.currency,
            SUM(i.total_minor) AS paid_minor,
            COUNT(i.id) AS paid_count
          FROM invoices i
          WHERE i.business_id = $1
            AND i.status = 'paid'
            AND i.paid_at IS NOT NULL
            AND i.paid_at >= ((now() AT TIME ZONE $2)::date - ($3::int - 1))::timestamp AT TIME ZONE $2
            AND i.paid_at < (((now() AT TIME ZONE $2)::date + interval '1 day'))::timestamp AT TIME ZONE $2
          GROUP BY 1, 2
        ),
        invoiced_agg AS (
          SELECT
            to_char(i.issue_date, 'YYYY-MM-DD') AS bucket_key,
            i.currency,
            SUM(i.total_minor) AS invoiced_minor,
            COUNT(i.id) AS invoiced_count
          FROM invoices i
          WHERE i.business_id = $1
            AND i.status IN ('sent', 'paid', 'overdue')
            AND i.issue_date >= ((now() AT TIME ZONE $2)::date - ($3::int - 1))
            AND i.issue_date <= (now() AT TIME ZONE $2)::date
          GROUP BY 1, 2
        )
        SELECT
          g.bucket_key,
          g.label,
          g.currency,
          COALESCE(p.paid_minor, 0)::bigint AS paid_minor,
          COALESCE(p.paid_count, 0)::int AS paid_count,
          COALESCE(inv.invoiced_minor, 0)::bigint AS invoiced_minor,
          COALESCE(inv.invoiced_count, 0)::int AS invoiced_count
        FROM grid g
        LEFT JOIN paid_agg p ON p.bucket_key = g.bucket_key AND p.currency = g.currency
        LEFT JOIN invoiced_agg inv ON inv.bucket_key = g.bucket_key AND inv.currency = g.currency
        ORDER BY g.day_tz ASC, g.currency ASC
      `;
    } else {
      let months = 6;
      if (period === '3m') months = 3;
      else if (period === '6m') months = 6;
      else if (period === '12m') months = 12;
      else if (period === 'all') {
        const spanRes = await pool.query<{ months: string }>(
          `
          SELECT COALESCE(
            GREATEST(6,
              (EXTRACT(year FROM age(date_trunc('month', now() AT TIME ZONE $2), date_trunc('month', MIN(LEAST(issue_date, (paid_at AT TIME ZONE $2)::date))))) * 12 +
               EXTRACT(month FROM age(date_trunc('month', now() AT TIME ZONE $2), date_trunc('month', MIN(LEAST(issue_date, (paid_at AT TIME ZONE $2)::date))))) + 1)::int
            ),
            6
          ) AS months
          FROM invoices
          WHERE business_id = $1
          `,
          [business.id, timezone]
        );
        months = parseInt(spanRes.rows[0]?.months || '6', 10);
      }

      queryParams = [business.id, timezone, months];
      querySql = `
        WITH month_series AS (
          SELECT generate_series(
            date_trunc('month', (now() AT TIME ZONE $2)) - (($3::int - 1) * interval '1 month'),
            date_trunc('month', (now() AT TIME ZONE $2)),
            interval '1 month'
          ) AS month_start_tz
        ),
        currencies AS (
          SELECT unnest(ARRAY['ETB', 'USD']) AS currency
        ),
        grid AS (
          SELECT
            to_char(m.month_start_tz, 'YYYY-MM') AS bucket_key,
            to_char(m.month_start_tz, 'Mon YYYY') AS label,
            m.month_start_tz,
            c.currency
          FROM month_series m
          CROSS JOIN currencies c
        ),
        paid_agg AS (
          SELECT
            to_char(date_trunc('month', i.paid_at AT TIME ZONE $2), 'YYYY-MM') AS bucket_key,
            i.currency,
            SUM(i.total_minor) AS paid_minor,
            COUNT(i.id) AS paid_count
          FROM invoices i
          WHERE i.business_id = $1
            AND i.status = 'paid'
            AND i.paid_at IS NOT NULL
            AND i.paid_at >= ((date_trunc('month', (now() AT TIME ZONE $2)) - (($3::int - 1) * interval '1 month')) AT TIME ZONE $2)
            AND i.paid_at < (((date_trunc('month', (now() AT TIME ZONE $2)) + interval '1 month')) AT TIME ZONE $2)
          GROUP BY 1, 2
        ),
        invoiced_agg AS (
          SELECT
            to_char(date_trunc('month', i.issue_date::timestamp), 'YYYY-MM') AS bucket_key,
            i.currency,
            SUM(i.total_minor) AS invoiced_minor,
            COUNT(i.id) AS invoiced_count
          FROM invoices i
          WHERE i.business_id = $1
            AND i.status IN ('sent', 'paid', 'overdue')
            AND i.issue_date >= (date_trunc('month', (now() AT TIME ZONE $2)) - (($3::int - 1) * interval '1 month'))::date
            AND i.issue_date < (date_trunc('month', (now() AT TIME ZONE $2)) + interval '1 month')::date
          GROUP BY 1, 2
        )
        SELECT
          g.bucket_key,
          g.label,
          g.currency,
          COALESCE(p.paid_minor, 0)::bigint AS paid_minor,
          COALESCE(p.paid_count, 0)::int AS paid_count,
          COALESCE(inv.invoiced_minor, 0)::bigint AS invoiced_minor,
          COALESCE(inv.invoiced_count, 0)::int AS invoiced_count
        FROM grid g
        LEFT JOIN paid_agg p ON p.bucket_key = g.bucket_key AND p.currency = g.currency
        LEFT JOIN invoiced_agg inv ON inv.bucket_key = g.bucket_key AND inv.currency = g.currency
        ORDER BY g.month_start_tz ASC, g.currency ASC
      `;
    }

    const result = await pool.query<{
      bucket_key: string;
      label: string;
      currency: 'ETB' | 'USD';
      paid_minor: string;
      paid_count: number;
      invoiced_minor: string;
      invoiced_count: number;
    }>(querySql, queryParams);

    const seriesByCurrency: Record<
      'ETB' | 'USD',
      Array<{
        key: string;
        label: string;
        paidMinor: number;
        paidCount: number;
        invoicedMinor: number;
        invoicedCount: number;
      }>
    > = {
      ETB: [],
      USD: [],
    };

    const totalsByCurrency: Record<
      'ETB' | 'USD',
      {
        totalPaidMinor: number;
        totalPaidCount: number;
        totalInvoicedMinor: number;
        totalInvoicedCount: number;
        collectionRatePercent: number;
      }
    > = {
      ETB: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
      USD: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
    };

    for (const row of result.rows) {
      const paidMinor = Number(row.paid_minor);
      const paidCount = Number(row.paid_count);
      const invoicedMinor = Number(row.invoiced_minor);
      const invoicedCount = Number(row.invoiced_count);

      if (seriesByCurrency[row.currency]) {
        seriesByCurrency[row.currency].push({
          key: row.bucket_key,
          label: row.label,
          paidMinor,
          paidCount,
          invoicedMinor,
          invoicedCount,
        });

        totalsByCurrency[row.currency].totalPaidMinor += paidMinor;
        totalsByCurrency[row.currency].totalPaidCount += paidCount;
        totalsByCurrency[row.currency].totalInvoicedMinor += invoicedMinor;
        totalsByCurrency[row.currency].totalInvoicedCount += invoicedCount;
      }
    }

    // Compute collection rate percentages
    for (const curr of ['ETB', 'USD'] as const) {
      const tot = totalsByCurrency[curr];
      if (tot.totalInvoicedMinor > 0) {
        tot.collectionRatePercent = Math.round((tot.totalPaidMinor / tot.totalInvoicedMinor) * 1000) / 10;
      } else if (tot.totalPaidMinor > 0) {
        tot.collectionRatePercent = 100;
      }
    }

    res.status(200).json({
      period,
      interval: isDaily ? 'day' : 'month',
      timezone,
      series: seriesByCurrency,
      totals: totalsByCurrency,
    });
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve analytics series' },
    });
  }
});

/**
 * GET /api/v1/dashboard/activity
 * Returns the latest 10 invoice events (sent, paid, voided).
 * Ordered by event timestamp, newest first.
 * Uses existing invoice timestamps without inventing extra schema.
 */
dashboardRouter.get('/activity', requireAuth, requireOwner, async (req: Request, res: Response) => {
  const business = req.business!;
  const pool = getDbPool();
  if (!pool) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: 'Database connection unavailable' },
    });
    return;
  }

  try {
    /**
     * Unpivots sent_at, paid_at, and voided_at into discrete chronological events.
     */
    const activitySql = `
      WITH invoice_events AS (
        SELECT
          i.id AS invoice_id,
          i.number,
          b.invoice_prefix,
          c.name AS client_name,
          i.currency,
          i.total_minor,
          'sent' AS event_type,
          i.sent_at AS timestamp
        FROM invoices i
        JOIN businesses b ON b.id = i.business_id
        JOIN clients c ON c.id = i.client_id
        WHERE i.business_id = $1 AND i.sent_at IS NOT NULL

        UNION ALL

        SELECT
          i.id AS invoice_id,
          i.number,
          b.invoice_prefix,
          c.name AS client_name,
          i.currency,
          i.total_minor,
          'paid' AS event_type,
          i.paid_at AS timestamp
        FROM invoices i
        JOIN businesses b ON b.id = i.business_id
        JOIN clients c ON c.id = i.client_id
        WHERE i.business_id = $1 AND i.paid_at IS NOT NULL

        UNION ALL

        SELECT
          i.id AS invoice_id,
          i.number,
          b.invoice_prefix,
          c.name AS client_name,
          i.currency,
          i.total_minor,
          'voided' AS event_type,
          i.voided_at AS timestamp
        FROM invoices i
        JOIN businesses b ON b.id = i.business_id
        JOIN clients c ON c.id = i.client_id
        WHERE i.business_id = $1 AND i.voided_at IS NOT NULL
      )
      SELECT *
      FROM invoice_events
      ORDER BY timestamp DESC
      LIMIT 10
    `;

    const activityRes = await pool.query<{
      invoice_id: string;
      number: number | null;
      invoice_prefix: string;
      client_name: string;
      currency: 'ETB' | 'USD';
      total_minor: string;
      event_type: 'sent' | 'paid' | 'voided';
      timestamp: Date;
    }>(activitySql, [business.id]);

    const activity = activityRes.rows.map((row) => ({
      invoiceId: row.invoice_id,
      displayNumber: formatInvoiceDisplayNumber(row.invoice_prefix, row.number),
      clientName: row.client_name,
      currency: row.currency,
      totalMinor: Number(row.total_minor),
      eventType: row.event_type,
      timestamp: row.timestamp.toISOString(),
    }));

    res.status(200).json({ activity });
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve recent activity' },
    });
  }
});
