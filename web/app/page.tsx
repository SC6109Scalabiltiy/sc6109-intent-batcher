"use client";

import { Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BatchTable } from "@/components/batch-table";
import { KpiGrid } from "@/components/kpi-grid";
import { apiPost } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { BatchesResponse, LatestResponse, PaymasterBalanceResponse, ScriptResponse } from "@/lib/types";
import { shortHash } from "@/lib/format";

export default function OverviewPage() {
  const latest = useApi<LatestResponse>("/api/metrics/latest");
  const batches = useApi<BatchesResponse>("/api/batches?limit=5");
  const paymaster = useApi<PaymasterBalanceResponse>("/api/paymaster/balance");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  async function runCoordinator() {
    setRunning(true);
    setRunMessage(null);
    try {
      const result = await apiPost<ScriptResponse>("/api/coordinator/run", {});
      setRunMessage(result.exitCode === 0 ? "Coordinator run completed." : result.stderr || "Coordinator run failed.");
      await Promise.all([latest.refresh(), batches.refresh(), paymaster.refresh()]);
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  const pm = paymaster.data;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Coordinator Dashboard</p>
          <h1 className="title">Scheduled Intent Batcher</h1>
        </div>
        <div className="button-row">
          <button className="button" type="button" onClick={() => void latest.refresh()}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <button className="button primary" type="button" disabled={running} onClick={() => void runCoordinator()}>
            <Play size={16} aria-hidden="true" />
            Run Coordinator
          </button>
        </div>
      </header>

      <KpiGrid latest={latest.data} paymaster={pm ?? null} />

      {pm && pm.paymasterAddress !== "unknown" && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-header">
            <h2 className="panel-title">ERC-4337 Account Abstraction</h2>
            <span className="badge ok">Active</span>
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px 24px" }}>
              <InfoRow label="EntryPoint" value={shortHash(pm.entryPoint)} full={pm.entryPoint} href={`https://sepolia.etherscan.io/address/${pm.entryPoint}`} />
              <InfoRow label="VerifyingPaymaster" value={shortHash(pm.paymasterAddress)} full={pm.paymasterAddress} href={`https://sepolia.etherscan.io/address/${pm.paymasterAddress}`} />
              <InfoRow label="Paymaster Deposit" value={`${pm.depositEth} ETH`} />
              <InfoRow label="Gas Model" value="Coordinator-signed paymaster · agents pay 0 ETH" />
            </div>
          </div>
        </section>
      )}

      <section className="grid overview-grid" style={{ marginTop: 14 }}>
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Latest Coordinator Runs</h2>
            <span className="badge">{batches.loading ? "Loading" : `${batches.data?.items.length ?? 0} rows`}</span>
          </div>
          {batches.error ? <div className="panel-body status-line">{batches.error}</div> : <BatchTable compact items={batches.data?.items ?? []} />}
        </div>
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Run Status</h2>
          </div>
          <div className="panel-body">
            <div className="metric-note">MVP data combines Sepolia contract reads with saved coordinator and benchmark metrics.</div>
            <p className="status-line">{runMessage ?? latest.error ?? "Ready."}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function InfoRow({
  label,
  value,
  full,
  href,
}: {
  label: string;
  value: string;
  full?: string;
  href?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mono"
          title={full}
          style={{ fontSize: "0.85rem", color: "inherit", textDecoration: "none" }}
        >
          {value}
        </a>
      ) : (
        <span className="mono" title={full} style={{ fontSize: "0.85rem" }}>
          {value}
        </span>
      )}
    </div>
  );
}
