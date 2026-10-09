import { EvilAreaChart } from '@/components/evilcharts/charts/recharts-area-chart';
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart';
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart';
import { COSTS, INCIDENT, formatMoney } from '../../data/incident';

/* The agents' two charts (EvilCharts on Recharts): what the fix cost against a burst, and what the
   next three days would have looked like without them. Demo figures from data/incident.ts. */

const CYAN = '#4fd1e8';
const RED = '#ff5d52';

const COST_CONFIG = {
  fixed: { label: 'Fixed early', colors: { light: [CYAN] } },
  burst: { label: 'After a burst', colors: { light: [RED] } },
} satisfies ChartConfig;

const millions = (v: number) => Math.round(v / 10_000) / 100;

/** "How much they saved": the cost of the fix against the cost of the burst it prevented. */
export function SavingsChart({ fixCost }: { fixCost: number }) {
  const data = [{ cost: 'Cost (AED M)', fixed: millions(fixCost), burst: millions(COSTS.failure) }];
  return (
    <figure className="agent-chart">
      <figcaption>
        <span>Cost of the repair</span>
        <b className="tnum">{formatMoney(COSTS.failure - fixCost)} saved</b>
      </figcaption>
      <EvilBarChart config={COST_CONFIG} data={data} className="aspect-auto h-[132px]" barRadius={5} barGap={10} animationType="left-to-right">
        <EvilBarChart.Grid vertical={false} />
        <EvilBarChart.XAxis dataKey="cost" hide />
        <EvilBarChart.YAxis tickFormatter={(v: number) => `${v}M`} width={34} />
        <EvilBarChart.Bar dataKey="fixed" variant="gradient" glowing />
        <EvilBarChart.Bar dataKey="burst" variant="hatched" />
        <EvilBarChart.Tooltip variant="frosted-glass" />
        <EvilBarChart.Legend align="left" verticalAlign="bottom" />
      </EvilBarChart>
    </figure>
  );
}

const RISK_CONFIG = {
  nobody: { label: 'If nobody acted', colors: { light: [RED] } },
  twin: { label: 'With Al Sajaa Twin', colors: { light: [CYAN] } },
} satisfies ChartConfig;

/** Burst risk over the next 72 hours: the main bursts at about 44 h untouched; the 6-hour repair brings it down. */
const RISK = Array.from({ length: 19 }, (_, i) => {
  const h = i * 4;
  const burstAt = 44;
  const nobody = h < burstAt ? Math.round(INCIDENT.riskBefore + (INCIDENT.riskFuture - INCIDENT.riskBefore) * (h / burstAt) ** 1.6) : 100;
  const twin = h <= INCIDENT.respondWithinHours ? Math.round(INCIDENT.riskBefore - (INCIDENT.riskBefore - 48) * (h / INCIDENT.respondWithinHours)) : Math.max(INCIDENT.riskAfter, Math.round(48 - (48 - INCIDENT.riskAfter) * Math.min(1, (h - INCIDENT.respondWithinHours) / 8)));
  return { hour: `${h}h`, nobody, twin };
});

/** "What would have happened": the next three days with and without the fix. */
export function WhatIfChart() {
  return (
    <figure className="agent-chart">
      <figcaption>
        <span>Risk of a burst, next 72 h</span>
        <b className="tnum">
          {INCIDENT.riskBefore} → {INCIDENT.riskAfter}
        </b>
      </figcaption>
      <EvilAreaChart config={RISK_CONFIG} data={RISK} className="aspect-auto h-[140px]" curveType="monotone" animationType="left-to-right">
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis dataKey="hour" interval={5} />
        <EvilAreaChart.YAxis domain={[0, 100]} ticks={[0, 50, 100]} width={30} />
        <EvilAreaChart.Area dataKey="nobody" variant="gradient" strokeVariant="dashed" />
        <EvilAreaChart.Area dataKey="twin" variant="gradient" />
        <EvilAreaChart.Tooltip variant="frosted-glass" />
        <EvilAreaChart.Legend align="left" verticalAlign="bottom" />
      </EvilAreaChart>
    </figure>
  );
}
