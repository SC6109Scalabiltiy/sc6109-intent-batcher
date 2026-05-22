import { Contract } from "ethers";
import { loadDeployment } from "../../../lib/deployments.js";
import type { NetworkName } from "./network.js";
import { optionalProvider } from "./network.js";

const ENTRY_POINT_ABI = ["function balanceOf(address account) view returns (uint256)"];

export type PaymasterBalanceDto = {
  paymasterAddress: string;
  entryPoint: string;
  depositWei: string;
  depositEth: string;
  source: "chain" | "unavailable";
};

export async function getPaymasterBalance(networkName: NetworkName): Promise<PaymasterBalanceDto> {
  const deployment = loadDeployment(networkName);
  const paymasterAddress = deployment.VerifyingPaymaster ?? null;
  const entryPointAddress = deployment.EntryPoint ?? null;

  if (!paymasterAddress || !entryPointAddress) {
    return {
      paymasterAddress: paymasterAddress ?? "unknown",
      entryPoint: entryPointAddress ?? "unknown",
      depositWei: "0",
      depositEth: "0",
      source: "unavailable",
    };
  }

  const provider = optionalProvider(networkName);
  if (!provider) {
    return {
      paymasterAddress,
      entryPoint: entryPointAddress,
      depositWei: "0",
      depositEth: "0",
      source: "unavailable",
    };
  }

  try {
    const entryPoint = new Contract(entryPointAddress, ENTRY_POINT_ABI, provider);
    const depositWei = (await entryPoint.balanceOf(paymasterAddress)) as bigint;
    const eth = Number(depositWei) / 1e18;
    return {
      paymasterAddress,
      entryPoint: entryPointAddress,
      depositWei: depositWei.toString(),
      depositEth: eth.toFixed(4),
      source: "chain",
    };
  } catch {
    return {
      paymasterAddress,
      entryPoint: entryPointAddress,
      depositWei: "0",
      depositEth: "0",
      source: "unavailable",
    };
  }
}
