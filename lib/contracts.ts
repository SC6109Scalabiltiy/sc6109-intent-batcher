import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, ContractFactory } from "ethers";
import type { InterfaceAbi, Signer } from "ethers";
import { codeRoot } from "./paths.js";
import type { ScriptRuntime } from "./runtime.js";

export type ContractName =
  | "AgentRegistry"
  | "MockToken"
  | "BatchDcaSettlement"
  | "AgentSmartWallet"
  | "AgentAccountFactory"
  | "VerifyingPaymaster"
  | "EntryPoint";

export type Artifact = {
  abi: InterfaceAbi;
  bytecode: string;
};

export function loadArtifact(contractName: ContractName): Artifact {
  const artifactPath = resolve(
    codeRoot,
    "out",
    `${contractName}.sol`,
    `${contractName}.json`
  );
  return JSON.parse(readFileSync(artifactPath, "utf8")) as Artifact;
}

export async function deployContract(
  runtime: ScriptRuntime,
  contractName: ContractName,
  args: unknown[]
): Promise<{
  contract: Contract;
  address: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}> {
  const artifact = loadArtifact(contractName);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, runtime.deployer as Signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const tx = contract.deploymentTransaction();
  const receipt = tx ? await tx.wait() : null;

  return {
    contract: contract as unknown as Contract,
    address: await contract.getAddress(),
    txHash: tx?.hash,
    blockNumber: receipt?.blockNumber,
    gasUsed: receipt?.gasUsed
  };
}

export function attachContract(
  contractName: ContractName,
  address: string,
  signerOrProvider: Signer | ScriptRuntime["provider"]
): Contract {
  const artifact = loadArtifact(contractName);
  return new Contract(address, artifact.abi, signerOrProvider);
}

export function hasFunction(contract: Contract, fragmentName: string): boolean {
  return contract.interface.getFunction(fragmentName) !== null;
}
