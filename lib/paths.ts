import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const deploymentsRoot = resolve(codeRoot, "deployments");
export const metricsRoot = resolve(codeRoot, "metrics");

export function deploymentPath(networkName: string): string {
  return resolve(deploymentsRoot, `${networkName}.json`);
}

export function intentsPath(networkName: string): string {
  return resolve(deploymentsRoot, `${networkName}-intents.json`);
}

export function runOutputPath(networkName: string, label: string, extension: "json" | "csv"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(metricsRoot, `${networkName}-${label}-${stamp}.${extension}`);
}
