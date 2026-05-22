// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BatchDcaSettlement} from "../src/BatchDcaSettlement.sol";
import {MockToken} from "../src/MockToken.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {AgentAccountFactory} from "../src/accounts/AgentAccountFactory.sol";
import {VerifyingPaymaster} from "../src/paymaster/VerifyingPaymaster.sol";

contract Deploy is Script {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant WETH = 1e18;

    // Canonical EntryPoint v0.6 address on all public networks
    address internal constant CANONICAL_ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external returns (
        AgentRegistry registry,
        MockToken usdc,
        MockToken weth,
        BatchDcaSettlement settlement,
        IEntryPoint entryPoint,
        AgentAccountFactory factory,
        VerifyingPaymaster paymaster
    ) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        uint256 outputLiquidity = vm.envOr("OUTPUT_LIQUIDITY_WETH", uint256(100)) * WETH;
        uint256 paymasterPrefund = vm.envOr("PAYMASTER_PREFUND_ETH", uint256(0.1 ether));

        vm.startBroadcast(deployerKey);

        registry = new AgentRegistry();
        usdc = new MockToken("Mock USDC", "mUSDC", 6);
        weth = new MockToken("Mock WETH", "mWETH", 18);
        settlement = new BatchDcaSettlement(registry, usdc, weth, 5 * WETH, 10_000 * USDC);
        weth.mint(address(settlement), outputLiquidity);

        // On Anvil/local, deploy a fresh EntryPoint; on public networks use the canonical address.
        if (block.chainid == 31337) {
            entryPoint = IEntryPoint(address(new EntryPoint()));
        } else {
            entryPoint = IEntryPoint(CANONICAL_ENTRY_POINT);
        }

        factory = new AgentAccountFactory(entryPoint);
        paymaster = new VerifyingPaymaster(entryPoint, deployer);

        // Fund the paymaster's gas deposit in the EntryPoint
        entryPoint.depositTo{value: paymasterPrefund}(address(paymaster));

        vm.stopBroadcast();

        console2.log("AgentRegistry      ", address(registry));
        console2.log("MockUSDC           ", address(usdc));
        console2.log("MockWETH           ", address(weth));
        console2.log("BatchDcaSettlement ", address(settlement));
        console2.log("EntryPoint         ", address(entryPoint));
        console2.log("AgentAccountFactory", address(factory));
        console2.log("VerifyingPaymaster ", address(paymaster));

        _writeDeployment(registry, usdc, weth, settlement, entryPoint, factory, paymaster, outputLiquidity);
    }

    function _writeDeployment(
        AgentRegistry registry,
        MockToken usdc,
        MockToken weth,
        BatchDcaSettlement settlement,
        IEntryPoint entryPoint,
        AgentAccountFactory factory,
        VerifyingPaymaster paymaster,
        uint256 outputLiquidity
    ) internal {
        string memory networkName = vm.envOr("NETWORK_NAME", string("local"));
        string memory path = string.concat("deployments/", networkName, ".json");
        string memory root = "deployment";

        vm.serializeString(root, "schema", "sc6109.shape-a.foundry.deployment.v1");
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "deployer", vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY")));
        vm.serializeAddress(root, "AgentRegistry", address(registry));
        vm.serializeAddress(root, "MockUSDC", address(usdc));
        vm.serializeAddress(root, "MockWETH", address(weth));
        vm.serializeAddress(root, "BatchDcaSettlement", address(settlement));
        vm.serializeAddress(root, "EntryPoint", address(entryPoint));
        vm.serializeAddress(root, "AgentAccountFactory", address(factory));
        vm.serializeAddress(root, "VerifyingPaymaster", address(paymaster));
        vm.serializeUint(root, "priceNumerator", 5 * WETH);
        vm.serializeUint(root, "priceDenominator", 10_000 * USDC);
        string memory json = vm.serializeUint(root, "outputLiquidity", outputLiquidity);

        vm.writeJson(json, path);
        console2.log("Saved deployment", path);
    }
}
