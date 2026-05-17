import { JsonRpcProvider } from "ethers";
import { loadLocalEnv } from "../../../lib/env.js";

export type NetworkName = "localhost" | "sepolia";

export function normalizeNetwork(value: unknown): NetworkName {
  if (value === "localhost" || value === "anvil") {
    return "localhost";
  }
  if (value === "sepolia" || value === undefined || value === null || value === "") {
    return "sepolia";
  }
  throw new Error(`Unsupported network "${String(value)}". Use localhost or sepolia.`);
}
export function optionalProvider(networkName: NetworkName): JsonRpcProvider | null {
  loadLocalEnv();

  const url =
    networkName === "localhost"
      ? process.env.LOCALHOST_RPC_URL ?? process.env.RPC_URL ?? "http://127.0.0.1:8545"
      : process.env.SEPOLIA_RPC_URL ?? process.env.RPC_URL;

  if (!url) {
    return null;
  }

  return new JsonRpcProvider(url);
}
