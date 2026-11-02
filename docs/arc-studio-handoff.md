# GroupDeal: contract deployment and Arc Studio preview first

**Historical handoff, superseded on 2 November 2026.** The user now wants sequential production readiness. Follow the current order at the top of `docs/mainnet-checklist.md`. Do not treat the constructor-only plan or this Studio prompt as the current deployment priority or permission to publish/deploy.

Updated 2 November 2026 (Vietnam time). This phase prepares the V2 contract deployment and a shareable app preview. Production backend, Circle server credentials, role separation, Safe, database and VPS/domain activation follow later.

## Source for Arc Studio

- Repository: `https://github.com/tanka420/group-deal`
- Branch: `codex/mainnet` (select it explicitly; do not import the default Testnet branch).
- Frontend: `frontend/`; shared inputs: `shared/`. Keep the repository root available because frontend imports shared modules using relative paths.
- Install frontend dependencies: `npm ci --prefix frontend`.
- Start preview: `npm --prefix frontend run dev -- --host 0.0.0.0` (port 5174).
- Frontend build: `npm --prefix frontend run build`; output `frontend/dist/`.
- Network target: Arc Mainnet, chain 5042, RPC `https://rpc.mainnet.arc.io`.
- Public Circle/Reown IDs: `shared/mainnet-public.json`. API keys, signing keys, OTPs, real databases and production sessions are not part of the handoff.

The frontend calls a backend `/api` on the same origin. A frontend-only import is not the complete application: catalog/order/account/login APIs need a suitable backend. The existing Mainnet backend correctly rejects the undeployed manifest. For the first preview, keep transaction controls disabled; if needed, use a separate preview-only backend with explicit demo content and no production secrets, without changing production guards or inventing real onchain state.

## Prompt for Studio

```text
Import https://github.com/tanka420/group-deal, branch codex/mainnet, and retain the existing GroupDeal UI and Vietnamese copy. Read docs/arc-studio-handoff.md and the current code first.

Goal now: a working shareable preview. Keep frontend/ and shared/ together, install from the frontend lockfile, and start Vite on 0.0.0.0:5174. Do not rebuild the product from scratch or switch to the default branch.

This is a Mainnet-targeted preview, not a live financial release. The contract is GroupDealHubV2 on chain 5042. Obtain any actual deployed address from us; do not invent an address or substitute the historical Testnet contract. Keep payment/signing controls blocked until a verified deployment is configured. If a preview backend or demo data is necessary, make it preview-only and label demo content clearly. Do not weaken production guards or use Testnet APIs/credentials as a Mainnet backend.

Do not deploy contracts, broadcast transactions, create wallets/API keys, enable gas sponsorship, change billing, deploy to our VPS, or change groupdeal.tech. Public provider IDs are already in shared/mainnet-public.json; do not request private keys or production API keys in chat.

Preserve the simplified login popup and its security footer, signed-out Orders/Wallet/Account views, light grid background, homepage banner, USDC receive/send design and the bridge link https://bridge.usdc.com/. Mainnet swap remains deferred.

When the preview works, provide its share URL and state what remains unavailable. Do not describe the preview as a live Mainnet deployment. Any GitHub changes should be proposed separately from codex/mainnet; do not push automatically into the source branch.
```

## V2 contract-only deployment

The user provided these constructor assignments:

| Role | Initial address |
|---|---|
| Deployer / owner / authorization signer / operator | `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead` |
| Security authority | `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c` |
| USDC | `0x3600000000000000000000000000000000000000` |

These satisfy the constructor requirement that security authority differs from operator. No Solidity change is required. `config/mainnet-contract-deployment.json` records the initial assignments separately from the production runtime manifest. The second address is not presented as a verified Safe. The application guard still requires separate production roles and a verified multisig before activation. Constructor assignment does not require copying the owner's private key onto the backend.

Run `npm run prepare:mainnet` to generate the compiled V2 bytecode, ABI, constructor arguments and encoded unsigned creation data bound to the source fingerprint. The offline package does not sign, broadcast, select a nonce, approve a budget, or activate services. Read-only RPC checks/estimates are separate; use a fresh quote and let the user sign the exact deployment from their wallet.

## What Arc Studio provides

[Arc Studio](https://studio.arc.io/) describes GitHub import, existing-contract integration and a live preview. Its [terms](https://studio.arc.io/terms-of-use) state it does not provide application hosting or broadcast Mainnet transactions on the user's behalf. A Studio project/share or sandbox preview link is distinct from permanent production hosting and from the actual Mainnet contract receipt. Verify the share link's access and availability in the UI before promising it to recipients.
