"use client";

import { RefreshCw } from "lucide-react";
import { BatchTable } from "@/components/batch-table";
import { useApi } from "@/lib/use-api";
import type { BatchesResponse } from "@/lib/types";

export default function BatchesPage() {
  const batches = useApi<BatchesResponse>("/api/batches?limit=20");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Batch History</p>
          <h1 className="title">Coordinator Runs</h1>
          <p className="subtitle">Coordinator settlement history for on-chain batch executions and their gas metrics.</p>
        </div>
        <button className="button" type="button" onClick={() => void batches.refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Recent Coordinator Batches</h2>
          <span className="badge">{batches.loading ? "Loading" : `${batches.data?.items.length ?? 0} rows`}</span>
        </div>
        {batches.error ? <div className="panel-body status-line">{batches.error}</div> : <BatchTable items={batches.data?.items ?? []} />}
      </section>
    </>
  );
}
