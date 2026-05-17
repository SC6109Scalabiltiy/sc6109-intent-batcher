"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CurvePointDto } from "@/lib/types";
import { EmptyState } from "./empty-state";

type ChartPoint = {
  agentCount: number;
  naive: number;
  batched: number;
  reduction: number;
};

export function BenchmarkChart({ items }: { items: CurvePointDto[] }) {
  const data: ChartPoint[] = items.map((item) => ({
    agentCount: item.agentCount,
    naive: Number(item.naiveGasPerIntent),
    batched: Number(item.batchGasPerIntent),
    reduction: item.gasReductionPercent
  }));

  if (data.length === 0) {
    return <EmptyState>No benchmark metrics found.</EmptyState>;
  }

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="agentCount" tickLine={false} axisLine={false} stroke="var(--muted)" />
          <YAxis tickLine={false} axisLine={false} stroke="var(--muted)" tickFormatter={(value) => Number(value).toLocaleString()} />
          <Tooltip
            formatter={(value) => Number(value).toLocaleString()}
            contentStyle={{
              background: "var(--chart-tooltip-bg)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--foreground)"
            }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Legend />
          <Line type="monotone" dataKey="naive" name="Individual" stroke="#fb7185" strokeWidth={2} dot />
          <Line type="monotone" dataKey="batched" name="Batched" stroke="#14b8a6" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
