// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import {IAccount} from "account-abstraction/interfaces/IAccount.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {UserOperation} from "account-abstraction/interfaces/UserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract AgentSmartWallet is IAccount {
    using ECDSA for bytes32;

    IEntryPoint public immutable entryPoint;
    address public immutable owner;

    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    constructor(IEntryPoint _entryPoint, address _owner) {
        entryPoint = _entryPoint;
        owner = _owner;
    }

    receive() external payable {}

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        require(msg.sender == address(entryPoint), "AgentSmartWallet: not entryPoint");

        address recovered = userOpHash.toEthSignedMessageHash().recover(userOp.signature);
        if (recovered != owner) {
            return SIG_VALIDATION_FAILED;
        }

        if (missingAccountFunds > 0) {
            (bool ok,) = payable(address(entryPoint)).call{value: missingAccountFunds}("");
            (ok); // entryPoint always accepts
        }

        return 0;
    }

    function execute(address target, uint256 value, bytes calldata data) external {
        require(msg.sender == address(entryPoint), "AgentSmartWallet: not entryPoint");
        _call(target, value, data);
    }

    function executeBatch(Call[] calldata calls) external {
        require(msg.sender == address(entryPoint), "AgentSmartWallet: not entryPoint");
        for (uint256 i = 0; i < calls.length; i++) {
            _call(calls[i].target, calls[i].value, calls[i].data);
        }
    }

    function _call(address target, uint256 value, bytes calldata data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
}
