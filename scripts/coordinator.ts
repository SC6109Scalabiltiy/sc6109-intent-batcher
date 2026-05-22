import { writeFileSync } from "node:fs";

import { attachContract } from "../lib/contracts.js";
import { deploymentAddress, ensureMetricsRoot, loadDeployment, loadIntents } from "../lib/deployments.js";
import { argInt, loadLocalEnv, parseArgs } from "../lib/env.js";
import { formatGas, stringifyBigints } from "../lib/format.js";
import { runOutputPath } from "../lib/paths.js";
import { createRuntime, deterministicAgentWallet } from "../lib/runtime.js";
import {
  buildUserOp,
  buildPaymasterAndData,
  encodePaymasterDataUnsigned,
  getPaymasterHash,
  getUserOpHash,
  signUserOp,
  type UserOperation,
} from "../lib/userop.js";
import { ethers } from "ethers";

// Gas limits for coordinator UserOps (executeIntent calls)
const COORDINATOR_GAS = {
  callGasLimit: 200_000n,
  verificationGasLimit: 150_000n,
  preVerificationGas: 50_000n,
  maxFeePerGas: 0n,         // filled from network
  maxPriorityFeePerGas: 0n, // filled from network
};

async function main() {
  loadLocalEnv();
  const args = parseArgs();
  const runtime = await createRuntime(args);
  const deployment = loadDeployment(runtime.networkName);
  const intentsFile = loadIntents(runtime.networkName);
  const maxBatch = argInt(args, "max-batch", Number(process.env.MAX_BATCH_SIZE ?? "50"));

  const settlement = attachContract("BatchDcaSettlement", deploymentAddress(deployment, "BatchDcaSettlement"), runtime.deployer);
  const entryPoint = attachContract("EntryPoint", deploymentAddress(deployment, "EntryPoint"), runtime.deployer);

  const entryPointAddress = await entryPoint.getAddress();
  const settlementAddress = await settlement.getAddress();
  const paymasterAddress = deploymentAddress(deployment, "VerifyingPaymaster");

  // Warn if paymaster deposit is getting low
  const paymasterDeposit: bigint = await entryPoint.balanceOf(paymasterAddress);
  if (paymasterDeposit < ethers.parseEther("0.01")) {
    console.warn(`WARNING: Paymaster deposit is low (${ethers.formatEther(paymasterDeposit)} ETH). Top up soon.`);
  }

  // Collect due intents that have a smart wallet address recorded
  const candidateIntents = intentsFile.intents.filter(
    (intent) => intent.intentId && BigInt(intent.intentId) > 0n && intent.smartWalletAddress
  );

  const dueIntents = [];
  for (const intent of candidateIntents) {
    const intentId = BigInt(intent.intentId!);
    if (await settlement.isDue(intentId)) {
      dueIntents.push(intent);
    }
    if (dueIntents.length >= maxBatch) break;
  }

  console.log(`Coordinator network=${runtime.networkName} candidates=${candidateIntents.length} due=${dueIntents.length}`);
  if (dueIntents.length === 0) return;

  // Gas pricing
  const feeData = await runtime.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 2_000_000_000n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1_000_000_000n;
  const gasLimits = { ...COORDINATOR_GAS, maxFeePerGas, maxPriorityFeePerGas };

  const validUntil = Math.floor(Date.now() / 1000) + 300; // 5 min
  const validAfter = 0;

  // Build a UserOp per due intent
  const userOps: UserOperation[] = [];
  const userOpHashes: string[] = [];

  for (const intent of dueIntents) {
    const intentId = BigInt(intent.intentId!);
    const smartWalletAddress = intent.smartWalletAddress!;
    const ownerWallet = deterministicAgentWallet(intent.index, runtime.provider);

    const walletContract = attachContract("AgentSmartWallet", smartWalletAddress, runtime.provider);

    // calldata: settlement.executeIntent(intentId) called via wallet.execute(...)
    const executeIntentCalldata = settlement.interface.encodeFunctionData("executeIntent", [intentId]);
    const walletCalldata = walletContract.interface.encodeFunctionData("execute", [
      settlementAddress,
      0n,
      executeIntentCalldata,
    ]);

    const nonce: bigint = await entryPoint.getNonce(smartWalletAddress, 0n);

    // Build with unsigned paymaster data first (needed to compute paymaster hash)
    const unsignedPaymasterData = encodePaymasterDataUnsigned(paymasterAddress, validUntil, validAfter);
    let userOp = buildUserOp(smartWalletAddress, nonce, "0x", walletCalldata, gasLimits, unsignedPaymasterData);

    // Sign paymaster data with coordinator key
    const pmHash = getPaymasterHash(userOp, runtime.chainId, paymasterAddress, validUntil, validAfter);
    const pmSig = await runtime.deployer.signMessage(Buffer.from(pmHash.slice(2), "hex"));
    userOp = { ...userOp, paymasterAndData: buildPaymasterAndData(paymasterAddress, validUntil, validAfter, pmSig) };

    // Sign UserOp with agent's owner EOA
    userOp = await signUserOp(userOp, ownerWallet, entryPointAddress, runtime.chainId);

    const opHash = getUserOpHash(userOp, entryPointAddress, runtime.chainId);
    userOpHashes.push(opHash);
    userOps.push(userOp);
  }

  // Submit all UserOps in a single handleOps call (coordinator acts as bundler)
  const start = Date.now();
  const handleOpsTx = await entryPoint.handleOps(userOps, runtime.deployer.address);
  const receipt = await handleOpsTx.wait();
  const elapsedMs = Date.now() - start;
  const gasUsed: bigint = receipt!.gasUsed;

  ensureMetricsRoot();
  const metrics = {
    schema: "sc6109.shape-a.coordinator-run.v2",
    network: runtime.networkName,
    chainId: runtime.chainId.toString(),
    entryPoint: entryPointAddress,
    settlement: settlementAddress,
    paymaster: paymasterAddress,
    txHash: handleOpsTx.hash,
    blockNumber: receipt!.blockNumber,
    intentCount: dueIntents.length,
    intentIds: dueIntents.map((i) => i.intentId),
    userOpHashes,
    gasUsed: gasUsed.toString(),
    gasPerIntent: (gasUsed / BigInt(dueIntents.length)).toString(),
    elapsedMs,
    executedAt: new Date().toISOString(),
  };

  const output = runOutputPath(runtime.networkName, "coordinator", "json");
  writeFileSync(output, `${stringifyBigints(metrics)}\n`);

  console.log(`Executed via handleOps tx=${handleOpsTx.hash}`);
  console.log(`Gas used=${formatGas(gasUsed)} gas/intent=${formatGas(gasUsed / BigInt(dueIntents.length))}`);
  console.log(`UserOp hashes: ${userOpHashes.join(", ")}`);
  console.log(`Saved metrics=${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
