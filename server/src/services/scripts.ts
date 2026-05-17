import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ensureMetricsRoot } from "../../../lib/deployments.js";
import { codeRoot, runOutputPath } from "../../../lib/paths.js";
import { stringifyBigints } from "../../../lib/format.js";
import type { NetworkName } from "./network.js";

export type ScriptResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function runCoordinator(networkName: NetworkName): Promise<ScriptResult> {
  return runTsxScript("scripts/coordinator.ts", ["--network", networkName]).then((result) => {
    if (result.exitCode !== 0) {
      writeFailureMetric(networkName, "coordinator", result);
    }
    return result;
  });
}

export function runBenchmark(networkName: NetworkName, options: { agents?: number; amountUsdc?: string }): Promise<ScriptResult> {
  const args = ["--network", networkName];
  if (options.agents !== undefined) {
    args.push("--agents", String(options.agents));
  }
  if (options.amountUsdc !== undefined) {
    args.push("--amount-usdc", options.amountUsdc);
  }
  return runTsxScript("scripts/benchmark.ts", args);
}

export async function runBenchmarkSweep(
  networkName: NetworkName,
  options: { counts: number[]; amountUsdc?: string }
): Promise<ScriptResult[]> {
  const results: ScriptResult[] = [];
  for (const agents of options.counts) {
    results.push(await runBenchmark(networkName, { agents, amountUsdc: options.amountUsdc }));
  }
  return results;
}

function runTsxScript(scriptPath: string, args: string[]): Promise<ScriptResult> {
  const tsxBin = resolve(codeRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const command = `${tsxBin} ${scriptPath} ${args.join(" ")}`;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(tsxBin, [scriptPath, ...args], {
      cwd: codeRoot,
      env: process.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolvePromise({
        command,
        exitCode: exitCode ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function writeFailureMetric(networkName: NetworkName, label: "coordinator", result: ScriptResult): void {
  ensureMetricsRoot();
  const output = runOutputPath(networkName, label, "json");
  const metric = {
    schema: "sc6109.shape-a.coordinator-failure.v1",
    network: networkName,
    status: "failed",
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    executedAt: new Date().toISOString()
  };
  writeFileSync(output, `${stringifyBigints(metric)}\n`);
}
