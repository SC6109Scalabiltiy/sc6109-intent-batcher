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
import { createRuntime } from "../lib/runtime.js";
import type { EventLog, Log } from "ethers";

const USDC_DECIMALS = 6n;
const DEFAULT_STRATEGY = "DCA_USDC_TO_WETH";

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
  const strategyId = runtime.ethers.id(strategyLabel);

  const registry = attachContract("AgentRegistry", deploymentAddress(deployment, "AgentRegistry"), runtime.deployer);
  const usdc = attachContract("MockToken", deploymentAddress(deployment, "MockUSDC"), runtime.deployer);
  const settlement = attachContract(
    "BatchDcaSettlement",
    deploymentAddress(deployment, "BatchDcaSettlement"),
    runtime.deployer
  );

  const latestBlock = await runtime.provider.getBlock("latest");
  const now = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
  const nextExecution = BigInt(now);
  const totalInput = amountIn * BigInt(agentCount) * BigInt(Math.max(1, maxExecutions || 1));

  console.log(`Seeding ${agentCount} recurring DCA intents on ${runtime.networkName}`);
  console.log(`Owner: ${runtime.deployer.address}`);
  console.log(`Settlement: ${await settlement.getAddress()}`);

  let totalGas = 0n;

  const mintTx = await usdc.mint(runtime.deployer.address, totalInput);
  const mintReceipt = await mintTx.wait();
  totalGas += mintReceipt!.gasUsed;

  const approveTx = await usdc.approve(await settlement.getAddress(), totalInput);
  const approveReceipt = await approveTx.wait();
  totalGas += approveReceipt!.gasUsed;

  const intents: IntentRecord[] = [];
  for (let i = 0; i < agentCount; i++) {
    const registerTx = await registry.registerAgent(strategyId);
    const registerReceipt = await registerTx.wait();
    totalGas += registerReceipt!.gasUsed;
    const registerEvent = registerReceipt!.logs
      .map((log: EventLog | Log) => registry.interface.parseLog(log))
      .find((log: ReturnType<typeof registry.interface.parseLog>) => log?.name === "AgentRegistered");
    if (!registerEvent) {
      throw new Error(`AgentRegistered event missing for agent ${i}`);
    }
    const agentId = registerEvent.args.agentId as bigint;

    const createTx = await settlement.createRecurringIntent(
      agentId,
      amountIn,
      0n,
      BigInt(intervalSeconds),
      nextExecution,
      BigInt(deadlineWindow),
      maxExecutions
    );
    const createReceipt = await createTx.wait();
    totalGas += createReceipt!.gasUsed;
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
      throw new Error(`IntentCreated event missing for agent ${i}`);
    }

    const intentId = intentEvent.args.intentId as bigint;
    intents.push({
      index: i,
      agentId: agentId.toString(),
      intentId: intentId.toString(),
      owner: runtime.deployer.address,
      strategyId,
      amountIn: amountIn.toString(),
      minAmountOut: "0",
      deadlineWindow,
      intervalSeconds,
      nextDueAt: Number(nextExecution)
    });

    console.log(`Intent ${i}: agentId=${agentId} intentId=${intentId} tx=${createTx.hash}`);
  }

  const file: IntentsFile = {
    schema: "sc6109.shape-a.intents.v1",
    network: runtime.networkName,
    chainId: runtime.chainId.toString(),
    deployment: `${runtime.networkName}.json`,
    createdAt: new Date().toISOString(),
    coordinatorTrustModel:
      "The settlement contract restricts execution to the coordinator; the deployer is coordinator by default.",
    ownerMode: "single-deployer",
    intents,
    notes: [
      "All seeded agents are owned by the deployer for Sepolia simplicity.",
      "Use --agents, --amount-usdc, --interval, --window, and --max-executions to vary the workload."
    ]
  };

  const saved = saveIntents(runtime.networkName, file);
  console.log(`Seed gas total: ${formatGas(totalGas)}`);
  console.log(`Saved intents: ${saved}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
