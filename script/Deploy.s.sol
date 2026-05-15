// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BatchDcaSettlement} from "../src/BatchDcaSettlement.sol";
import {MockToken} from "../src/MockToken.sol";

contract Deploy is Script {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant WETH = 1e18;

    function run() external returns (AgentRegistry registry, MockToken usdc, MockToken weth, BatchDcaSettlement settlement) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 outputLiquidity = vm.envOr("OUTPUT_LIQUIDITY_WETH", uint256(100)) * WETH;

        vm.startBroadcast(deployerKey);

        registry = new AgentRegistry();
        usdc = new MockToken("Mock USDC", "mUSDC", 6);
        weth = new MockToken("Mock WETH", "mWETH", 18);
        settlement = new BatchDcaSettlement(
            registry,
            usdc,
            weth,
            5 * WETH,
            10_000 * USDC
        );
        weth.mint(address(settlement), outputLiquidity);

        vm.stopBroadcast();

        console2.log("AgentRegistry", address(registry));
        console2.log("MockUSDC", address(usdc));
        console2.log("MockWETH", address(weth));
        console2.log("BatchDcaSettlement", address(settlement));

        _writeDeployment(registry, usdc, weth, settlement, outputLiquidity);
    }

    function _writeDeployment(
        AgentRegistry registry,
        MockToken usdc,
        MockToken weth,
        BatchDcaSettlement settlement,
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
        vm.serializeUint(root, "priceNumerator", 5 * WETH);
        vm.serializeUint(root, "priceDenominator", 10_000 * USDC);
        string memory json = vm.serializeUint(root, "outputLiquidity", outputLiquidity);

        vm.writeJson(json, path);
        console2.log("Saved deployment", path);
    }
}

