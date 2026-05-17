import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { metricsRoot } from "../../../lib/paths.js";
import type { BatchDto, BenchmarkDto, CurvePointDto } from "../types.js";
import type { NetworkName } from "./network.js";

type RawCoordinatorMetric = {
  schema?: string;
  network?: string;
  status?: "success" | "failed";
  txHash?: string;
  blockNumber?: number;
  intentCount?: number;
  intentIds?: string[];
  gasUsed?: string;
  gasPerIntent?: string;
  elapsedMs?: number;
  executedAt?: string;
};

type RawBenchmarkMetric = {
  schema?: string;
  network?: string;
  agentCount?: number;
  naiveGas?: string;
  naiveGasPerIntent?: string;
  batchGas?: string;
  batchGasPerIntent?: string;
  gasReductionPercent?: number;
  batchTx?: string;
  measuredAt?: string;
};

type MetricFile<T> = {
  file: string;
  mtimeMs: number;
  value: T;
};

export function listBatches(networkName: NetworkName, limit: number): BatchDto[] {
  return readJsonMetricFiles<RawCoordinatorMetric>(networkName, "coordinator")
    .map((entry) => toBatchDto(entry.value, entry.mtimeMs))
    .filter((batch): batch is BatchDto => batch !== null)
    .sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt))
    .slice(0, limit);
}

export function latestBatch(networkName: NetworkName): BatchDto | null {
  return listBatches(networkName, 1)[0] ?? null;
}

export function coordinatorStats(networkName: NetworkName): {
  successfulBatches: number;
  failedBatches: number;
  failureRate: number | null;
  avgLatencyMs: number | null;
} {
  const entries = readJsonMetricFiles<RawCoordinatorMetric>(networkName, "coordinator");
  const successful = entries.filter((entry) => toBatchDto(entry.value, entry.mtimeMs) !== null);
  const failed = entries.filter((entry) => entry.value.status === "failed" || entry.value.schema?.includes("failure"));
  const latencyValues = successful
    .map((entry) => entry.value.elapsedMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const totalAttempts = successful.length + failed.length;

  return {
    successfulBatches: successful.length,
    failedBatches: failed.length,
    failureRate: totalAttempts > 0 ? failed.length / totalAttempts : null,
    avgLatencyMs: latencyValues.length > 0
      ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
      : null
  };
}

export function listBenchmarkMetrics(networkName: NetworkName): BenchmarkDto[] {
  const byAgentCount = new Map<number, BenchmarkDto & { sortTime: number; source: "json" | "csv" }>();

  for (const entry of readCsvBenchmarkFiles(networkName)) {
    const metric = csvRowToBenchmarkDto(entry.value, entry.mtimeMs);
    if (!metric) {
      continue;
    }
    const existing = byAgentCount.get(metric.agentCount);
    if (!existing) {
      byAgentCount.set(metric.agentCount, { ...metric, sortTime: entry.mtimeMs, source: "csv" });
    }
  }

  for (const entry of readJsonMetricFiles<RawBenchmarkMetric>(networkName, "benchmark")) {
    const metric = toBenchmarkDto(entry.value, entry.mtimeMs);
    if (!metric) {
      continue;
    }
    const existing = byAgentCount.get(metric.agentCount);
    const sortTime = Date.parse(metric.measuredAt) || entry.mtimeMs;
    if (!existing || existing.source === "csv" || sortTime > existing.sortTime) {
      byAgentCount.set(metric.agentCount, { ...metric, sortTime, source: "json" });
    }
  }

  return [...byAgentCount.values()]
    .sort((a, b) => a.agentCount - b.agentCount)
    .map(({ sortTime: _sortTime, source: _source, ...metric }) => metric);
}

export function metricCurve(networkName: NetworkName): CurvePointDto[] {
  return listBenchmarkMetrics(networkName).map(
    ({ agentCount, naiveGasPerIntent, batchGasPerIntent, gasReductionPercent }) => ({
      agentCount,
      naiveGasPerIntent,
      batchGasPerIntent,
      gasReductionPercent
    })
  );
}

export function latestBenchmark(networkName: NetworkName): BenchmarkDto | null {
  return listBenchmarkMetrics(networkName)
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0] ?? null;
}

function readJsonMetricFiles<T>(networkName: NetworkName, label: "coordinator" | "benchmark"): MetricFile<T>[] {
  if (!existsSync(metricsRoot)) {
    return [];
  }

  return readdirSync(metricsRoot)
    .filter((file) => file.startsWith(`${networkName}-${label}-`) && file.endsWith(".json"))
    .map((file) => {
      const path = resolve(metricsRoot, file);
      return {
        file,
        mtimeMs: statSync(path).mtimeMs,
        value: JSON.parse(readFileSync(path, "utf8")) as T
      };
    });
}

function readCsvBenchmarkFiles(networkName: NetworkName): MetricFile<Record<string, string>>[] {
  if (!existsSync(metricsRoot)) {
    return [];
  }

  return readdirSync(metricsRoot)
    .filter((file) => file.startsWith(`${networkName}-benchmark-`) && file.endsWith(".csv"))
    .flatMap((file) => {
      const path = resolve(metricsRoot, file);
      const rows = parseCsv(readFileSync(path, "utf8"));
      return rows.map((row) => ({ file, mtimeMs: statSync(path).mtimeMs, value: row }));
    });
}

function toBatchDto(metric: RawCoordinatorMetric, mtimeMs: number): BatchDto | null {
  if (!metric.txHash || !metric.gasUsed || !metric.gasPerIntent) {
    return null;
  }

  return {
    txHash: metric.txHash,
    blockNumber: metric.blockNumber ?? 0,
    intentCount: metric.intentCount ?? metric.intentIds?.length ?? 0,
    gasUsed: metric.gasUsed,
    gasPerIntent: metric.gasPerIntent,
    elapsedMs: metric.elapsedMs ?? null,
    intentIds: metric.intentIds ?? [],
    executedAt: metric.executedAt ?? new Date(mtimeMs).toISOString()
  };
}

function toBenchmarkDto(metric: RawBenchmarkMetric, mtimeMs: number): BenchmarkDto | null {
  if (
    metric.agentCount === undefined ||
    !metric.naiveGas ||
    !metric.naiveGasPerIntent ||
    !metric.batchGas ||
    !metric.batchGasPerIntent ||
    metric.gasReductionPercent === undefined ||
    !metric.batchTx
  ) {
    return null;
  }

  return {
    network: metric.network ?? "unknown",
    agentCount: metric.agentCount,
    naiveGas: metric.naiveGas,
    naiveGasPerIntent: metric.naiveGasPerIntent,
    batchGas: metric.batchGas,
    batchGasPerIntent: metric.batchGasPerIntent,
    gasReductionPercent: metric.gasReductionPercent,
    batchTx: metric.batchTx,
    measuredAt: metric.measuredAt ?? new Date(mtimeMs).toISOString()
  };
}

function csvRowToBenchmarkDto(row: Record<string, string>, mtimeMs: number): BenchmarkDto | null {
  const agentCount = Number.parseInt(row.agentCount ?? "", 10);
  const gasReductionPercent = Number.parseFloat(row.gasReductionPercent ?? "");
  if (
    !Number.isFinite(agentCount) ||
    !Number.isFinite(gasReductionPercent) ||
    !row.naiveGas ||
    !row.naiveGasPerIntent ||
    !row.batchGas ||
    !row.batchGasPerIntent ||
    !row.batchTx
  ) {
    return null;
  }

  return {
    network: row.network ?? "unknown",
    agentCount,
    naiveGas: row.naiveGas,
    naiveGasPerIntent: row.naiveGasPerIntent,
    batchGas: row.batchGas,
    batchGasPerIntent: row.batchGasPerIntent,
    gasReductionPercent,
    batchTx: row.batchTx,
    measuredAt: new Date(mtimeMs).toISOString()
  };
}

function parseCsv(body: string): Record<string, string>[] {
  const lines = body.trim().split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;
  if (!header) {
    return [];
  }

  const columns = header.split(",");
  return rows.map((row) => {
    const values = row.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
  });
}
