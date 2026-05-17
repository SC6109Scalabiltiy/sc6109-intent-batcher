"use client";

import { RefreshCw } from "lucide-react";
import { IntentTable } from "@/components/intent-table";
import { useApi } from "@/lib/use-api";
import type { IntentsResponse } from "@/lib/types";

export default function IntentsPage() {
  const intents = useApi<IntentsResponse>("/api/intents");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Intent State</p>
          <h1 className="title">Open DCA Intents</h1>
          <p className="subtitle">Due status is read from `BatchDcaSettlement.isDue` when an RPC endpoint is configured.</p>
        </div>
        <button className="button" type="button" onClick={() => void intents.refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Seeded Intents</h2>
          <span className={intents.data?.dueSource === "chain" ? "badge ok" : "badge warn"}>
            {intents.data?.dueSource === "chain" ? "Chain due checks" : "Local data"}
          </span>
        </div>
        {intents.error ? <div className="panel-body status-line">{intents.error}</div> : <IntentTable items={intents.data?.items ?? []} />}
      </section>
    </>
  );
}
