# SC6109 Intent Batcher

Shape A implementation for **Intent Batcher for Scheduled Agents** with full ERC-4337 account abstraction.

Each agent owns an ERC-4337 smart wallet. The coordinator builds UserOperations and submits them via `EntryPoint.handleOps`. A `VerifyingPaymaster` sponsors gas so agents need zero ETH.

## Components

### Smart Contracts (`src/`)

- `AgentRegistry.sol` — registers agent identities; supports `registerAgentFor` so the coordinator can register smart wallets as owners.
- `MockToken.sol` — mock USDC/WETH for testnet.
- `BatchDcaSettlement.sol` — stores recurring DCA intents. `executeIntent` is callable by the agent's smart wallet; `executeBatch` remains coordinator-only.
- `accounts/AgentSmartWallet.sol` — ERC-4337 `IAccount`. ECDSA owner validation, `execute`, and `executeBatch`.
- `accounts/AgentAccountFactory.sol` — CREATE2 factory for deterministic wallet deployment.
- `paymaster/VerifyingPaymaster.sol` — coordinator signs each UserOp so agents pay no gas.

### Scripts (`scripts/`)

- `seed.ts` — deploys smart wallets, registers agents, mints USDC, submits approve + createIntent UserOps via `handleOps`.
- `coordinator.ts` — finds due intents, builds one UserOp per intent, submits all via a single `handleOps` call. Saves metrics including UserOp hashes.
- `benchmark.ts` — compares naive vs batched gas cost.

### Tests (`test/`)

- `BatchDcaSettlement.t.sol` — auth, scheduling, cancellation, batch execution, gas comparison.
- `AgentSmartWallet.t.sol` — factory determinism, signature validation, paymaster sponsorship, full DCA integration.

## Setup

```bash
git submodule update --init --recursive
npm install
npm run compile
npm test
npm run typecheck
```

## Sepolia Deployment (first time only)

### 1. Configure env

```bash
cp .env.example .env.local
# Fill in DEPLOYER_PRIVATE_KEY and SEPOLIA_RPC_URL
```

Ensure the deployer key holds at least **0.2 ETH** on Sepolia:

| Item | Amount |
|------|--------|
| Paymaster deposit (auto at deploy) | 0.10 ETH |
| Paymaster stake (manual, one-time) | 0.01 ETH |
| Deploy + coordinator gas | ~0.05 ETH |

### 2. Deploy contracts

```bash
npm run deploy:sepolia:no-verify
```

Deploys AgentRegistry, MockTokens, BatchDcaSettlement, AgentAccountFactory, and VerifyingPaymaster. Funds the paymaster's gas deposit. Writes all addresses to `deployments/sepolia.json`.

Use `npm run deploy:sepolia` when Etherscan verification is needed.

### 3. Stake the paymaster (one-time)

```bash
PAYMASTER=$(cat deployments/sepolia.json | jq -r '.VerifyingPaymaster')
cast send $PAYMASTER "addStake(uint32)" 86400 \
  --value 0.01ether \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

This only needs to be done once. The stake is never consumed by UserOps.

## Demo: End-to-End ERC-4337 Flow

### Step 1 — Seed smart-wallet agents

```bash
npm run seed:sepolia -- --agents 3 --interval 60 --max-executions 1
```

For each agent this:
- Deploys a deterministic `AgentSmartWallet` via `AgentAccountFactory`
- Registers the agent in `AgentRegistry` with the smart wallet as owner
- Mints mock USDC to the smart wallet
- Submits a UserOp (approve + createRecurringIntent) — **paymaster covers the gas**

Check `deployments/sepolia-intents.json` — each record will have a `smartWalletAddress` field.

### Step 2 — Run the coordinator

```bash
npm run coordinator:sepolia
```

Finds due intents, builds a `UserOperation` per intent calling `executeIntent` from the agent's smart wallet, and submits all ops in one `EntryPoint.handleOps` call.

Check `metrics/sepolia-coordinator-*.json` for the tx hash and `userOpHashes[]`.

### Step 3 — Start the dashboard

```bash
npm run dev:server   # Fastify API on http://127.0.0.1:4000
npm run dev:web      # Next.js dashboard on http://127.0.0.1:3000
```

Open `http://127.0.0.1:3000` and walk through:

| Page | What to show |
|------|-------------|
| **Overview** | Paymaster Deposit KPI card (live from chain); ERC-4337 info panel with EntryPoint + Paymaster addresses |
| **Intents** | Smart Wallet column — each agent has its own `4337`-badged account address |
| **Overview → Run Coordinator** | Hit the button to execute a live batch via `handleOps` |
| **Batches** | `handleOps ↗` badge on ERC-4337 runs; click to expand EntryPoint, Paymaster, and individual UserOp hashes |

### Maintaining the paymaster deposit

The stake is permanent. The deposit is consumed by gas and needs occasional top-up:

```bash
# Check current deposit
cast call 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 \
  "balanceOf(address)(uint256)" \
  $(cat deployments/sepolia.json | jq -r '.VerifyingPaymaster') \
  --rpc-url $SEPOLIA_RPC_URL

# Top up
PAYMASTER=$(cat deployments/sepolia.json | jq -r '.VerifyingPaymaster')
cast send 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 \
  "depositTo(address)" $PAYMASTER \
  --value 0.05ether \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

The dashboard shows the live deposit balance on the Overview page — it turns red below 0.01 ETH.

## Dashboard API

- `GET /api/health`
- `GET /api/deployment?network=sepolia`
- `GET /api/intents?network=sepolia`
- `GET /api/batches?network=sepolia&limit=20`
- `GET /api/metrics/latest?network=sepolia`
- `GET /api/metrics/curve?network=sepolia`
- `GET /api/paymaster/balance?network=sepolia`
- `POST /api/coordinator/run`
- `POST /api/admin/run-baseline`
- `POST /api/admin/run-sweep`

## Local development (no Sepolia)

```bash
npm test              # Foundry unit tests (22 tests, no network)
npm run gas           # Gas report
npm run test:server   # Server unit tests
npm run build:web     # Next.js production build
```

## Design notes

- Agents are simulated accounts, not real LLMs. Each gets a deterministic EOA owner derived from `keccak256("sc6109-shape-a-agent-{i}")`.
- The coordinator acts as its own bundler — no external bundler service needed.
- Output pricing is fixed to keep Sepolia runs reproducible without external DEX liquidity.
- Real DEX routing, signed intents, and permissionless solvers are future extensions.
