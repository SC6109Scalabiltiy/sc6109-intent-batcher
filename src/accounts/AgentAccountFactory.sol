// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {AgentSmartWallet} from "./AgentSmartWallet.sol";

contract AgentAccountFactory {
    IEntryPoint public immutable entryPoint;

    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
    }

    function createAccount(address owner, uint256 salt) external returns (AgentSmartWallet account) {
        bytes32 create2Salt = keccak256(abi.encodePacked(owner, salt));
        address predicted = _computeAddress(owner, create2Salt);

        if (predicted.code.length > 0) {
            return AgentSmartWallet(payable(predicted));
        }

        account = new AgentSmartWallet{salt: create2Salt}(entryPoint, owner);
    }

    function getAddress(address owner, uint256 salt) external view returns (address) {
        bytes32 create2Salt = keccak256(abi.encodePacked(owner, salt));
        return _computeAddress(owner, create2Salt);
    }

    function _computeAddress(address owner, bytes32 create2Salt) internal view returns (address) {
        bytes memory creationCode = abi.encodePacked(
            type(AgentSmartWallet).creationCode,
            abi.encode(entryPoint, owner)
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            create2Salt,
                            keccak256(creationCode)
                        )
                    )
                )
            )
        );
    }
}
