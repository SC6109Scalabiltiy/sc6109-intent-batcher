import { formatInteger, formatTimestamp, shortHash } from "@/lib/format";
import type { IntentDto } from "@/lib/types";
import { EmptyState } from "./empty-state";

export function IntentTable({ items }: { items: IntentDto[] }) {
  if (items.length === 0) {
    return <EmptyState>No intents found.</EmptyState>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Intent</th>
            <th>Agent</th>
            <th>Owner</th>
            <th>Amount In</th>
            <th>Min Out</th>
            <th>Next Execution</th>
            <th>Status</th>
            <th>Executions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((intent) => (
            <tr key={intent.intentId}>
              <td className="mono">#{intent.intentId}</td>
              <td className="mono">#{intent.agentId}</td>
              <td className="mono">{shortHash(intent.owner)}</td>
              <td>{formatInteger(intent.amountIn)}</td>
              <td>{formatInteger(intent.minAmountOut)}</td>
              <td>{formatTimestamp(intent.nextExecution)}</td>
              <td>
                <IntentStatus intent={intent} />
              </td>
              <td>
                {formatInteger(intent.executions)}
                {intent.maxExecutions > 0 ? ` / ${formatInteger(intent.maxExecutions)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function IntentStatus({ intent }: { intent: IntentDto }) {
  if (!intent.active) {
    return <span className="badge danger">Inactive</span>;
  }
  if (intent.due === true) {
    return <span className="badge ok">Due</span>;
  }
  if (intent.due === false) {
    return <span className="badge">Pending</span>;
  }
  return <span className="badge warn">Unknown</span>;
}
