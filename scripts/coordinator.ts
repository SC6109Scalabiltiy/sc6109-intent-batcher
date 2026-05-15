import { writeFileSync } from "node:fs";

import { attachContract } from "../lib/contracts.js";
import { deploymentAddress, ensureMetricsRoot, loadDeployment, loadIntents } from "../lib/deployments.js";
import { argInt, loadLocalEnv, parseArgs } from "../lib/env.js";
import { formatGas, stringifyBigints } from "../lib/format.js";
import { runOutputPath } from "../lib/paths.js";
import { createRuntime } from "../lib/runtime.js";

async function main() {
  loadLocalEnv();
  const args = parseArgs();
  const runtime = await createRuntime(args);
  const deployment = loadDeployment(runtime.networkName);
  const intentsFile = loadIntents(runtime.networkName);
  const maxBatch = argInt(args, "max-batch", Number(process.env.MAX_BATCH_SIZE ?? "50"));

  const settlement = attachContract(
    "BatchDcaSettlement",
    deploymentAddress(deployment, "BatchDcaSettlement"),
    runtime.deployer
  );

  const candidateIds = intentsFile.intents
    .map((intent) => BigInt(intent.intentId ?? "0"))
    .filter((intentId) => intentId > 0n);

  const dueIds: bigint[] = [];
  for (const intentId of candidateIds) {
    if (await settlement.isDue(intentId)) {
      dueIds.push(intentId);
    }
    if (dueIds.length >= maxBatch) {
      break;
    }
  }

  console.log(`Coordinator network=${runtime.networkName} candidates=${candidateIds.length} due=${dueIds.length}`);
  if (dueIds.length === 0) {
    return;
  }

  const start = Date.now();
  const tx = dueIds.length === 1 ? await settlement.executeIntent(dueIds[0]) : await settlement.executeBatch(dueIds);
  const receipt = await tx.wait();
  const elapsedMs = Date.now() - start;
  const gasUsed = receipt!.gasUsed;

  ensureMetricsRoot();
  const metrics = {
    schema: "sc6109.shape-a.coordinator-run.v1",
    network: runtime.networkName,
    chainId: runtime.chainId.toString(),
    settlement: await settlement.getAddress(),
    txHash: tx.hash,
    blockNumber: receipt!.blockNumber,
    intentCount: dueIds.length,
    intentIds: dueIds.map((id) => id.toString()),
    gasUsed: gasUsed.toString(),
    gasPerIntent: (gasUsed / BigInt(dueIds.length)).toString(),
    elapsedMs,
    executedAt: new Date().toISOString()
  };
  const output = runOutputPath(runtime.networkName, "coordinator", "json");
  writeFileSync(output, `${stringifyBigints(metrics)}\n`);

  console.log(`Executed tx=${tx.hash}`);
  console.log(`Gas used=${formatGas(gasUsed)} gas/intent=${formatGas(gasUsed / BigInt(dueIds.length))}`);
  console.log(`Saved metrics=${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

