import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";

describe("coordinator api", () => {
  beforeAll(() => {
    process.env.SEPOLIA_RPC_URL = "";
    process.env.RPC_URL = "";
  });

  it("returns health status", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/api/health?network=sepolia" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      network: "sepolia"
    });
  });

  it("returns deployment data", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/api/deployment?network=sepolia" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.deployment.BatchDcaSettlement).toBeDefined();
  });

  it("returns intent dto shape with unknown due when chain is unavailable", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/api/intents?network=sepolia" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        intentId: "1",
        agentId: "1",
        amountIn: "10000000",
        active: true
      })
    );
  });

  it("returns coordinator batch history", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/api/batches?network=sepolia&limit=5" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        intentCount: 3,
        gasPerIntent: "61657"
      })
    );
  });

  it("returns latest benchmark summary and gas curve", async () => {
    const app = buildServer();
    const latest = await app.inject({ method: "GET", url: "/api/metrics/latest?network=sepolia" });
    const curve = await app.inject({ method: "GET", url: "/api/metrics/curve?network=sepolia" });

    expect(latest.statusCode).toBe(200);
    expect(latest.json().summary).toMatchObject({
      totalIntents: 3,
      latestGasPerIntent: "50257",
      latestGasReductionPercent: 42.6
    });
    expect(curve.statusCode).toBe(200);
    expect(curve.json().items[0]).toMatchObject({
      agentCount: 3,
      batchGasPerIntent: "50257"
    });
  });
});
