# MediChain

A local healthcare record-sharing DApp with Patient, Doctor, Hospital and Administrator roles. Files are encrypted with AES-256-GCM before upload to real Kubo IPFS. A Solidity contract records ownership, provider approvals, record-level permissions and audit events.

## Requirements

- Windows 10/11, 64-bit, with PowerShell 5.1 or newer.
- Chrome or Edge with MetaMask for wallet interactions.
- Internet access during the initial installation of free dependencies.

No paid service, cloud account or real ETH is required. This repository contains application source and reproducible setup scripts. Node.js, Kubo, dependencies and runtime state are installed or generated locally.

## Install and run

Clone this repository, open PowerShell, and change into its directory using `Set-Location -LiteralPath 'YOUR-CLONE-PATH'`.

First-time setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
```

Start:

```powershell
$env:Path = "$((Resolve-Path -LiteralPath '.\tools\node').Path);$env:Path"
.\tools\node\npm.cmd run dev
```

Open http://127.0.0.1:5173 in the browser containing MetaMask. The startup script starts Kubo, starts Hardhat, deploys a contract and generates its frontend configuration. Run it once per demonstration: running it again deploys a new contract.

## Wallet setup

Use the application's Switch network button, or configure:

| Setting | Value |
|---|---|
| Network | Hardhat Local |
| RPC | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency | ETH |

Import the following standard, publicly known Hardhat development keys. They are test fixtures; never use these accounts on public networks or with real assets.

| Role | Private key |
|---|---|
| Administrator | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Patient | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Doctor | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Hospital | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |

The deployer is automatically Administrator. Select each other account to register its role. Approve the Doctor and Hospital from the Administrator account. From Patient, upload a fictional text or PDF file and grant a provider access using their wallet address. Switch to the provider to use Audit & decrypt. Return to Patient to revoke permission.

Keep the same browser profile: its encrypted application key vault is required to decrypt records. Local Hardhat chain state is temporary.

## Benchmarks

With the application running:

```powershell
.\tools\node\npm.cmd run benchmark
```

The suite writes fresh measurements and charts to `results/` and updates the Metrics page's data. Refresh the browser to view the new values. The checked-in `frontend/src/generated/performance.json` is the prior measured dataset required by the current frontend; its timestamp is displayed in Metrics. It is not a live monitor of browser interactions.

Gas is measured from local receipts, ETH cost is simulated, CPU and memory describe the benchmark process, and throughput measures local RPC reads. Transaction benchmarks use synthetic metadata; file-transfer benchmarks use real encrypted bytes and Kubo CIDs.

## Stop and reset

Stop this project's services:

```powershell
.\tools\node\npm.cmd run stop
```

Fresh demonstration (deletes local IPFS data and generated deployment configuration):

```powershell
.\tools\node\npm.cmd run reset
.\tools\node\npm.cmd run setup
.\tools\node\npm.cmd run dev
```

Setup after reset is required to recreate the IPFS repository.

## Security boundaries

- Solidity enforces approval, ownership and current permissions.
- Recipient-specific P-256 ECDH/HKDF envelopes protect file keys.
- Blockchain metadata is visible; encrypted content supplies confidentiality.
- Revocation prevents future DApp access but cannot erase plaintext already copied.
- Access events cover signed DApp-mediated accesses, not arbitrary IPFS retrieval.
- This is an academic prototype with browser-local key storage and one local IPFS node.

## Source layout

`contracts/` contains Solidity, `frontend/` the React client, `scripts/` installation and service tools, and `benchmarks/` measurement tooling. Lockfiles pin dependencies. Reports, videos, assignment documents, development notes, test suites, machine runtimes and runtime data are excluded from this source-only publication.
