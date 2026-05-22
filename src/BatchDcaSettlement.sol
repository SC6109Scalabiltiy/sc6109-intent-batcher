// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentRegistry} from "./AgentRegistry.sol";
import {MockToken} from "./MockToken.sol";

contract BatchDcaSettlement {
    struct DcaOrder {
        uint256 agentId;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
    }

    struct RecurringIntent {
        uint256 agentId;
        uint256 amountIn;
        uint256 minAmountOut;
        uint64 intervalSeconds;
        uint64 nextExecution;
        uint64 deadlineWindow;
        uint32 maxExecutions;
        uint32 executions;
        bool active;
    }

    AgentRegistry public immutable registry;
    MockToken public immutable inputToken;
    MockToken public immutable outputToken;
    uint256 public immutable priceNumerator;
    uint256 public immutable priceDenominator;
    address public coordinator;
    uint256 public nextIntentId = 1;

    mapping(uint256 => RecurringIntent) public intents;

    event IntentCreated(
        uint256 indexed intentId,
        uint256 indexed agentId,
        address indexed owner,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64 intervalSeconds,
        uint64 nextExecution,
        uint64 deadlineWindow,
        uint32 maxExecutions
    );
    event IntentUpdated(
        uint256 indexed intentId,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64 intervalSeconds,
        uint64 nextExecution,
        uint64 deadlineWindow,
        uint32 maxExecutions
    );
    event IntentCancelled(uint256 indexed intentId);
    event CoordinatorChanged(address indexed oldCoordinator, address indexed newCoordinator);
    event DcaSettled(
        uint256 indexed intentId,
        uint256 indexed agentId,
        address indexed owner,
        uint256 amountIn,
        uint256 amountOut,
        uint64 nextExecution,
        uint32 executions
    );
    event BatchSettled(uint256 orderCount, uint256 totalAmountIn, uint256 totalAmountOut);

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "BatchDcaSettlement: not coordinator");
        _;
    }

    constructor(
        AgentRegistry agentRegistry,
        MockToken dcaInputToken,
        MockToken dcaOutputToken,
        uint256 fixedPriceNumerator,
        uint256 fixedPriceDenominator
    ) {
        require(address(agentRegistry) != address(0), "BatchDcaSettlement: registry zero");
        require(address(dcaInputToken) != address(0), "BatchDcaSettlement: input zero");
        require(address(dcaOutputToken) != address(0), "BatchDcaSettlement: output zero");
        require(fixedPriceDenominator != 0, "BatchDcaSettlement: bad price");

        registry = agentRegistry;
        inputToken = dcaInputToken;
        outputToken = dcaOutputToken;
        priceNumerator = fixedPriceNumerator;
        priceDenominator = fixedPriceDenominator;
        coordinator = msg.sender;
        emit CoordinatorChanged(address(0), msg.sender);
    }

    function setCoordinator(address newCoordinator) external onlyCoordinator {
        require(newCoordinator != address(0), "BatchDcaSettlement: coordinator zero");
        address oldCoordinator = coordinator;
        coordinator = newCoordinator;
        emit CoordinatorChanged(oldCoordinator, newCoordinator);
    }

    function createRecurringIntent(
        uint256 agentId,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64 intervalSeconds,
        uint64 nextExecution,
        uint64 deadlineWindow,
        uint32 maxExecutions
    ) external returns (uint256 intentId) {
        _requireAgentOwner(agentId);
        require(registry.isActive(agentId), "BatchDcaSettlement: inactive agent");
        require(amountIn > 0, "BatchDcaSettlement: zero amount");
        require(intervalSeconds > 0, "BatchDcaSettlement: zero interval");
        require(deadlineWindow > 0, "BatchDcaSettlement: zero deadline window");

        intentId = nextIntentId++;
        intents[intentId] = RecurringIntent({
            agentId: agentId,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            intervalSeconds: intervalSeconds,
            nextExecution: nextExecution,
            deadlineWindow: deadlineWindow,
            maxExecutions: maxExecutions,
            executions: 0,
            active: true
        });

        emit IntentCreated(
            intentId,
            agentId,
            msg.sender,
            amountIn,
            minAmountOut,
            intervalSeconds,
            nextExecution,
            deadlineWindow,
            maxExecutions
        );
    }

    function updateRecurringIntent(
        uint256 intentId,
        uint256 amountIn,
        uint256 minAmountOut,
        uint64 intervalSeconds,
        uint64 nextExecution,
        uint64 deadlineWindow,
        uint32 maxExecutions
    ) external {
        RecurringIntent storage intent = intents[intentId];
        require(intent.active, "BatchDcaSettlement: inactive intent");
        _requireAgentOwner(intent.agentId);
        require(amountIn > 0, "BatchDcaSettlement: zero amount");
        require(intervalSeconds > 0, "BatchDcaSettlement: zero interval");
        require(deadlineWindow > 0, "BatchDcaSettlement: zero deadline window");
        require(maxExecutions == 0 || maxExecutions >= intent.executions, "BatchDcaSettlement: max below executions");

        intent.amountIn = amountIn;
        intent.minAmountOut = minAmountOut;
        intent.intervalSeconds = intervalSeconds;
        intent.nextExecution = nextExecution;
        intent.deadlineWindow = deadlineWindow;
        intent.maxExecutions = maxExecutions;

        emit IntentUpdated(
            intentId,
            amountIn,
            minAmountOut,
            intervalSeconds,
            nextExecution,
            deadlineWindow,
            maxExecutions
        );
    }

    function cancelRecurringIntent(uint256 intentId) external {
        RecurringIntent storage intent = intents[intentId];
        require(intent.active, "BatchDcaSettlement: inactive intent");
        _requireAgentOwner(intent.agentId);
        intent.active = false;
        emit IntentCancelled(intentId);
    }

    function executeIntent(uint256 intentId) external returns (uint256 amountOut) {
        require(
            registry.getAgentOwner(intents[intentId].agentId) == msg.sender,
            "BatchDcaSettlement: not agent owner"
        );
        uint256 amountIn;
        (amountIn, amountOut) = _settleIntent(intentId);
        emit BatchSettled(1, amountIn, amountOut);
    }

    function executeBatch(uint256[] calldata intentIds)
        external
        onlyCoordinator
        returns (uint256 totalAmountIn, uint256 totalAmountOut)
    {
        require(intentIds.length > 0, "BatchDcaSettlement: empty batch");

        for (uint256 i = 0; i < intentIds.length; i++) {
            (uint256 amountIn, uint256 amountOut) = _settleIntent(intentIds[i]);
            totalAmountIn += amountIn;
            totalAmountOut += amountOut;
        }

        emit BatchSettled(intentIds.length, totalAmountIn, totalAmountOut);
    }

    function executeSingle(DcaOrder calldata order) external onlyCoordinator returns (uint256 amountOut) {
        amountOut = _settleOrder(order, 0);
        emit BatchSettled(1, order.amountIn, amountOut);
    }

    function executeOrders(DcaOrder[] calldata orders)
        external
        onlyCoordinator
        returns (uint256 totalAmountIn, uint256 totalAmountOut)
    {
        require(orders.length > 0, "BatchDcaSettlement: empty batch");

        for (uint256 i = 0; i < orders.length; i++) {
            uint256 amountOut = _settleOrder(orders[i], 0);
            totalAmountIn += orders[i].amountIn;
            totalAmountOut += amountOut;
        }

        emit BatchSettled(orders.length, totalAmountIn, totalAmountOut);
    }

    function quote(uint256 amountIn) public view returns (uint256) {
        return (amountIn * priceNumerator) / priceDenominator;
    }

    function isDue(uint256 intentId) public view returns (bool) {
        RecurringIntent memory intent = intents[intentId];
        if (!intent.active || !registry.isActive(intent.agentId)) {
            return false;
        }
        if (intent.maxExecutions != 0 && intent.executions >= intent.maxExecutions) {
            return false;
        }
        return block.timestamp >= intent.nextExecution;
    }

    function getIntentIds(uint256 fromInclusive, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 upper = nextIntentId;
        if (fromInclusive == 0) {
            fromInclusive = 1;
        }
        if (fromInclusive >= upper || limit == 0) {
            return new uint256[](0);
        }

        uint256 remaining = upper - fromInclusive;
        uint256 size = remaining < limit ? remaining : limit;
        ids = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            ids[i] = fromInclusive + i;
        }
    }

    function getDueIntentIds(uint256 fromInclusive, uint256 limit) external view returns (uint256[] memory dueIds) {
        uint256[] memory ids = this.getIntentIds(fromInclusive, limit);
        uint256 dueCount = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            if (isDue(ids[i])) {
                dueCount++;
            }
        }

        dueIds = new uint256[](dueCount);
        uint256 cursor = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (isDue(ids[i])) {
                dueIds[cursor++] = ids[i];
            }
        }
    }

    function _settleIntent(uint256 intentId) internal returns (uint256 amountIn, uint256 amountOut) {
        RecurringIntent storage intent = intents[intentId];
        require(intent.active, "BatchDcaSettlement: inactive intent");
        require(registry.isActive(intent.agentId), "BatchDcaSettlement: inactive agent");
        require(block.timestamp >= intent.nextExecution, "BatchDcaSettlement: not due");
        require(
            block.timestamp <= uint256(intent.nextExecution) + intent.deadlineWindow,
            "BatchDcaSettlement: missed window"
        );
        require(intent.maxExecutions == 0 || intent.executions < intent.maxExecutions, "BatchDcaSettlement: complete");

        amountIn = intent.amountIn;
        amountOut = _settleOrder(
            DcaOrder({
                agentId: intent.agentId,
                amountIn: intent.amountIn,
                minAmountOut: intent.minAmountOut,
                deadline: block.timestamp + intent.deadlineWindow
            }),
            intentId
        );

        intent.executions += 1;
        if (intent.maxExecutions != 0 && intent.executions >= intent.maxExecutions) {
            intent.active = false;
            intent.nextExecution = 0;
        } else {
            intent.nextExecution = uint64(block.timestamp + intent.intervalSeconds);
        }

        emit DcaSettled(
            intentId,
            intent.agentId,
            registry.getAgentOwner(intent.agentId),
            amountIn,
            amountOut,
            intent.nextExecution,
            intent.executions
        );
    }

    function _settleOrder(DcaOrder memory order, uint256 intentId) internal returns (uint256 amountOut) {
        require(block.timestamp <= order.deadline, "BatchDcaSettlement: expired");
        require(registry.isActive(order.agentId), "BatchDcaSettlement: inactive agent");
        require(order.amountIn > 0, "BatchDcaSettlement: zero amount");

        address owner = registry.getAgentOwner(order.agentId);
        amountOut = quote(order.amountIn);
        require(amountOut >= order.minAmountOut, "BatchDcaSettlement: slippage");

        require(inputToken.transferFrom(owner, address(this), order.amountIn), "BatchDcaSettlement: input transfer");
        require(outputToken.transfer(owner, amountOut), "BatchDcaSettlement: output transfer");

        if (intentId == 0) {
            emit DcaSettled(0, order.agentId, owner, order.amountIn, amountOut, 0, 0);
        }
    }

    function _requireAgentOwner(uint256 agentId) internal view {
        require(registry.getAgentOwner(agentId) == msg.sender, "BatchDcaSettlement: not agent owner");
    }
}
