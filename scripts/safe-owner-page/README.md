# Safe owner control page

This is a static operations page, separate from GroupDeal login and the application bundle. Each actual holder connects their own EIP-1193 wallet, reviews the exact owner-specific EIP-191 message, explicitly clicks Sign, then copies the verified JSON into the chat. A browser extension or an injected provider in the wallet's in-app browser is required. No WalletConnect session, account login, credential, seed, private key, transaction or approval is requested.

The page retains only one result in memory. It never POSTs a signature, uses browser storage or creates an authenticated application session. The only wallet methods are `eth_requestAccounts`, `eth_accounts`, and `personal_sign`. The public RPC allowlist is read-only. Before prompting and after receiving a signature it checks the current Safe owners, threshold, nonce, version, code hash, modules, Hub authority and canonical challenge block. Expiry, account/context changes, cancellation, unknown outcomes and invalid signatures cannot produce an accepted result. A control signature does not establish separate human custody; that evidence is assessed separately.

Prepare from the existing verified challenge, without silently renewing it:

```
node scripts/prepare_safe_owner_page.cjs <challenge.json> <exact-digest> <new-output-directory>
node scripts/prepare_safe_owner_page.test.cjs <output-directory>
```

The preparation uses installed, locked dependencies only and emits four static public files plus an adjacent build record. The original challenge messages must remain byte-identical. Tests use generated in-memory fixture keys, mocked public RPC and an isolated Chrome profile; they never access a user's wallet or the application DB. An additional test selection `new-only` executes just the post-sign authority/copy cases added after the initial nine cases passed.

Publish only the reviewed four files to `/safe-owner-control/` after checking the current source/runtime and hashes. Preserve all existing main application assets, Nginx, service, DB, backup and held jobs. The page's own files are a separate public artifact inventory; they are not an application runtime upgrade or a whole-project acceptance. Recheck actual authority and challenge validity before verifying received signatures. An expired page must stay blocked until a new, explicitly prepared context is reviewed.
