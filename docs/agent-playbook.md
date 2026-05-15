# Agent Playbook

This is the working checklist for future coding agents.

## First Steps

From `code/`:

```bash
git submodule update --init --recursive
npm install
npm run compile
npm test
npm run typecheck
```

If any of these fail, fix that before adding features.

## Before Editing Contracts

Read:

- `docs/architecture.md`
- `docs/design-decisions.md`
- `src/BatchDcaSettlement.sol`
- `test/BatchDcaSettlement.t.sol`

Keep changes aligned with the Shape A scope. This is a scalability prototype, not a production DeFi protocol.

## Before Editing Scripts

Read:

- `docs/file-map.md`
- `lib/runtime.ts`
- `lib/contracts.ts`
- `scripts/seed.ts`
- `scripts/coordinator.ts`
- `scripts/benchmark.ts`

Scripts should not print secrets. They may print addresses, transaction hashes, gas, and file paths.

## Common Tasks

### Run Local Verification

```bash
npm run compile
npm test
npm run typecheck
```

### Deploy To Sepolia

```bash
npm run deploy:sepolia:no-verify
```

This expects `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` in `.env.local`.

### Seed Sepolia

```bash
npm run seed:sepolia -- --agents 3 --amount-usdc 10 --max-executions 1
```

### Execute A Batch

```bash
npm run coordinator:sepolia
```

### Benchmark

```bash
npm run benchmark:sepolia -- --agents 3 --amount-usdc 10
```

## Rules Of Thumb

- Prefer simple contracts with clear events.
- Keep Sepolia runs reproducible with mock tokens.
- Preserve JSON/CSV metrics for the report.
- Do not commit private keys, `.env.local`, `cache/`, `out/`, or `broadcast/`.
- Do not make the coordinator more complex unless the report needs it.
- Explain trust assumptions whenever adding coordinator power.

## Known Good Sepolia State

The current deployment and metrics are documented in `docs/sepolia-runbook.md`.
The latest validation snapshot is documented in `docs/test-validation.md`.

Use that as a reference point when deciding whether a new change is a regression.
