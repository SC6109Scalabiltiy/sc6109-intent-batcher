# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep changes consistent with the patterns described here; if a change requires deviating from them, call it out.

## Project

**SC6109 Intent Batcher — Shape A** with full ERC-4337 account abstraction.

Each simulated agent owns an `AgentSmartWallet` (ERC-4337 `IAccount`) deployed via a CREATE2 factory. A trusted coordinator script acts as its own bundler: it builds one UserOperation per due DCA intent and submits them in a single `EntryPoint.handleOps(...)` call. A `VerifyingPaymaster` sponsors gas so agent wallets never need ETH.

The benchmark compares one-UserOp-per-intent (naive) versus many UserOps in one `handleOps` (batched). The thesis is that batching reduces per-intent gas by amortizing transaction overhead.

See `docs/architecture.md` and `docs/design-decisions.md` for the full rationale.

## Tech stack

- **Contracts**: Solidity 0.8.28, Foundry (forge), OpenZeppelin, eth-infinitism `account-abstraction` (v0.6 EntryPoint).
- **Off-chain**: TypeScript, `ethers` v6, `tsx` runner.
- **API**: Fastify + Zod (`server/`).
- **UI**: Next.js 15 App Router, React 19, Tailwind (`web/`).
- **Workspaces**: npm workspaces — `server` and `web` are workspace packages, the root holds Solidity + scripts.

## Commands

Run from repo root unless noted.

```bash
npm run compile         # forge build  (run before tsx scripts — they load artifacts from out/)
npm test                # forge test -vv  (Foundry unit tests, 22 tests)
npm run gas             # forge test --gas-report
npm run typecheck       # tsc --noEmit at root + server + web
npm run test:server     # Fastify route tests
npm run build:web       # Next.js production build
npm run dev:server      # Fastify on :4000
npm run dev:web         # Next.js on :3000

# Sepolia (requires .env.local with DEPLOYER_PRIVATE_KEY + SEPOLIA_RPC_URL)
npm run deploy:sepolia:no-verify
npm run seed:sepolia -- --agents 3 --interval 60 --max-executions 1
npm run coordinator:sepolia
npm run benchmark:sepolia
```

There is no local Anvil flow wired up — TypeScript scripts target `sepolia` only. Foundry tests run fully offline.

## Layout

```
src/AgentRegistry.sol           Agent identity + active flag. Supports registerAgentFor for coordinator-driven onboarding.
src/MockToken.sol               Mintable ERC-20 stand-in for USDC/WETH.
src/BatchDcaSettlement.sol      Recurring intents. executeIntent (agent wallet) + executeBatch (coordinator-only).
src/accounts/AgentSmartWallet.sol    ERC-4337 IAccount. ECDSA owner, execute, executeBatch.
src/accounts/AgentAccountFactory.sol CREATE2 deterministic deployer.
src/paymaster/VerifyingPaymaster.sol Coordinator-signed gas sponsorship.

script/Deploy.s.sol             Forge deploy: registry, mocks, settlement, factory, paymaster. Writes deployments/<network>.json.

scripts/seed.ts                 Per-agent: deploy wallet, register, mint USDC, send approve+createRecurringIntent UserOp.
scripts/coordinator.ts          Build one UserOp per due intent, submit single handleOps, save metrics + userOpHashes[].
scripts/benchmark.ts            Naive vs batched gas comparison.

lib/env.ts                      Load ../.env.local and ./.env.local, parse argv.
lib/runtime.ts                  ethers provider + deployer wallet; deterministicAgentWallet from keccak256("sc6109-shape-a-agent-{i}").
lib/contracts.ts                Attach ethers contracts from Foundry out/ artifacts.
lib/deployments.ts              Read/write deployments/<network>.json + <network>-intents.json.
lib/userop.ts                   Build, hash, sign UserOperations. Encode paymasterAndData.
lib/format.ts, lib/paths.ts     Helpers.

server/src/app.ts               Fastify routes (see README "Dashboard API").
server/src/services/*.ts        intents, metrics, network, paymaster, scripts (shells out to tsx scripts).
server/src/app.test.ts          Route tests.

web/app/{page,intents,batches,benchmark}/    App Router pages.
web/components/                              KPI grid, intent table, batch table, benchmark chart, shell.
web/lib/{api,format,types,use-api}.ts        Typed API client + SWR-ish hooks.

deployments/sepolia.json          Current contract addresses (written by Deploy.s.sol).
deployments/sepolia-intents.json  Seeded intent records (written by seed.ts; includes smartWalletAddress).
metrics/sepolia-coordinator-*.json
metrics/sepolia-benchmark-*.{json,csv}
```

`docs/file-map.md` predates the ERC-4337 work and is partly stale (it refers to a flat naive design without smart wallets). Treat `src/`, `scripts/`, `lib/`, and this file as the source of truth.

## Conventions

- **ESM TypeScript everywhere.** Root `package.json` has `"type": "module"`. Local imports must use the `.js` extension (e.g. `import { ... } from "../lib/userop.js"`) even though source files are `.ts` — `tsx` and Node ESM both require it.
- **ethers v6** API (`Interface`, `getBytes`, `parseEther`, BigInt literals like `500_000n`). No v5 helpers.
- **bigint for on-chain amounts.** Never coerce to `number`. Use literal `n` suffix for constants.
- **No mocking of contracts in scripts.** They interact with deployed addresses from `deployments/<network>.json`. Tests use Foundry, not ethers.
- **Coordinator owns gas tuning.** `seed.ts` and `coordinator.ts` define explicit `callGasLimit / verificationGasLimit / preVerificationGas` constants; prefer adjusting those constants over calling `estimateUserOperationGas` on testnet.
- **No Hardhat.** Only Foundry for contracts and `tsx` for scripts.
- **Solidity style**: 4-space indent, 100-char line length (foundry.toml `[fmt]`). Solidity 0.8.28, optimizer 200 runs.
- **CommonJS-style require, console.log, or top-level await for side effects** — avoid. Scripts have an `async function main()` and end with `main().catch(...)`.
- **No new markdown docs unless asked.** Don't create planning/summary docs as a side effect of a task.

## Editing rules of thumb

- Touching a contract? Re-run `npm run compile` before any tsx script — scripts load fresh ABIs from `out/`.
- Touching `lib/userop.ts` paymaster encoding? Mirror the change in `VerifyingPaymaster.sol`'s `parsePaymasterAndData` — the byte layout has to match.
- Changing intent struct in `BatchDcaSettlement.sol`? Update `scripts/seed.ts`, `scripts/coordinator.ts`, `server/src/services/intents.ts`, and `web/lib/types.ts`.
- Adding a server route? Add a zod schema, return a typed DTO from `server/src/types.ts`, and add a `web/lib/api.ts` client function.
- Web changes: run `npm run build:web` before declaring done — Next.js type errors only surface at build time. For real UI verification, start `dev:server` then `dev:web` and click through the pages mentioned in the README's Step 3 table.

## ERC-4337 specifics

- **EntryPoint**: canonical v0.6 at `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` (hardcoded in README's paymaster maintenance commands).
- **Paymaster stake** (one-time, `addStake(86400)` with 0.01 ETH) is separate from **paymaster deposit** (refilled via `depositTo(...)`, consumed by gas). Stake is never consumed. The dashboard's Overview card watches deposit balance.
- **Sender-is-not-deployed flow**: `seed.ts` includes `initCode` (factory address + `createAccount` calldata) on the first UserOp per wallet. Subsequent UserOps from the same wallet use empty `initCode`.
- **Nonces** are read from `EntryPoint.getNonce(sender, key=0)`. Don't track them client-side across runs.
- **Paymaster signature** is over `(userOpHashWithoutPaymasterSig, validUntil, validAfter)` — see `getPaymasterHash` in `lib/userop.ts` and the matching hash in `VerifyingPaymaster.sol`.

## What's intentionally out of scope

Real DEX routing, signed intents, permissionless solvers, cross-chain settlement, real LLM agents, private intent submission. Output pricing in `BatchDcaSettlement` is fixed so Sepolia runs are reproducible without external liquidity. Don't add these unless explicitly asked.
