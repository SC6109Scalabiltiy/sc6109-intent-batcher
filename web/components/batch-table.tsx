"use client";

import { useState } from "react";
import { formatDurationMs, formatInteger, formatTimestamp, shortHash } from "@/lib/format";
import type { BatchDto } from "@/lib/types";
import { EmptyState } from "./empty-state";

export function BatchTable({ items, compact = false }: { items: BatchDto[]; compact?: boolean }) {
  if (items.length === 0) {
    return <EmptyState>No batch runs found.</EmptyState>;
  }

  const hasUserOps = items.some((b) => b.userOpHashes && b.userOpHashes.length > 0);

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
            {!compact && hasUserOps ? <th>Via</th> : null}
            {!compact ? <th>Intent IDs</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((batch) => (
            <BatchRow key={batch.txHash} batch={batch} compact={compact} hasUserOps={hasUserOps} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchRow({ batch, compact, hasUserOps }: { batch: BatchDto; compact: boolean; hasUserOps: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isErc4337 = batch.userOpHashes && batch.userOpHashes.length > 0;

  return (
    <>
      <tr>
        <td>{formatTimestamp(batch.executedAt)}</td>
        <td className="mono">
          <a
            href={`https://sepolia.etherscan.io/tx/${batch.txHash}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", color: "inherit" }}
            title={batch.txHash}
          >
            {shortHash(batch.txHash)}
          </a>
        </td>
        <td>{formatInteger(batch.blockNumber)}</td>
        <td>{formatInteger(batch.intentCount)}</td>
        <td>{formatInteger(batch.gasUsed)}</td>
        <td>{formatInteger(batch.gasPerIntent)}</td>
        <td>{formatDurationMs(batch.elapsedMs)}</td>
        {!compact && hasUserOps ? (
          <td>
            {isErc4337 ? (
              <button
                type="button"
                className="badge ok"
                style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}
                onClick={() => setExpanded((v) => !v)}
                title="Show UserOp hashes"
              >
                handleOps ↗
              </button>
            ) : (
              <span className="badge warn">direct</span>
            )}
          </td>
        ) : null}
        {!compact ? (
          <td className="mono">{batch.intentIds.map((id) => `#${id}`).join(", ")}</td>
        ) : null}
        {compact && isErc4337 ? (
          <td>
            <span className="badge ok" style={{ fontSize: "0.65rem" }}>4337</span>
          </td>
        ) : compact ? <td /> : null}
      </tr>

      {!compact && expanded && isErc4337 && (
        <tr>
          <td colSpan={8} style={{ paddingTop: 0 }}>
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>
                <strong>EntryPoint</strong>{" "}
                <a
                  href={`https://sepolia.etherscan.io/address/${batch.entryPoint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                  style={{ color: "inherit" }}
                >
                  {shortHash(batch.entryPoint ?? "")}
                </a>
                {" · "}
                <strong>Paymaster</strong>{" "}
                <a
                  href={`https://sepolia.etherscan.io/address/${batch.paymasterAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                  style={{ color: "inherit" }}
                >
                  {shortHash(batch.paymasterAddress ?? "")}
                </a>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>
                <strong>UserOp hashes</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {batch.userOpHashes?.map((h) => (
                  <span key={h} className="mono" style={{ fontSize: "0.7rem" }}>{h}</span>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
