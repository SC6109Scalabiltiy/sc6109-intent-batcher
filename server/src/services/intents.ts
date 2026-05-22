import { Contract } from "ethers";
import { loadDeployment, loadIntents } from "../../../lib/deployments.js";
import type { IntentRecord } from "../../../lib/deployments.js";
import type { IntentDto } from "../types.js";
import { optionalProvider, type NetworkName } from "./network.js";

const SETTLEMENT_ABI = [
  "function isDue(uint256 intentId) view returns (bool)",
  "function intents(uint256 intentId) view returns (uint256 agentId,uint256 amountIn,uint256 minAmountOut,uint64 intervalSeconds,uint64 nextExecution,uint64 deadlineWindow,uint32 maxExecutions,uint32 executions,bool active)"
];

type OnChainIntent = {
  nextExecution: number | null;
  active: boolean;
  executions: number;
  maxExecutions: number;
};

export async function listIntents(networkName: NetworkName): Promise<{
  dueSource: "chain" | "unavailable";
  items: IntentDto[];
}> {
  const deployment = loadDeployment(networkName);
  const intentsFile = loadIntents(networkName);
  const settlementAddress = resolveSettlementAddress(deployment);
  const provider = optionalProvider(networkName);
  const settlement = provider ? new Contract(settlementAddress, SETTLEMENT_ABI, provider) : null;

  let dueSource: "chain" | "unavailable" = settlement ? "chain" : "unavailable";
  const items: IntentDto[] = [];

  for (const intent of intentsFile.intents) {
    const intentId = intent.intentId ?? "0";
    let due: IntentDto["due"] = "unknown";
    let chainState: OnChainIntent | null = null;

    if (settlement && BigInt(intentId) > 0n) {
      try {
        [due, chainState] = await Promise.all([
          settlement.isDue(intentId) as Promise<boolean>,
          readIntentState(settlement, intentId)
        ]);
      } catch {
        due = "unknown";
        dueSource = "unavailable";
      }
    }

    items.push(toIntentDto(intent, due, chainState));
  }

  return { dueSource, items };
}
function toIntentDto(record: IntentRecord, due: IntentDto["due"], chainState: OnChainIntent | null): IntentDto {
  return {
    intentId: record.intentId ?? "0",
    agentId: record.agentId,
    owner: record.owner,
    smartWalletAddress: record.smartWalletAddress ?? null,
    amountIn: record.amountIn,
    minAmountOut: record.minAmountOut,
    nextExecution: chainState?.nextExecution ?? record.nextDueAt ?? null,
    active: chainState?.active ?? true,
    due,
    executions: chainState?.executions ?? 0,
    maxExecutions: chainState?.maxExecutions ?? 0
  };
}

async function readIntentState(settlement: Contract, intentId: string): Promise<OnChainIntent> {
  const value = await settlement.intents(intentId) as {
    nextExecution: bigint;
    active: boolean;
    executions: bigint;
    maxExecutions: bigint;
  };

  return {
    nextExecution: Number(value.nextExecution),
    active: value.active,
    executions: Number(value.executions),
    maxExecutions: Number(value.maxExecutions)
  };
}

function resolveSettlementAddress(deployment: { BatchDcaSettlement?: string; contracts?: { BatchDcaSettlement?: { address?: string } } }): string {
  const address = deployment.BatchDcaSettlement ?? deployment.contracts?.BatchDcaSettlement?.address;
  if (!address) {
    throw new Error("Deployment is missing BatchDcaSettlement address");
  }
  return address;
}
