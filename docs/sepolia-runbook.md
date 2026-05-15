# Sepolia Runbook

This is the real-testnet workflow for the SC6109 Shape A MVP, **Intent Batcher for Scheduled Agents**. The GitHub context is org `SC6109Scalabiltiy` and account `atomlink-ye`.

## Architecture

- `AgentRegistry`: registers agent IDs, owners, strategy IDs, and active status.
- `MockToken`: mintable ERC-20-like mock USDC/WETH for reproducible Sepolia tests.
- `BatchDcaSettlement`: stores recurring DCA intents, checks schedule/active status/allowance/min output, and lets the trusted coordinator execute due intents singly or in a batch.
- TypeScript coordinator: loads `deployments/sepolia.json` and `deployments/sepolia-intents.json`, filters due intents, submits `executeBatch(uint256[])`, and writes metrics.

The MVP intentionally avoids ERC-4337, real DEX liquidity, cross-chain settlement, permissionless solvers, and real LLM integration.

## Environment

Use a disposable Sepolia wallet only. Put secrets in root `.env.local` or `code/.env.local`; both are gitignored.

Required:

```bash
SEPOLIA_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
```

Optional:

```bash
ETHERSCAN_API_KEY=...
AGENT_COUNT=5
INTENT_AMOUNT_USDC=10
INTENT_INTERVAL_SECONDS=3600
INTENT_DEADLINE_WINDOW_SECONDS=900
MAX_BATCH_SIZE=50
```

## Local Checks

```bash
cd code
npm install
npm run compile
npm test
npm run typecheck
```

Gas report:

```bash
npm run gas
```

## Deploy To Sepolia

Deploy without verification:

```bash
npm run deploy:sepolia:no-verify
```

Deploy with verification:

```bash
npm run deploy:sepolia
```

Deployment writes:

```text
deployments/sepolia.json
```

Current tested deployment:

```text
AgentRegistry:       0x2ca0b63FA3d2574D916F57Be1264741a14D29192
MockUSDC:            0x2A1499f86c5E1c73d5e6627daefd565006C5d70E
MockWETH:            0x366D4c45d29d443474628F48faaD15FD151689d7
BatchDcaSettlement:  0xa587ABBB1C59A20fd10B766c8FCc3768Bbf0D5D2
```

## Seed Agents And Intents

```bash
npm run seed:sepolia -- --agents 3 --amount-usdc 10 --max-executions 1
```

This registers agents, mints mock USDC to the deployer, approves settlement, creates due recurring intents, and writes:

```text
deployments/sepolia-intents.json
```

## Run Coordinator

```bash
npm run coordinator:sepolia
```

The coordinator batches currently due intents and writes metrics under `metrics/`.

Current smoke-test coordinator transaction:

```text
tx: 0x910f000f8e1e1803d6f0f725767f74df2c3b41478cbcecc5d51891bb61458c59
intents: 3
gas: 184,973
gas/intent: 61,657
```

## Run Benchmark

```bash
npm run benchmark:sepolia -- --agents 3 --amount-usdc 10
```

Current Sepolia benchmark:

```text
naive total gas: 262,686
naive gas/intent: 87,562
batch total gas: 150,773
batch gas/intent: 50,257
gas reduction: 42.6%
batch tx: 0x27d7b266731898c7d144c1cc9615a03b57b098a03aa11f1dc01d66a9b48ca353
```

Metrics are written as JSON/CSV in `metrics/`.

## Report Mapping

- Baseline: each agent intent executes as its own transaction.
- Proposed design: the coordinator executes due intent IDs in one settlement transaction.
- Scalability result: lower gas per intent and higher intents per transaction.
- Trust assumption: the MVP coordinator is trusted and chosen on-chain.
- On-chain protections: agent ownership, active status, schedule window, max executions, token allowance, and minimum output.

## Security

- Never use a mainnet wallet or long-lived personal wallet.
- Never commit `.env.local`, private keys, RPC secrets, or API keys.
- Mock tokens have no value and are only for reproducible testnet measurements.

