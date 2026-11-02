import { DashboardAnalytics, DashboardAnalyticsProps } from './DashboardAnalytics';
import { RevenueMonthPoint } from '../../lib/api';

export interface RevenueChartProps extends DashboardAnalyticsProps {
  revenueByCurrency?: Record<string, RevenueMonthPoint[]>;
}

export default function RevenueChart(props: RevenueChartProps) {
  return (
    <DashboardAnalytics
      defaultCurrency={props.defaultCurrency}
      currenciesInUse={props.currenciesInUse}
    />
  );
}

export { DashboardAnalytics };
