import { AbiCoder, keccak256, Wallet, concat, toBeHex, zeroPadValue } from "ethers";

export type UserOperation = {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: string;
  signature: string;
};

export type GasLimits = {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

const abi = AbiCoder.defaultAbiCoder();

// Matches UserOperationLib.pack() + hash() in UserOperation.sol
// keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData), ...gas..., keccak256(paymasterAndData)))
function packUserOp(op: UserOperation): string {
  return abi.encode(
    ["address", "uint256", "bytes32", "bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
    [
      op.sender,
      op.nonce,
      keccak256(op.initCode),
      keccak256(op.callData),
      op.callGasLimit,
      op.verificationGasLimit,
      op.preVerificationGas,
      op.maxFeePerGas,
      op.maxPriorityFeePerGas,
      keccak256(op.paymasterAndData),
    ]
  );
}

// Matches EntryPoint.getUserOpHash() on-chain result (ERC-4337 v0.6)
export function getUserOpHash(userOp: UserOperation, entryPointAddress: string, chainId: bigint): string {
  const innerHash = keccak256(packUserOp(userOp));
  return keccak256(abi.encode(["bytes32", "address", "uint256"], [innerHash, entryPointAddress, chainId]));
}

// Sign a UserOp with the account owner's key.
// Uses wallet.signMessage() which applies the Ethereum prefix — matches ECDSA.toEthSignedMessageHash in Solidity.
export async function signUserOp(
  userOp: UserOperation,
  owner: Wallet,
  entryPointAddress: string,
  chainId: bigint
): Promise<UserOperation> {
  const hash = getUserOpHash(userOp, entryPointAddress, chainId);
  const sig = await owner.signMessage(Buffer.from(hash.slice(2), "hex"));
  return { ...userOp, signature: sig };
}

// Compute the hash that the coordinator must sign for the paymaster.
// Matches VerifyingPaymaster.getHash() in Solidity (our explicit-field version).
export function getPaymasterHash(
  userOp: UserOperation,
  chainId: bigint,
  paymasterAddress: string,
  validUntil: number,
  validAfter: number
): string {
  return keccak256(
    abi.encode(
      [
        "address", "uint256", "bytes32", "bytes32",
        "uint256", "uint256", "uint256", "uint256", "uint256",
        "uint256", "address", "uint48", "uint48",
      ],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
        chainId,
        paymasterAddress,
        validUntil,
        validAfter,
      ]
    )
  );
}

// Encode paymasterAndData before the signature (20 + 64 bytes).
// Layout: [paymasterAddress(20)][abi.encode(validUntil, validAfter)(64)][sig(65)]
// validUntil/validAfter use abi.encode (uint48 padded to 32 bytes each) to match Solidity parsePaymasterAndData.
export function encodePaymasterDataUnsigned(
  paymasterAddress: string,
  validUntil: number,
  validAfter: number
): string {
  const timestamps = abi.encode(["uint48", "uint48"], [validUntil, validAfter]);
  return concat([paymasterAddress, timestamps]);
}

// Build final paymasterAndData with coordinator signature appended.
export function buildPaymasterAndData(
  paymasterAddress: string,
  validUntil: number,
  validAfter: number,
  paymasterSig: string
): string {
  return concat([encodePaymasterDataUnsigned(paymasterAddress, validUntil, validAfter), paymasterSig]);
}

export function buildUserOp(
  sender: string,
  nonce: bigint,
  initCode: string,
  callData: string,
  gasLimits: GasLimits,
  paymasterAndData: string
): UserOperation {
  return {
    sender,
    nonce,
    initCode,
    callData,
    callGasLimit: gasLimits.callGasLimit,
    verificationGasLimit: gasLimits.verificationGasLimit,
    preVerificationGas: gasLimits.preVerificationGas,
    maxFeePerGas: gasLimits.maxFeePerGas,
    maxPriorityFeePerGas: gasLimits.maxPriorityFeePerGas,
    paymasterAndData,
    signature: "0x",
  };
}
