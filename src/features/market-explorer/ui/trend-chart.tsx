"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/domains/market";
import { formatPeriod, formatUsdAxis, formatUsdExact } from "@/shared/lib/format";
import { usePrefersReducedMotion } from "@/shared/lib/use-reduced-motion";

/** Actual, forecast and prior year differ by line style as well as colour. */
export default function TrendChart({ points, period }: { points: SeriesPoint[]; period: string }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={formatPeriod}
          interval="preserveStartEnd"
          minTickGap={32}
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
          stroke="var(--color-border-strong)"
        />
        <YAxis
          width={56}
          tickFormatter={formatUsdAxis}
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
          stroke="var(--color-border-strong)"
        />
        <Tooltip
          labelFormatter={(label) => formatPeriod(String(label))}
          formatter={(value) => formatUsdExact(typeof value === "number" ? value : null)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine
          x={period}
          stroke="var(--color-text)"
          strokeWidth={1.5}
          label={{ value: formatPeriod(period), position: "insideTopRight", fontSize: 12, fill: "var(--color-text)" }}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Actual"
          stroke="var(--color-accent)"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={!reducedMotion}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          name="Forecast"
          stroke="var(--color-status-at-risk)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          isAnimationActive={!reducedMotion}
        />
        <Line
          type="monotone"
          dataKey="priorYear"
          name="Prior year"
          stroke="var(--color-text-muted)"
          strokeWidth={2}
          strokeDasharray="1 4"
          strokeLinecap="round"
          dot={false}
          isAnimationActive={!reducedMotion}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
