import { JsonRpcProvider, Wallet, ethers as ethersLib } from "ethers";
import type { ScriptArgs } from "./env.js";
import { argString } from "./env.js";

const LOCALHOST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export type SupportedNetwork = "localhost" | "sepolia";

export type ScriptRuntime = {
  networkName: SupportedNetwork;
  chainId: bigint;
  ethers: typeof ethersLib;
  provider: JsonRpcProvider;
  deployer: Wallet;
  usingLocalProvider: boolean;
};

export async function createRuntime(args: ScriptArgs): Promise<ScriptRuntime> {
  const requested = argString(args, "network", process.env.NETWORK);
  const networkName = normalizeNetwork(requested ?? "localhost");
  const provider = new JsonRpcProvider(resolveRpcUrl(networkName, args));
  const deployer = new Wallet(resolvePrivateKey(networkName), provider);
  const network = await provider.getNetwork();

  return {
    networkName,
    chainId: network.chainId,
    ethers: ethersLib,
    provider,
    deployer,
    usingLocalProvider: networkName === "localhost"
  };
}

export function deterministicAgentWallet(index: number, provider: JsonRpcProvider): Wallet {
  const key = ethersLib.id(`sc6109-shape-a-agent-${index}`);
  return new Wallet(key, provider);
}

export async function waitForTx(
  tx: { wait: () => Promise<null | { gasUsed: bigint; blockNumber: number; hash?: string }> },
  label: string
): Promise<{ gasUsed: bigint; blockNumber: number }> {
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error(`${label} transaction was not mined`);
  }
  return { gasUsed: receipt.gasUsed, blockNumber: receipt.blockNumber };
}

function normalizeNetwork(value: string): SupportedNetwork {
  if (value === "localhost" || value === "anvil") {
    return "localhost";
  }
  if (value === "sepolia") {
    return value;
  }
  throw new Error(`Unsupported network "${value}". Use localhost or sepolia.`);
}

function resolveRpcUrl(networkName: SupportedNetwork, args: ScriptArgs): string {
  const explicit = argString(args, "rpc-url");
  if (explicit) {
    return explicit;
  }

  if (networkName === "localhost") {
    return process.env.LOCALHOST_RPC_URL ?? process.env.RPC_URL ?? "http://127.0.0.1:8545";
  }

  const url = process.env.SEPOLIA_RPC_URL ?? process.env.RPC_URL;
  if (!url) {
    throw new Error("Missing SEPOLIA_RPC_URL or RPC_URL for --network sepolia");
  }
  return url;
}

function resolvePrivateKey(networkName: SupportedNetwork): string {
  const key =
    networkName === "localhost"
      ? process.env.LOCALHOST_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? LOCALHOST_PRIVATE_KEY
      : process.env.DEPLOYER_PRIVATE_KEY ?? process.env.SEPOLIA_PRIVATE_KEY ?? process.env.PRIVATE_KEY;

  if (!key) {
    throw new Error(`Missing ${networkName.toUpperCase()} private key`);
  }

  return key.startsWith("0x") ? key : `0x${key}`;
}
