"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AxisId, Comparison } from "@/domains/market";
import { formatPercent, formatUsdExact } from "@/shared/lib/format";
import { usePrefersReducedMotion } from "@/shared/lib/use-reduced-motion";
import { seriesFor } from "../series";
import { radarData } from "./radar-data";

function rawText(axis: AxisId, entity: Comparison["entities"][number]): string {
  if (axis === "revenue") return formatUsdExact(entity.raw.revenue);
  if (axis === "growth") return formatPercent(entity.raw.growthPct, { signed: true });
  return formatPercent(entity.raw.attainmentPct);
}

export default function RadarView({ comparison }: { comparison: Comparison }) {
  const reducedMotion = usePrefersReducedMotion();
  const data = radarData(comparison);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="var(--color-border-strong)" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 13, fill: "var(--color-text)" }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={3} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} />
        {comparison.entities.map((entity, i) => {
          const s = seriesFor(i);
          return (
            <Radar
              key={entity.id}
              name={entity.name}
              dataKey={entity.id}
              stroke={s.color}
              strokeWidth={2.5}
              strokeDasharray={s.dash}
              fill={s.color}
              fillOpacity={0.07}
              isAnimationActive={!reducedMotion}
              connectNulls={false}
            />
          );
        })}
        <Tooltip
          content={({ active, payload }) => {
            const axisId = (payload?.[0]?.payload as { axisId?: AxisId } | undefined)?.axisId;
            const axis = comparison.axes.find((a) => a.id === axisId);
            if (!active || !axis) return null;
            return (
              <div className="rounded-sm border border-border bg-surface p-2 text-xs shadow">
                <p className="font-semibold">{axis.label}</p>
                <ul>
                  {comparison.entities.map((e) => (
                    <li key={e.id}>
                      {e.name}: {rawText(axis.id, e)} <span className="text-muted">({e.scores[axis.id] === null ? "no value, not plotted" : `position ${Math.round(e.scores[axis.id] ?? 0)}`})</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
