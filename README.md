# SC6109 Intent Batcher

Shape A implementation for **Intent Batcher for Scheduled Agents**.

The project uses Foundry for contracts, Solidity tests, gas reporting, and Sepolia deployment. TypeScript scripts provide the off-chain coordinator, seeding, and benchmark workflow.

## Components

- `src/AgentRegistry.sol` registers autonomous agent identities.
- `src/MockToken.sol` provides mock USDC/WETH test tokens.
- `src/BatchDcaSettlement.sol` stores recurring DCA intents and executes due intents singly or in batches.
- `script/Deploy.s.sol` deploys the protocol and writes `deployments/<network>.json`.
- `scripts/seed.ts` registers agents and creates recurring intents.
- `scripts/coordinator.ts` executes due intents in one batch.
- `scripts/benchmark.ts` compares naive single execution against batch execution.
- `test/BatchDcaSettlement.t.sol` verifies authorization, scheduling, cancellation, batch execution, and gas savings.

## Commands

```bash
git submodule update --init --recursive
npm install
npm run compile
npm test
npm run typecheck
```

Frontend/backend dashboard:

```bash
npm run dev:server   # Fastify API on http://127.0.0.1:4000
npm run dev:web      # Next.js dashboard on http://127.0.0.1:3000
npm run test:server
npm run build:web
```

Sepolia:

```bash
npm run deploy:sepolia:no-verify
npm run seed:sepolia -- --agents 3
npm run coordinator:sepolia
npm run benchmark:sepolia -- --agents 3
```

Use `npm run deploy:sepolia` when Etherscan verification is needed. The no-verify command is more reliable for testnet smoke runs.

Useful docs:

- `docs/architecture.md`
- `docs/design-decisions.md`
- `docs/file-map.md`
- `docs/agent-playbook.md`
- `docs/sepolia-runbook.md`
- `docs/test-validation.md`

## Dashboard API

The frontend consumes the coordinator API instead of reading chain state directly.

- `GET /api/health`
- `GET /api/deployment?network=sepolia`
- `GET /api/intents?network=sepolia`
- `GET /api/batches?network=sepolia&limit=20`
- `GET /api/metrics/latest?network=sepolia`
- `GET /api/metrics/curve?network=sepolia`
- `POST /api/coordinator/run`
- `POST /api/admin/run-baseline`
- `POST /api/admin/run-sweep`

## Current MVP Assumptions

- Agents are simulated accounts/records, not real LLMs.
- The deployer is the trusted coordinator by default.
- Users approve the settlement contract to spend mock input tokens.
- Output pricing is fixed to keep Sepolia runs reproducible without external DEX liquidity.
- ERC-4337, real DEX routing, signed intents, and permissionless solvers are future extensions.

## Demo steps

### 1. Seed fresh smart-wallet agents
npm run seed:sepolia -- --agents 3 --interval 60 --max-executions 1

### 2. Run coordinator (executes via handleOps)
npm run coordinator:sepolia

### 3. Start the stack
npm run dev:server
npm run dev:web

Then open http://127.0.0.1:3000 and walk through: Overview → ERC-4337 panel → Intents (smart wallets) → Run Coordinator button → Batches (click handleOps ↗ to expand UserOp hashes).
