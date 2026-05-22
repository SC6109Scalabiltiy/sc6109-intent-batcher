import { attachContract } from "../lib/contracts.js";
import {
  deploymentAddress,
  loadDeployment,
  saveIntents,
  type IntentRecord,
  type IntentsFile
} from "../lib/deployments.js";
import { argInt, argString, loadLocalEnv, parseArgs } from "../lib/env.js";
import { formatGas, units } from "../lib/format.js";
import { createRuntime, deterministicAgentWallet } from "../lib/runtime.js";
import {
  buildUserOp,
  buildPaymasterAndData,
  encodePaymasterDataUnsigned,
  getPaymasterHash,
  getUserOpHash,
  signUserOp,
} from "../lib/userop.js";
import type { EventLog, Log, Wallet } from "ethers";
import { ethers } from "ethers";

const USDC_DECIMALS = 6n;
const DEFAULT_STRATEGY = "DCA_USDC_TO_WETH";

// Gas limits used for all seeding UserOps (generous to avoid estimation on testnet)
const SEED_GAS = {
  callGasLimit: 500_000n,
  verificationGasLimit: 200_000n,
  preVerificationGas: 50_000n,
  maxFeePerGas: 0n,         // filled in from network
  maxPriorityFeePerGas: 0n, // filled in from network
};

async function submitUserOp(
  entryPoint: ReturnType<typeof attachContract>,
  userOp: Awaited<ReturnType<typeof signUserOp>>,
  deployer: Wallet
): Promise<bigint> {
  const uop = {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: userOp.callGasLimit,
    verificationGasLimit: userOp.verificationGasLimit,
    preVerificationGas: userOp.preVerificationGas,
    maxFeePerGas: userOp.maxFeePerGas,
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
  const tx = await entryPoint.handleOps([uop], await deployer.getAddress());
  const receipt = await tx.wait();
  return receipt!.gasUsed;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs();
  const runtime = await createRuntime(args);
  const deployment = loadDeployment(runtime.networkName);

  const agentCount = argInt(args, "agents", Number(process.env.AGENT_COUNT ?? "5"));
  const intervalSeconds = argInt(args, "interval", Number(process.env.INTENT_INTERVAL_SECONDS ?? "3600"));
  const deadlineWindow = argInt(args, "window", Number(process.env.INTENT_DEADLINE_WINDOW_SECONDS ?? "900"));
  const maxExecutions = argInt(args, "max-executions", Number(process.env.INTENT_MAX_EXECUTIONS ?? "0"));
  const amountIn = units(BigInt(argString(args, "amount-usdc", process.env.INTENT_AMOUNT_USDC ?? "10")!), USDC_DECIMALS);
  const strategyLabel = argString(args, "strategy", DEFAULT_STRATEGY)!;
  const strategyId = ethers.id(strategyLabel);

  const registry = attachContract("AgentRegistry", deploymentAddress(deployment, "AgentRegistry"), runtime.deployer);
  const usdc = attachContract("MockToken", deploymentAddress(deployment, "MockUSDC"), runtime.deployer);
  const settlement = attachContract("BatchDcaSettlement", deploymentAddress(deployment, "BatchDcaSettlement"), runtime.deployer);
  const entryPoint = attachContract("EntryPoint", deploymentAddress(deployment, "EntryPoint"), runtime.deployer);
  const factory = attachContract("AgentAccountFactory", deploymentAddress(deployment, "AgentAccountFactory"), runtime.deployer);

  const entryPointAddress = await entryPoint.getAddress();
  const settlementAddress = await settlement.getAddress();
  const paymasterAddress = deploymentAddress(deployment, "VerifyingPaymaster");

  const latestBlock = await runtime.provider.getBlock("latest");
  const now = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
  const nextExecution = BigInt(now);
  const approvalAmount = amountIn * BigInt(Math.max(1, maxExecutions || 1));

  console.log(`Seeding ${agentCount} smart-wallet DCA agents on ${runtime.networkName}`);
  console.log(`Coordinator/deployer: ${runtime.deployer.address}`);
  console.log(`EntryPoint:           ${entryPointAddress}`);
  console.log(`VerifyingPaymaster:   ${paymasterAddress}`);

  // Check paymaster deposit
  const paymasterDeposit = await entryPoint.balanceOf(paymasterAddress);
  console.log(`Paymaster deposit:    ${ethers.formatEther(paymasterDeposit)} ETH`);
  if (paymasterDeposit < ethers.parseEther("0.005")) {
    console.warn("WARNING: Paymaster deposit is low. Top up before coordinator runs.");
  }

  // Get base fee for gas limit fields
  const feeData = await runtime.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 2_000_000_000n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1_000_000_000n;
  const gasLimits = { ...SEED_GAS, maxFeePerGas, maxPriorityFeePerGas };

  let totalGas = 0n;
  const intents: IntentRecord[] = [];

  for (let i = 0; i < agentCount; i++) {
    const ownerWallet = deterministicAgentWallet(i, runtime.provider);
    const ownerAddress = ownerWallet.address;

    // Compute or deploy the smart wallet
    // Use getFunction to avoid conflict with ethers Contract.getAddress() built-in
    const smartWalletAddress: string = await factory.getFunction("getAddress")(ownerAddress, i);
    const code: string = await runtime.provider.getCode(smartWalletAddress);
    if (code === "0x") {
      const deployTx = await factory.createAccount(ownerAddress, i);
      const deployReceipt = await deployTx.wait();
      totalGas += deployReceipt!.gasUsed;
      console.log(`Deployed wallet[${i}] ${smartWalletAddress} (${formatGas(deployReceipt!.gasUsed)})`);
    } else {
      console.log(`Wallet[${i}] already deployed: ${smartWalletAddress}`);
    }

    // Step 1: deployer registers the agent for the smart wallet (no UserOp needed)
    const registerTx = await registry.registerAgentFor(smartWalletAddress, strategyId);
    const registerReceipt = await registerTx.wait();
    totalGas += registerReceipt!.gasUsed;
    const registerEvent = registerReceipt!.logs
      .map((log: EventLog | Log) => { try { return registry.interface.parseLog(log); } catch { return null; } })
      .find((log: ReturnType<typeof registry.interface.parseLog>) => log?.name === "AgentRegistered");
    if (!registerEvent) throw new Error(`AgentRegistered event missing for agent ${i}`);
    const agentId = registerEvent.args.agentId as bigint;

    // Step 2: fund the smart wallet with USDC
    const mintTx = await usdc.mint(smartWalletAddress, approvalAmount);
    const mintReceipt = await mintTx.wait();
    totalGas += mintReceipt!.gasUsed;

    // Step 3: build a single UserOp that approves USDC and creates the recurring intent
    const walletContract = attachContract("AgentSmartWallet", smartWalletAddress, runtime.provider);
    const approveCalldata = usdc.interface.encodeFunctionData("approve", [settlementAddress, approvalAmount]);
    const createIntentCalldata = settlement.interface.encodeFunctionData("createRecurringIntent", [
      agentId,
      amountIn,
      0n,
      BigInt(intervalSeconds),
      nextExecution,
      BigInt(deadlineWindow),
      maxExecutions,
    ]);

    const usdcAddress = await usdc.getAddress();
    const batchCalldata = walletContract.interface.encodeFunctionData("executeBatch", [[
      { target: usdcAddress, value: 0n, data: approveCalldata },
      { target: settlementAddress, value: 0n, data: createIntentCalldata },
    ]]);

    const nonce = await entryPoint.getNonce(smartWalletAddress, 0n);
    const validUntil = Math.floor(Date.now() / 1000) + 600; // 10 min window for seeding
    const validAfter = 0;

    // Build unsigned UserOp to get the paymaster hash
    const unsignedPaymasterData = encodePaymasterDataUnsigned(paymasterAddress, validUntil, validAfter);
    let userOp = buildUserOp(smartWalletAddress, nonce, "0x", batchCalldata, gasLimits, unsignedPaymasterData);

    // Sign paymaster data with coordinator key
    const pmHash = getPaymasterHash(userOp, runtime.chainId, paymasterAddress, validUntil, validAfter);
    const pmSig = await runtime.deployer.signMessage(Buffer.from(pmHash.slice(2), "hex"));
    userOp = { ...userOp, paymasterAndData: buildPaymasterAndData(paymasterAddress, validUntil, validAfter, pmSig) };

    // Sign UserOp with the agent's owner wallet
    userOp = await signUserOp(userOp, ownerWallet, entryPointAddress, runtime.chainId);

    const seedGas = await submitUserOp(entryPoint, userOp, runtime.deployer);
    totalGas += seedGas;

    // Extract the intentId from emitted events (parse from tx receipt via entryPoint)
    // The UserOp execution emits IntentCreated from the settlement contract.
    // We re-query the settlement for the latest intentId.
    const latestIntentId = (await settlement.nextIntentId()) - 1n;

    intents.push({
      index: i,
      agentId: agentId.toString(),
      intentId: latestIntentId.toString(),
      owner: smartWalletAddress,
      ownerEoa: ownerAddress,
      smartWalletAddress,
      strategyId,
      amountIn: amountIn.toString(),
      minAmountOut: "0",
      deadlineWindow,
      intervalSeconds,
      nextDueAt: Number(nextExecution),
    });

    console.log(`Agent[${i}] wallet=${smartWalletAddress} agentId=${agentId} intentId=${latestIntentId} seedGas=${formatGas(seedGas)}`);
  }

  const file: IntentsFile = {
    schema: "sc6109.shape-a.intents.v1",
    network: runtime.networkName,
    chainId: runtime.chainId.toString(),
    deployment: `${runtime.networkName}.json`,
    createdAt: new Date().toISOString(),
    coordinatorTrustModel:
      "Each agent owns a smart wallet. The coordinator builds UserOps and submits them via EntryPoint.handleOps. The VerifyingPaymaster sponsors gas.",
    ownerMode: "smart-wallet",
    intents,
    notes: [
      "Each agent has a deterministic smart wallet deployed by AgentAccountFactory.",
      "The coordinator (deployer) signs paymaster data for each UserOp.",
      "Use --agents, --amount-usdc, --interval, --window, and --max-executions to vary the workload.",
    ],
  };

  const saved = saveIntents(runtime.networkName, file);
  console.log(`\nSeed total gas: ${formatGas(totalGas)}`);
  console.log(`Saved intents:  ${saved}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
