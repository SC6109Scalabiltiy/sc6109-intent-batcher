import { writeFileSync } from "node:fs";

import { attachContract } from "../lib/contracts.js";
import { deploymentAddress, ensureMetricsRoot, loadDeployment } from "../lib/deployments.js";
import { argInt, argString, loadLocalEnv, parseArgs } from "../lib/env.js";
import { formatGas, stringifyBigints, units } from "../lib/format.js";
import { runOutputPath } from "../lib/paths.js";
import { createRuntime } from "../lib/runtime.js";
import type { EventLog, Log } from "ethers";

const USDC_DECIMALS = 6n;

async function main() {
  loadLocalEnv();
  const args = parseArgs();
  const runtime = await createRuntime(args);
  const deployment = loadDeployment(runtime.networkName);
  const agentCount = argInt(args, "agents", Number(process.env.BENCHMARK_AGENT_COUNT ?? "6"));
  const amountIn = units(BigInt(argString(args, "amount-usdc", process.env.INTENT_AMOUNT_USDC ?? "10")!), USDC_DECIMALS);
  const strategyId = runtime.ethers.id("DCA_USDC_TO_WETH_BENCHMARK");

  const registry = attachContract("AgentRegistry", deploymentAddress(deployment, "AgentRegistry"), runtime.deployer);
  const usdc = attachContract("MockToken", deploymentAddress(deployment, "MockUSDC"), runtime.deployer);
  const settlement = attachContract(
    "BatchDcaSettlement",
    deploymentAddress(deployment, "BatchDcaSettlement"),
    runtime.deployer
  );

  console.log(`Benchmarking ${agentCount} agents on ${runtime.networkName}`);

  const singleIds = await createFundedIntents(registry, usdc, settlement, runtime, agentCount, amountIn, strategyId);
  let naiveGas = 0n;
  const naiveTxs: string[] = [];
  for (const intentId of singleIds) {
    const tx = await settlement.executeIntent(intentId);
    const receipt = await tx.wait();
    naiveGas += receipt!.gasUsed;
    naiveTxs.push(tx.hash);
  }

  const batchIds = await createFundedIntents(registry, usdc, settlement, runtime, agentCount, amountIn, strategyId);
  const batchTx = await settlement.executeBatch(batchIds);
  const batchReceipt = await batchTx.wait();
  const batchGas = batchReceipt!.gasUsed;
  const savingsBps = ((naiveGas - batchGas) * 10_000n) / naiveGas;

  ensureMetricsRoot();
  const metrics = {
    schema: "sc6109.shape-a.benchmark.v1",
    network: runtime.networkName,
    chainId: runtime.chainId.toString(),
    settlement: await settlement.getAddress(),
    agentCount,
    amountIn: amountIn.toString(),
    naiveGas: naiveGas.toString(),
    naiveGasPerIntent: (naiveGas / BigInt(agentCount)).toString(),
    batchGas: batchGas.toString(),
    batchGasPerIntent: (batchGas / BigInt(agentCount)).toString(),
    gasReductionPercent: Number(savingsBps) / 100,
    naiveTxs,
    batchTx: batchTx.hash,
    measuredAt: new Date().toISOString()
  };
  const jsonPath = runOutputPath(runtime.networkName, "benchmark", "json");
  const csvPath = runOutputPath(runtime.networkName, "benchmark", "csv");
  writeFileSync(jsonPath, `${stringifyBigints(metrics)}\n`);
  writeFileSync(
    csvPath,
    [
      "network,agentCount,naiveGas,naiveGasPerIntent,batchGas,batchGasPerIntent,gasReductionPercent,batchTx",
      `${runtime.networkName},${agentCount},${naiveGas},${naiveGas / BigInt(agentCount)},${batchGas},${
        batchGas / BigInt(agentCount)
      },${Number(savingsBps) / 100},${batchTx.hash}`
    ].join("\n") + "\n"
  );

  console.log(`Naive total gas: ${formatGas(naiveGas)}`);
  console.log(`Naive gas / intent: ${formatGas(naiveGas / BigInt(agentCount))}`);
  console.log(`Batch total gas: ${formatGas(batchGas)}`);
  console.log(`Batch gas / intent: ${formatGas(batchGas / BigInt(agentCount))}`);
  console.log(`Gas reduction: ${Number(savingsBps) / 100}%`);
  console.log(`Saved metrics: ${jsonPath}`);
}

async function createFundedIntents(
  registry: ReturnType<typeof attachContract>,
  usdc: ReturnType<typeof attachContract>,
  settlement: ReturnType<typeof attachContract>,
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  count: number,
  amountIn: bigint,
  strategyId: string
): Promise<bigint[]> {
  const latestBlock = await runtime.provider.getBlock("latest");
  const now = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
  const totalInput = amountIn * BigInt(count);

  await (await usdc.mint(runtime.deployer.address, totalInput)).wait();
  await (await usdc.approve(await settlement.getAddress(), totalInput)).wait();

  const ids: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const registerTx = await registry.registerAgent(strategyId);
    const registerReceipt = await registerTx.wait();
    const registerEvent = registerReceipt!.logs
      .map((log: EventLog | Log) => registry.interface.parseLog(log))
      .find((log: ReturnType<typeof registry.interface.parseLog>) => log?.name === "AgentRegistered");
    if (!registerEvent) {
      throw new Error("AgentRegistered event missing");
    }
    const agentId = registerEvent.args.agentId as bigint;
    const createTx = await settlement.createRecurringIntent(agentId, amountIn, 0n, 3600n, now, 900n, 1);
    const createReceipt = await createTx.wait();
    const intentEvent = createReceipt!.logs
      .map((log: EventLog | Log) => {
        try {
          return settlement.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log: ReturnType<typeof settlement.interface.parseLog> | null) => log?.name === "IntentCreated");
    if (!intentEvent) {
      throw new Error("IntentCreated event missing");
    }
    ids.push(intentEvent.args.intentId as bigint);
  }
  return ids;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
