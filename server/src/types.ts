export type DueStatus = boolean | "unknown";

export type IntentDto = {
  intentId: string;
  agentId: string;
  owner: string;
  amountIn: string;
  minAmountOut: string;
  nextExecution: number | null;
  active: boolean;
  due: DueStatus;
  executions: number;
  maxExecutions: number;
};

export type BatchDto = {
  txHash: string;
  blockNumber: number;
  intentCount: number;
  gasUsed: string;
  gasPerIntent: string;
  elapsedMs: number | null;
  intentIds: string[];
  executedAt: string;
};

export type CurvePointDto = {
  agentCount: number;
  naiveGasPerIntent: string;
  batchGasPerIntent: string;
  gasReductionPercent: number;
};

export type SummaryDto = {
  totalIntents: number;
  dueIntents: number;
  latestGasPerIntent: string | null;
  latestGasReductionPercent: number | null;
  avgCoordinatorLatencyMs: number | null;
  failureRate: number | null;
  successfulBatches: number;
  failedBatches: number;
  latestTxHash: string | null;
};

export type BenchmarkDto = CurvePointDto & {
  network: string;
  naiveGas: string;
  batchGas: string;
  batchTx: string;
  measuredAt: string;
};
