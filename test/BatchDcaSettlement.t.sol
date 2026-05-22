// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BatchDcaSettlement} from "../src/BatchDcaSettlement.sol";
import {MockToken} from "../src/MockToken.sol";

contract BatchDcaSettlementTest is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant WETH = 1e18;

    AgentRegistry internal registry;
    MockToken internal usdc;
    MockToken internal weth;
    BatchDcaSettlement internal settlement;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
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
        weth.mint(address(settlement), 100 * WETH);
    }

    function testOwnerCanCreateAndExecuteDueRecurringIntent() public {
        uint256 intentId = _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp));

        uint256 amountOut = settlement.quote(10 * USDC);

        // executeIntent is now restricted to the agent owner (alice), not the coordinator
        vm.prank(alice);
        settlement.executeIntent(intentId);

        assertEq(usdc.balanceOf(alice), 0);
        assertEq(weth.balanceOf(alice), amountOut);

        (
            ,
            ,
            ,
            ,
            uint64 nextExecution,
            ,
            ,
            uint32 executions,
            bool active
        ) = settlement.intents(intentId);

        assertEq(executions, 1);
        assertTrue(active);
        assertEq(nextExecution, uint64(block.timestamp + 1 hours));
    }

    function testCannotCreateIntentForAnotherOwnersAgent() public {
        uint256 agentId = _register(alice);

        vm.prank(bob);
        vm.expectRevert("BatchDcaSettlement: not agent owner");
        settlement.createRecurringIntent(agentId, 10 * USDC, 0, 1 hours, uint64(block.timestamp), 10 minutes, 0);
    }

    function testNotDueIntentCannotExecute() public {
        uint256 intentId = _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp + 1 hours));

        vm.prank(alice);
        vm.expectRevert("BatchDcaSettlement: not due");
        settlement.executeIntent(intentId);
    }

    function testCancelledIntentCannotExecute() public {
        uint256 intentId = _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp));

        vm.prank(alice);
        settlement.cancelRecurringIntent(intentId);

        vm.prank(alice);
        vm.expectRevert("BatchDcaSettlement: inactive intent");
        settlement.executeIntent(intentId);
    }

    // executeIntent is now guarded by agent ownership, not coordinator role
    function testNonOwnerCannotCallExecuteIntent() public {
        uint256 intentId = _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp));

        vm.prank(bob);
        vm.expectRevert("BatchDcaSettlement: not agent owner");
        settlement.executeIntent(intentId);
    }

    function testMissedExecutionWindowCannotExecute() public {
        uint256 intentId = _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp));

        vm.warp(block.timestamp + 11 minutes);

        vm.prank(alice);
        vm.expectRevert("BatchDcaSettlement: missed window");
        settlement.executeIntent(intentId);
    }

    function testInactiveAgentCannotExecute() public {
        uint256 intentId = _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp));
        vm.prank(alice);
        registry.setAgentActive(1, false);

        vm.prank(alice);
        vm.expectRevert("BatchDcaSettlement: inactive agent");
        settlement.executeIntent(intentId);
    }

    function testMaxExecutionsDeactivatesIntent() public {
        uint256 agentId = _register(alice);
        _fundAndApprove(alice, 20 * USDC);

        vm.prank(alice);
        uint256 intentId =
            settlement.createRecurringIntent(agentId, 10 * USDC, 0, 1 hours, uint64(block.timestamp), 10 minutes, 1);

        vm.prank(alice);
        settlement.executeIntent(intentId);

        (,,,,,,,, bool active) = settlement.intents(intentId);
        assertFalse(active);
        assertFalse(settlement.isDue(intentId));
    }

    function testBatchExecutesDueIntents() public {
        uint256[] memory ids = _createBatch(5);

        // executeBatch remains onlyCoordinator — test contract is the coordinator
        settlement.executeBatch(ids);

        for (uint256 i = 0; i < ids.length; i++) {
            address owner = address(uint160(1000 + i));
            assertEq(usdc.balanceOf(owner), 0);
            assertEq(weth.balanceOf(owner), settlement.quote(10 * USDC));
        }
    }

    function testBatchUsesLessGasPerIntentThanSingles() public {
        uint256[] memory singleIds = _createBatch(8);

        uint256 gasBefore = gasleft();
        for (uint256 i = 0; i < singleIds.length; i++) {
            address owner = address(uint160(1000 + i));
            vm.prank(owner);
            settlement.executeIntent(singleIds[i]);
        }
        uint256 singleGas = gasBefore - gasleft();

        setUp();
        uint256[] memory batchIds = _createBatch(8);

        gasBefore = gasleft();
        settlement.executeBatch(batchIds);
        uint256 batchGas = gasBefore - gasleft();

        assertLt(batchGas / batchIds.length, singleGas / singleIds.length);
    }

    function testGetDueIntentIds() public {
        _createFundedIntent(alice, 10 * USDC, 1 hours, uint64(block.timestamp));
        _createFundedIntent(bob, 10 * USDC, 1 hours, uint64(block.timestamp + 1 hours));

        uint256[] memory dueIds = settlement.getDueIntentIds(1, 10);

        assertEq(dueIds.length, 1);
        assertEq(dueIds[0], 1);
    }

    function _createBatch(uint256 count) internal returns (uint256[] memory ids) {
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = _createFundedIntent(address(uint160(1000 + i)), 10 * USDC, 1 hours, uint64(block.timestamp));
        }
    }

    function _createFundedIntent(
        address owner,
        uint256 amountIn,
        uint64 interval,
        uint64 nextExecution
    ) internal returns (uint256 intentId) {
        uint256 agentId = _register(owner);
        _fundAndApprove(owner, amountIn);

        vm.prank(owner);
        intentId = settlement.createRecurringIntent(agentId, amountIn, 0, interval, nextExecution, 10 minutes, 0);
    }

    function _register(address owner) internal returns (uint256 agentId) {
        vm.prank(owner);
        agentId = registry.registerAgent(keccak256("DCA_USDC_TO_WETH"));
    }

    function _fundAndApprove(address owner, uint256 amount) internal {
        usdc.mint(owner, amount);
        vm.prank(owner);
        usdc.approve(address(settlement), amount);
    }
}
