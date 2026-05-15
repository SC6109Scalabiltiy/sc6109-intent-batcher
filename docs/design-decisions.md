# Design Decisions

This document explains the important choices in the MVP so future agents can extend the project without accidentally changing the research scope.

## Foundry-Led Hybrid Stack

The project uses Foundry for the contract layer because it gives:

- Fast Solidity tests.
- Good gas reporting with `forge test --gas-report`.
- Simple Sepolia deployment with `forge script`.
- Solidity-native deployment code.

TypeScript remains useful for the off-chain coordinator because:

- It can persist deployment and intent state as JSON.
- It can query contracts and batch due intent IDs.
- It can write report-ready metrics as JSON/CSV.

Do not reintroduce Hardhat unless there is a specific need. The current verified workflow is Foundry plus TypeScript.

## Why Mock Tokens And Fixed Pricing

The course objective is scalability, not market execution. Sepolia liquidity is unreliable and external router addresses may change. Mock tokens and a fixed price keep the experiment reproducible.

The fixed quote is:

```solidity
amountOut = amountIn * priceNumerator / priceDenominator
```

In the current deployment, `10,000` mock USDC maps to `5` mock WETH in unit-adjusted terms. This is a deterministic stand-in for a DEX quote.

## Why On-Chain Recurring Intents

The first scaffold used off-chain orders. The final version stores recurring intent metadata on-chain because it makes the testnet demo easier to verify:

- Intent creation emits events.
- `isDue(intentId)` is queryable.
- The coordinator only passes IDs.
- Schedule advancement is enforced by the contract.

This is not the cheapest possible production design. It is a clear educational design for the course report.

## Why A Trusted Coordinator

The coordinator is intentionally trusted. This keeps the MVP focused on batching and throughput.

The coordinator can:

- Choose which due intents to include.
- Delay an intent by not including it.
- Submit batches at any cadence.

The coordinator cannot:

- Spend tokens without user approval.
- Execute inactive agents.
- Execute inactive/cancelled intents.
- Execute outside the schedule window.
- Force output below `minAmountOut`.

This trust model should be stated clearly in the report.

## Why Single-Deployer Seeding

The Sepolia seed script currently creates multiple agents owned by the deployer. This is deliberate:

- It avoids funding many test wallets with Sepolia ETH.
- It still creates many distinct agent IDs and intent IDs.
- It is enough to measure settlement gas and batching savings.

A future version can use deterministic per-agent wallets for a more realistic multi-owner demo.

## Metrics Philosophy

The main scalability metric is gas per intent.

Useful outputs:

- Naive total gas.
- Naive gas per intent.
- Batch total gas.
- Batch gas per intent.
- Gas reduction percentage.
- Intent count per transaction.
- Sepolia transaction hashes.

Avoid claiming the batch transaction is cheaper than one single execution. The claim is that one batch is cheaper than many single executions.

## Extension Priorities

Best next extensions:

1. Batch size sweep: run 1, 3, 5, 10, 25, 50 intents and plot gas per intent.
2. Signed off-chain intents: add EIP-712 authorization so intent creation can be relayed.
3. Multi-owner seed mode: fund deterministic test wallets and create owner-specific agents.
4. Real router adapter: optional module for a known deployed testnet router.
5. Coordinator decentralization discussion: add solver/relayer trust alternatives.

Avoid before the report is stable:

- Full ERC-4337 stack.
- Cross-chain support.
- Frontend polish.
- Real LLM integration.

