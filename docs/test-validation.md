# Test Validation Status

Last updated: 2026-05-15.

This document records the current verified state of the Shape A intent batcher implementation.

## Summary

Current status: **working end to end on Sepolia**.

Validated:

- Foundry compilation.
- Solidity unit tests.
- TypeScript type checking.
- Production dependency audit.
- Sepolia deployment.
- Sepolia agent/intent seeding.
- Sepolia coordinator batch execution.
- Sepolia naive-vs-batch gas benchmark.

## Local Validation

Run from `code/`:

```bash
npm run compile
npm test
npm run typecheck
npm audit --omit=dev
```

Latest known result:

```text
npm run compile: pass
npm test: 11 Solidity tests passed
npm run typecheck: pass
npm audit --omit=dev: 0 vulnerabilities
```

The Solidity test suite is:

```text
test/BatchDcaSettlement.t.sol
```

Covered behavior:

- Agent registration.
- Intent owner authorization.
- Recurring intent creation.
- Intent cancellation.
- Not-due execution rejection.
- Missed-window execution rejection.
- Inactive-agent execution rejection.
- Max-execution deactivation.
- Batch execution.
- Coordinator-only execution.
- Batch gas per intent lower than naive single execution.

## Sepolia Deployment

Deployment file:

```text
deployments/sepolia.json
```

Current deployed contracts:

```text
AgentRegistry:      0x2ca0b63FA3d2574D916F57Be1264741a14D29192
MockUSDC:           0x2A1499f86c5E1c73d5e6627daefd565006C5d70E
MockWETH:           0x366D4c45d29d443474628F48faaD15FD151689d7
BatchDcaSettlement: 0xa587ABBB1C59A20fd10B766c8FCc3768Bbf0D5D2
```

Deployment transactions:

```text
AgentRegistry:      0xec8cd0c4574ed1efc9b401cb6a531895a17511f2495c6ceb9bb33dba94db4cd9
MockUSDC:           0x25cb675b8199fc59f29fc38df5c6a894850e78881191bf23436fe2ec2adcbb76
MockWETH:           0x65d4c821e5e3985d3167c7c26748d1434dfdafcc0e9a40c718c2e701bef59aab
BatchDcaSettlement: 0xb69724fcad55b489c9db66d6c44b6fb40f03c9088a414e75c02ca588eb4b0a2d
Output liquidity:   0x67978e07a1af2ef879caef402ba4ffa2b666b0a5cb60501f2d009fbc1f20e34d
```

Bytecode was checked at each deployed address after deployment.

## Sepolia Seed Run

Command used:

```bash
npm run seed:sepolia -- --agents 3 --amount-usdc 10 --max-executions 1
```

Output file:

```text
deployments/sepolia-intents.json
```

Seeded state:

```text
agents: 3
intent IDs: 1, 2, 3
seed gas total: 795,934
```

Intent creation transactions:

```text
intent 1: 0x6d6490b15eda3c8ff7df00c9742160464b64a2c652abf7761bd9d4f74a5452a6
intent 2: 0xa0cdac0f099af86ae36c4b45891f637712281d7afd1dbba28e624b7918d370ac
intent 3: 0x1401353e5b3028a5a40e4b0f65d08926d4c21076b75efb6026a63f01d3437c42
```

## Sepolia Coordinator Run

Command used:

```bash
npm run coordinator:sepolia
```

Metrics file:

```text
metrics/sepolia-coordinator-2026-05-15T12-33-14-633Z.json
```

Result:

```text
transaction: 0x910f000f8e1e1803d6f0f725767f74df2c3b41478cbcecc5d51891bb61458c59
block: 10857262
intents executed: 3
gas used: 184,973
gas per intent: 61,657
```

This validates the end-to-end coordinator path:

```text
known intent IDs -> due check -> executeBatch -> on-chain settlement -> metrics
```

## Sepolia Benchmark Run

Command used:

```bash
npm run benchmark:sepolia -- --agents 3 --amount-usdc 10
```

Metrics files:

```text
metrics/sepolia-benchmark-2026-05-15T12-38-00-748Z.json
metrics/sepolia-benchmark-2026-05-15T12-38-00-748Z.csv
```

Result:

```text
agent count: 3
naive total gas: 262,686
naive gas / intent: 87,562
batch total gas: 150,773
batch gas / intent: 50,257
gas reduction: 42.6%
```

Naive execution transactions:

```text
0x3b96f70fb9c3392c9328ebcb1a0d0d14752f54c44bb86efa3b5ac0646b45e916
0xd8c6a4b34f6f0b019b3815dab93b53c7384e141a53e6f9078ec1e95af3622dac
0xad2fd4f2076712aed9db9de6bccdb43cb60003fcc9bbcc459d43b89ab8d153d3
```

Batch execution transaction:

```text
0x27d7b266731898c7d144c1cc9615a03b57b098a03aa11f1dc01d66a9b48ca353
```

## Interpretation

The Sepolia benchmark supports the project’s scalability claim:

- Naive execution uses one transaction per intent.
- Batch execution settles multiple due intents in one transaction.
- The batch transaction uses less gas per intent.
- For the current 3-intent test, gas per intent dropped from `87,562` to `50,257`.

The result should be reported as gas amortization, not as a claim that one batch is cheaper than one single intent.

## Current Caveats

- Contracts were deployed without Etherscan source verification.
- Testnet uses mock tokens and fixed pricing, not a real DEX.
- The coordinator is trusted and centralized.
- Current Sepolia seed mode uses one owner/deployer for multiple agents to avoid funding many wallets.
- Batch-size sweep has not yet been run for larger sizes such as 5, 10, 25, or 50.
- No frontend is included.

## Recommended Next Validation

To strengthen the final report:

1. Run `npm run benchmark:sepolia -- --agents 5`.
2. Run `npm run benchmark:sepolia -- --agents 10`.
3. Add the JSON/CSV metrics to a gas comparison table.
4. Optionally verify contracts on Etherscan.
5. Optionally add a chart for gas per intent vs. batch size.

