# Development and testing

Run commands from the repository root. Use Node.js 24; the current [CI workflow](../.github/workflows/local-candidate.yml) pins Node 24.21.0 and npm 11.6.2. Workspaces have separate lockfiles; there is no root dependency-install step.

## Read-only interface preview

```sh
git clone https://github.com/tanka420/group-deal.git
cd group-deal
npm ci --prefix frontend
npm run preview:testnet-design
```

Open **http://127.0.0.1:5178/**. Port 5178 must be free; the preview refuses to replace another process. Stop it with Ctrl+C.

This serves the real interface with sample catalog responses and an explicit illustrative-content banner. It uses no backend or runtime database and rejects non-read methods. Authentication, checkout, claims and account workspaces require a configured application; they are not simulated successful transactions here. Sample products, balances and participation counts are not live activity.

No `.env` file is needed. Keep live credentials out of a development preview. [Screenshot provenance](images/README.md) records the public captures.

## Install the verification workspaces

```sh
npm ci --prefix contracts
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix sdk
npm ci --prefix integrations/cloudflare-receiver
```

Install the fixture browser:

```sh
cd frontend
npx --no-install playwright install chromium
cd ..
```

On Linux, CI uses `playwright install --with-deps chromium` to install system dependencies. On Windows, the Playwright configuration prefers Google Chrome at its standard installation path, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when supplied.

## Inspect or run checks

List steps without executing them:

```sh
npm run verify:pipeline -- --list
```

Run the full verification pipeline:

```sh
npm run verify:pipeline
```

This covers contract compilation/models, backend/API behavior, SDK consumers, receiver integration, frontend builds and browser fixtures. The runner creates temporary fixture credentials and records results under ignored `.cache/` paths. It does not deploy contracts, reset or seed the operating database, or establish a live user journey. Node-side fixtures have a network guard; browser fixtures have their own declared wallet/provider/RPC behavior.

Loopback servers include ports 4173, 4180 and configured-wallet modes in the 4203–4206 range. Leave requested ports free. The browser runner refuses occupied ports and stops only its own child processes.

Run a relevant subset while iterating:

```sh
npm run verify:pipeline -- --only=backend,sdk
npm run test:browser -- --port=4178 -- --workers=1 transaction_history_locale.spec.ts
```

Separate browser-runner options from Playwright flags with `--`, as above. A selected subset is not full CI. Read `result`, the actual steps and exit codes, and `completeScope`; the scope flag alone does not mean checks passed.

Useful focused checks after workspace installation:

```sh
npm --prefix frontend run typecheck
npm --prefix backend run typecheck
node scripts/scan_candidate_secrets.cjs
```

## Mainnet development

This guide describes the default/Testnet checkout. Mainnet work belongs to **codex/mainnet**, with its own manifests and commands. The maintainer already has the worktree **E:/apps/group-deal-mainnet**. Follow that checkout's AGENTS.md and [Mainnet checklist](https://github.com/tanka420/group-deal/blob/codex/mainnet/docs/mainnet-checklist.md) before working there; its setup is not interchangeable with this Testnet preview. See [branch roles](branches.md).

## Configured application development

The preview and automated fixtures are the reproducible entry points from a clean clone. A complete application also needs network/deployment bindings, provider credentials and an appropriate isolated database. Sanitized environment examples and a standalone setup guide remain a [roadmap item](../ROADMAP.md).

`npm run start:testnet` is a guarded operational launcher requiring prepared private artifacts and recovery evidence. It is not a clean-clone quickstart. Date-stamped reports may reference private local paths; do not copy a live environment file or database to satisfy those paths.

## Working on the project

Keep changes focused and describe their effect and verification. Discuss substantial contract, wallet or accounting changes before implementation. Exclude credentials, session tokens, private customer content, databases, browser traces and runtime backups from public commits/issues.

The root [AGENTS.md](../AGENTS.md) describes the maintainer's checkout and historical baseline. Its fixed Windows path and VPS comparison are not requirements for someone else's clone.

Releases identify the exact checked commit and configured artifact. Frontend and backend may be released separately; documentation changes do not deploy either. See [deployment status](deployment-status.md) for domain roles and remaining separation work.
