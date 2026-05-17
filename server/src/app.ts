import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { loadDeployment } from "../../lib/deployments.js";
import { listIntents } from "./services/intents.js";
import { coordinatorStats, latestBatch, latestBenchmark, listBatches, metricCurve } from "./services/metrics.js";
import { normalizeNetwork } from "./services/network.js";
import { runBenchmark, runBenchmarkSweep, runCoordinator } from "./services/scripts.js";
import type { SummaryDto } from "./types.js";

const querySchema = z.object({
  network: z.string().optional()
});

const batchesQuerySchema = querySchema.extend({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const baselineBodySchema = z.object({
  network: z.string().optional(),
  agents: z.number().int().positive().max(200).optional(),
  amountUsdc: z.string().min(1).optional()
}).default({});

const sweepBodySchema = z.object({
  network: z.string().optional(),
  counts: z.array(z.number().int().positive().max(200)).min(1).max(12).optional(),
  amountUsdc: z.string().min(1).optional()
}).default({});

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true
  });

  app.get("/api/health", async (request) => {
    const query = querySchema.parse(request.query);
    const network = normalizeNetwork(query.network);
    return {
      ok: true,
      network,
      service: "sc6109-coordinator-api",
      time: new Date().toISOString()
    };
  });

  app.get("/api/deployment", async (request) => {
    const query = querySchema.parse(request.query);
    const network = normalizeNetwork(query.network);
    return {
      network,
      deployment: loadDeployment(network)
    };
  });

  app.get("/api/intents", async (request) => {
    const query = querySchema.parse(request.query);
    const network = normalizeNetwork(query.network);
    const result = await listIntents(network);
    return {
      network,
      ...result
    };
  });

  app.get("/api/batches", async (request) => {
    const query = batchesQuerySchema.parse(request.query);
    const network = normalizeNetwork(query.network);
    return {
      network,
      items: listBatches(network, query.limit)
    };
  });

  app.get("/api/metrics/latest", async (request) => {
    const query = querySchema.parse(request.query);
    const network = normalizeNetwork(query.network);
    const intents = await listIntents(network);
    const benchmark = latestBenchmark(network);
    const batch = latestBatch(network);
    const stats = coordinatorStats(network);
    const summary: SummaryDto = {
      totalIntents: intents.items.length,
      dueIntents: intents.items.filter((intent) => intent.due === true).length,
      latestGasPerIntent: benchmark?.batchGasPerIntent ?? batch?.gasPerIntent ?? null,
      latestGasReductionPercent: benchmark?.gasReductionPercent ?? null,
      avgCoordinatorLatencyMs: stats.avgLatencyMs,
      failureRate: stats.failureRate,
      successfulBatches: stats.successfulBatches,
      failedBatches: stats.failedBatches,
      latestTxHash: benchmark?.batchTx ?? batch?.txHash ?? null
    };

    return {
      network,
      summary,
      latestBatch: batch,
      latestBenchmark: benchmark
    };
  });

  app.get("/api/metrics/curve", async (request) => {
    const query = querySchema.parse(request.query);
    const network = normalizeNetwork(query.network);
    return {
      network,
      items: metricCurve(network)
    };
  });

  app.post("/api/coordinator/run", async (request, reply) => {
    const body = querySchema.default({}).parse(request.body ?? {});
    const network = normalizeNetwork(body.network);
    const result = await runCoordinator(network);
    if (result.exitCode !== 0) {
      reply.code(500);
    }
    return {
      network,
      ...result
    };
  });

  app.post("/api/admin/run-baseline", async (request, reply) => {
    const body = baselineBodySchema.parse(request.body ?? {});
    const network = normalizeNetwork(body.network);
    const result = await runBenchmark(network, {
      agents: body.agents,
      amountUsdc: body.amountUsdc
    });
    if (result.exitCode !== 0) {
      reply.code(500);
    }
    return {
      network,
      ...result
    };
  });

  app.post("/api/admin/run-sweep", async (request, reply) => {
    const body = sweepBodySchema.parse(request.body ?? {});
    const network = normalizeNetwork(body.network);
    const counts = [...new Set(body.counts ?? [1, 3, 5, 10, 25, 50, 100])].sort((a, b) => a - b);
    const results = await runBenchmarkSweep(network, {
      counts,
      amountUsdc: body.amountUsdc
    });
    if (results.some((result) => result.exitCode !== 0)) {
      reply.code(500);
    }
    return {
      network,
      counts,
      results: results.map((result) => ({ network, ...result }))
    };
  });

  return app;
}
