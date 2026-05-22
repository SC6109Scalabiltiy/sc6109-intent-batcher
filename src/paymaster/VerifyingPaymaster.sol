// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import {BasePaymaster} from "account-abstraction/core/BasePaymaster.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {UserOperation} from "account-abstraction/interfaces/UserOperation.sol";
import {_packValidationData} from "account-abstraction/core/Helpers.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract VerifyingPaymaster is BasePaymaster {
    using ECDSA for bytes32;

    address public immutable verifyingSigner;

    // paymasterAndData layout:
    // [0:20]  paymaster address
    // [20:84] abi.encode(uint48 validUntil, uint48 validAfter)
    // [84:]   65-byte ECDSA signature
    uint256 private constant VALID_TIMESTAMP_OFFSET = 20;
    uint256 private constant SIGNATURE_OFFSET = 84;

    constructor(IEntryPoint _entryPoint, address _verifyingSigner) BasePaymaster(_entryPoint) {
        verifyingSigner = _verifyingSigner;
    }

    // Explicit field encoding — deliberately avoids the assembly pack() approach from the reference
    // sample so the hash can be reproduced in TypeScript without calldata-layout knowledge.
    // Covers all UserOp fields except paymasterAndData and signature (the fields being signed over).
    function getHash(UserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            block.chainid,
            address(this),
            validUntil,
            validAfter
        ));
    }

    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32,
        uint256
    ) internal override returns (bytes memory context, uint256 validationData) {
        (uint48 validUntil, uint48 validAfter, bytes calldata signature) =
            parsePaymasterAndData(userOp.paymasterAndData);

        require(
            signature.length == 64 || signature.length == 65,
            "VerifyingPaymaster: invalid signature length"
        );

        bytes32 hash = ECDSA.toEthSignedMessageHash(getHash(userOp, validUntil, validAfter));

        if (verifyingSigner != ECDSA.recover(hash, signature)) {
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        return ("", _packValidationData(false, validUntil, validAfter));
    }

    function parsePaymasterAndData(bytes calldata paymasterAndData)
        public
        pure
        returns (uint48 validUntil, uint48 validAfter, bytes calldata signature)
    {
        (validUntil, validAfter) = abi.decode(
            paymasterAndData[VALID_TIMESTAMP_OFFSET:SIGNATURE_OFFSET],
            (uint48, uint48)
        );
        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }

}
