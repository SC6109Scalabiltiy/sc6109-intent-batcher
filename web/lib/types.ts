export type DueStatus = boolean | "unknown";

export type IntentDto = {
  intentId: string;
  agentId: string;
  owner: string;
  smartWalletAddress: string | null;
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
  userOpHashes: string[] | null;
  paymasterAddress: string | null;
  entryPoint: string | null;
};

export type PaymasterBalanceResponse = {
  network: string;
  paymasterAddress: string;
  entryPoint: string;
  depositWei: string;
  depositEth: string;
  source: "chain" | "unavailable";
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

export type LatestResponse = {
  network: string;
  summary: SummaryDto;
  latestBatch: BatchDto | null;
  latestBenchmark: BenchmarkDto | null;
};

export type IntentsResponse = {
  network: string;
  dueSource: "chain" | "unavailable";
  items: IntentDto[];
};

export type BatchesResponse = {
  network: string;
  items: BatchDto[];
};

export type CurveResponse = {
  network: string;
  items: CurvePointDto[];
};

export type ScriptResponse = {
  network: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SweepResponse = {
  network: string;
  counts: number[];
  results: ScriptResponse[];
};
