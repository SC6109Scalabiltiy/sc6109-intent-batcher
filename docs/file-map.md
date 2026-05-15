# File Map

Use this map to find the right part of the project quickly.

## Contract Layer

`src/AgentRegistry.sol`

- Registers agent IDs.
- Tracks agent owner, strategy ID, active flag, creation timestamp.
- Used by settlement for ownership and active-status checks.

`src/MockToken.sol`

- Minimal mintable ERC-20-like token.
- Used as mock USDC and mock WETH.
- No production security claims.

`src/BatchDcaSettlement.sol`

- Stores recurring DCA intents.
- Lets owners create, update, and cancel intents.
- Lets the coordinator execute one due intent or a batch of due intents.
- Emits events used by scripts and reports.

## Tests

`test/BatchDcaSettlement.t.sol`

Covers:

- Owner authorization.
- Due scheduling.
- Deadline-window failure.
- Cancelled intent failure.
- Inactive agent failure.
- Max execution deactivation.
- Batch execution.
- Gas-per-intent comparison.

Run:

```bash
npm test
```

Gas report:

```bash
npm run gas
```

## Deployment

`script/Deploy.s.sol`

- Deploys registry, mock tokens, settlement.
- Mints output-token liquidity to settlement.
- Writes `deployments/<network>.json`.

Run:

```bash
npm run deploy:sepolia:no-verify
```

## TypeScript Helpers

`lib/env.ts`

- Loads root/code `.env.local`.
- Parses CLI args.

`lib/runtime.ts`

- Creates ethers provider and deployer wallet.
- Supports `localhost` and `sepolia`.

`lib/contracts.ts`

- Loads Foundry artifacts from `out/`.
- Attaches ethers contract instances.

`lib/deployments.ts`

- Loads and saves deployment/intent JSON.
- Normalizes deployment address lookup.

`lib/format.ts`

- Gas and unit formatting helpers.

`lib/paths.ts`

- Shared paths for deployments and metrics.

## Off-Chain Scripts

`scripts/seed.ts`

- Registers agents.
- Mints mock USDC.
- Approves settlement.
- Creates recurring DCA intents.
- Writes `deployments/<network>-intents.json`.

`scripts/coordinator.ts`

- Loads known intents.
- Filters due intent IDs.
- Calls `executeBatch`.
- Writes coordinator run metrics.

`scripts/benchmark.ts`

- Creates one workload for naive execution.
- Creates another workload for batch execution.
- Compares gas usage.
- Writes JSON and CSV metrics.

## Generated Artifacts

`deployments/sepolia.json`

- Current Sepolia contract addresses.

`deployments/sepolia-intents.json`

- Current seeded Sepolia intent IDs.

`metrics/*.json` and `metrics/*.csv`

- Report-ready output from coordinator and benchmark runs.

`out/`, `cache/`, `broadcast/`

- Foundry-generated build/deployment files.
- Gitignored.

`lib/forge-std`

- Foundry standard library.
- Tracked as a git submodule.
- Initialize after clone with `git submodule update --init --recursive`.
