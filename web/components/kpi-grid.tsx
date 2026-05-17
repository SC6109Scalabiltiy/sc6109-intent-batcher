import { Boxes, CircleDollarSign, Clock3, Gauge, Percent, RadioTower, ReceiptText, ShieldAlert } from "lucide-react";
import { formatDurationMs, formatInteger, formatPercent, formatRatioPercent, shortHash } from "@/lib/format";
import type { LatestResponse } from "@/lib/types";

export function KpiGrid({ latest }: { latest: LatestResponse | null }) {
  const summary = latest?.summary;
  const batch = latest?.latestBatch;

  const items = [
    {
      label: "Total Intents",
      value: formatInteger(summary?.totalIntents),
      foot: "Seeded DCA records",
      icon: ReceiptText,
      tone: ""
    },
    {
      label: "Due Intents",
      value: formatInteger(summary?.dueIntents),
      foot: "Chain status when RPC is available",
      icon: RadioTower,
      tone: "accent"
    },
    {
      label: "Latest Batch Gas",
      value: formatInteger(batch?.gasUsed),
      foot: batch ? shortHash(batch.txHash) : "-",
      icon: Gauge,
      tone: ""
    },
    {
      label: "Batch Gas / Intent",
      value: formatInteger(summary?.latestGasPerIntent),
      foot: "Benchmark batch path",
      icon: Boxes,
      tone: "accent"
    },
    {
      label: "Gas Reduction",
      value: formatPercent(summary?.latestGasReductionPercent),
      foot: "Naive vs batched",
      icon: Percent,
      tone: "accent"
    },
    {
      label: "Avg Latency",
      value: formatDurationMs(summary?.avgCoordinatorLatencyMs),
      foot: "Coordinator tx wait time",
      icon: Clock3,
      tone: "warning"
    },
    {
      label: "Failure Rate",
      value: formatRatioPercent(summary?.failureRate),
      foot: `${formatInteger(summary?.successfulBatches)} success / ${formatInteger(summary?.failedBatches)} failed`,
      icon: ShieldAlert,
      tone: summary?.failedBatches ? "danger" : "accent"
    },
    {
      label: "Latest Tx",
      value: shortHash(summary?.latestTxHash),
      foot: "Most recent benchmark/coordinator tx",
      icon: CircleDollarSign,
      tone: ""
    }
  ];

  return (
    <section className="grid kpi-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div className={`panel kpi ${item.tone}`} key={item.label}>
            <div className="kpi-label">
              <span className="kpi-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              {item.label}
            </div>
            <div className="kpi-value">{item.value}</div>
            <div className="kpi-foot">{item.foot}</div>
          </div>
        );
      })}
    </section>
  );
}
