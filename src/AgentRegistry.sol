// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract AgentRegistry {
    struct Agent {
        address owner;
        bytes32 strategyId;
        bool active;
        uint64 createdAt;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) public agents;
    address public coordinator;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, bytes32 indexed strategyId);
    event AgentStatusChanged(uint256 indexed agentId, bool active);

    modifier onlyAgentOwner(uint256 agentId) {
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not owner");
        _;
    }

    constructor() {
        coordinator = msg.sender;
    }

    function registerAgent(bytes32 strategyId) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: msg.sender,
            strategyId: strategyId,
            active: true,
            createdAt: uint64(block.timestamp)
        });

        emit AgentRegistered(agentId, msg.sender, strategyId);
    }

    // Allows the trusted coordinator to register an agent on behalf of a smart wallet owner.
    // Used during seeding so the deployer can set the smart wallet as the agent owner.
    function registerAgentFor(address agentOwner, bytes32 strategyId) external returns (uint256 agentId) {
        require(msg.sender == coordinator, "AgentRegistry: not coordinator");
        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: agentOwner,
            strategyId: strategyId,
            active: true,
            createdAt: uint64(block.timestamp)
        });
        emit AgentRegistered(agentId, agentOwner, strategyId);
    }

    function setAgentActive(uint256 agentId, bool active) external onlyAgentOwner(agentId) {
        agents[agentId].active = active;
        emit AgentStatusChanged(agentId, active);
    }

    function getAgentOwner(uint256 agentId) external view returns (address) {
        return agents[agentId].owner;
    }

    function isActive(uint256 agentId) external view returns (bool) {
        return agents[agentId].active;
    }
}

