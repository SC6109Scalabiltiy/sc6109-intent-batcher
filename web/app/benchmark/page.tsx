"use client";

import { Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { apiPost } from "@/lib/api";
import { formatInteger, formatPercent } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { CurveResponse, ScriptResponse, SweepResponse } from "@/lib/types";

export default function BenchmarkPage() {
  const curve = useApi<CurveResponse>("/api/metrics/curve");
  const [agents, setAgents] = useState("3");
  const [counts, setCounts] = useState("1,3,5,10,25,50,100");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  async function runBenchmark() {
    setRunning(true);
    setRunMessage(null);
    try {
      const result = await apiPost<ScriptResponse>("/api/admin/run-baseline", {
        agents: Number(agents)
      });
      setRunMessage(result.exitCode === 0 ? "Benchmark completed." : result.stderr || "Benchmark failed.");
      await curve.refresh();
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  async function runSweep() {
    const parsedCounts = parseCounts(counts);
    if (parsedCounts.length === 0) {
      setRunMessage("Enter at least one agent count.");
      return;
    }

    setRunning(true);
    setRunMessage(`Running sweep for ${parsedCounts.join(", ")} agents...`);
    try {
      const result = await apiPost<SweepResponse>("/api/admin/run-sweep", {
        counts: parsedCounts
      });
      const failed = result.results.filter((item) => item.exitCode !== 0).length;
      setRunMessage(failed === 0 ? `Sweep completed for ${result.counts.join(", ")}.` : `Sweep completed with ${failed} failed run(s).`);
      await curve.refresh();
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Gas Comparison</p>
          <h1 className="title">Gas / Intent Curve</h1>
        </div>
        <div className="button-row">
          <input className="input" value={agents} onChange={(event) => setAgents(event.target.value)} inputMode="numeric" aria-label="Agent count" />
          <input
            className="input"
            style={{ width: 190 }}
            value={counts}
            onChange={(event) => setCounts(event.target.value)}
            aria-label="Sweep counts"
          />
          <button className="button" type="button" onClick={() => void curve.refresh()}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <button className="button primary" type="button" disabled={running} onClick={() => void runBenchmark()}>
            <Play size={16} aria-hidden="true" />
            Run Benchmark
          </button>
          <button className="button accent" type="button" disabled={running} onClick={() => void runSweep()}>
            <Play size={16} aria-hidden="true" />
            Run Sweep
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Benchmark Curve</h2>
          <span className="badge">{curve.loading ? "Loading" : `${curve.data?.items.length ?? 0} points`}</span>
        </div>
        <div className="panel-body">
          <div className="metric-note" style={{ marginBottom: 12 }}>
            Individual is the naive baseline. Batched is one coordinator settlement transaction.
          </div>
          {curve.error ? <p className="status-line">{curve.error}</p> : <BenchmarkChart items={curve.data?.items ?? []} />}
          <p className="status-line">{runMessage ?? " "}</p>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-header">
          <h2 className="panel-title">Comparison Table</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Agents</th>
                <th>Individual Gas / Intent</th>
                <th>Batched Gas / Intent</th>
                <th>Reduction</th>
              </tr>
            </thead>
            <tbody>
              {(curve.data?.items ?? []).map((point) => (
                <tr key={point.agentCount}>
                  <td>{formatInteger(point.agentCount)}</td>
                  <td>{formatInteger(point.naiveGasPerIntent)}</td>
                  <td>{formatInteger(point.batchGasPerIntent)}</td>
                  <td>{formatPercent(point.gasReductionPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function parseCounts(value: string): number[] {
  return [...new Set(
    value
      .split(",")
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((item) => Number.isFinite(item) && item > 0 && item <= 200)
  )].sort((a, b) => a - b);
}
