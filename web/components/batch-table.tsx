import { formatDurationMs, formatInteger, formatTimestamp, shortHash } from "@/lib/format";
import type { BatchDto } from "@/lib/types";
import { EmptyState } from "./empty-state";

export function BatchTable({ items, compact = false }: { items: BatchDto[]; compact?: boolean }) {
  if (items.length === 0) {
    return <EmptyState>No batch runs found.</EmptyState>;
  }

  return (
    <div className={compact ? "table-wrap compact-table" : "table-wrap"}>
      <table className="table">
        <thead>
          <tr>
            <th>Executed</th>
            <th>Tx</th>
            <th>Block</th>
            <th>Intents</th>
            <th>Total Gas</th>
            <th>Gas / Intent</th>
            <th>Latency</th>
            {!compact ? <th>Intent IDs</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((batch) => (
            <tr key={batch.txHash}>
              <td>{formatTimestamp(batch.executedAt)}</td>
              <td className="mono">{shortHash(batch.txHash)}</td>
              <td>{formatInteger(batch.blockNumber)}</td>
              <td>{formatInteger(batch.intentCount)}</td>
              <td>{formatInteger(batch.gasUsed)}</td>
              <td>{formatInteger(batch.gasPerIntent)}</td>
              <td>{formatDurationMs(batch.elapsedMs)}</td>
              {!compact ? <td className="mono">{batch.intentIds.map((id) => `#${id}`).join(", ")}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
