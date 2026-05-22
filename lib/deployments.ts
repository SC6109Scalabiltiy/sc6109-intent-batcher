import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deploymentPath, deploymentsRoot, intentsPath, metricsRoot } from "./paths.js";
import { stringifyBigints } from "./format.js";

export type ContractDeployment = {
  address: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  args?: unknown[];
};

export type DeploymentFile = {
  schema: string;
  network?: string;
  chainId: string | number;
  deployer: string;
  deployedAt?: string;
  AgentRegistry?: string;
  MockUSDC?: string;
  MockWETH?: string;
  BatchDcaSettlement?: string;
  EntryPoint?: string;
  AgentAccountFactory?: string;
  VerifyingPaymaster?: string;
  contracts?: {
    AgentRegistry: ContractDeployment;
    MockUSDC: ContractDeployment;
    MockWETH: ContractDeployment;
    BatchDcaSettlement: ContractDeployment;
  };
  config: {
    priceNumerator: string;
    priceDenominator: string;
    outputLiquidity: string;
  };
  notes: string[];
};

export type IntentRecord = {
  index: number;
  agentId: string;
  intentId?: string;
  owner: string;
  ownerEoa?: string;
  smartWalletAddress?: string;
  strategyId: string;
  amountIn: string;
  minAmountOut: string;
  deadline?: string;
  deadlineWindow?: number;
  intervalSeconds: number;
  nextDueAt: number;
};

export type IntentsFile = {
  schema: "sc6109.shape-a.intents.v1";
  network: string;
  chainId: string;
  deployment: string;
  createdAt: string;
  coordinatorTrustModel: string;
  ownerMode: string;
  intents: IntentRecord[];
  notes: string[];
};

export function saveDeployment(networkName: string, deployment: DeploymentFile): string {
  ensureDeploymentsRoot();
  const path = deploymentPath(networkName);
  writeFileSync(path, `${stringifyBigints(deployment)}\n`);
  return path;
}

export function loadDeployment(networkName: string): DeploymentFile {
  const path = deploymentPath(networkName);
  if (!existsSync(path)) {
    throw new Error(`Deployment file not found for ${networkName}: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentFile;
}

export function deploymentAddress(
  deployment: DeploymentFile,
  name: "AgentRegistry" | "MockUSDC" | "MockWETH" | "BatchDcaSettlement" | "EntryPoint" | "AgentAccountFactory" | "VerifyingPaymaster"
): string {
  const topLevel = deployment[name];
  if (typeof topLevel === "string" && topLevel.length > 0) {
    return topLevel;
  }

  const contracts = deployment.contracts as Record<string, ContractDeployment> | undefined;
  const fromContracts = contracts?.[name]?.address;
  if (typeof fromContracts === "string" && fromContracts.length > 0) {
    return fromContracts;
  }

  throw new Error(`Deployment is missing ${name} address`);
}

export function saveIntents(networkName: string, intents: IntentsFile): string {
  ensureDeploymentsRoot();
  const path = intentsPath(networkName);
  writeFileSync(path, `${stringifyBigints(intents)}\n`);
  return path;
}

export function loadIntents(networkName: string): IntentsFile {
  const path = intentsPath(networkName);
  if (!existsSync(path)) {
    throw new Error(`Intent file not found for ${networkName}: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as IntentsFile;
}

export function ensureDeploymentsRoot(): void {
  mkdirSync(deploymentsRoot, { recursive: true });
}

export function ensureMetricsRoot(): void {
  mkdirSync(metricsRoot, { recursive: true });
}
