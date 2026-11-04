# Branches and worktrees

The repository maintains **two development branches**. The GitHub default branch is a branch setting, not a third branch named default.

| Branch | Role | Maintainer worktree |
| --- | --- | --- |
| [codex/arc-candidate](https://github.com/tanka420/group-deal/tree/codex/arc-candidate) | Default branch; Testnet application development | E:/apps/group-deal |
| [codex/mainnet](https://github.com/tanka420/group-deal/tree/codex/mainnet) | Mainnet application, contract and operational development | E:/apps/group-deal-mainnet |

The folders are Git worktrees of the same repository: they share Git history, with separate working files. These are the maintainer's existing paths, not required paths for a new clone. Mainnet development already has its own checkout; do not replace it with a copy of the Testnet folder.

## Mainnet progress and public access

The [Mainnet checklist](https://github.com/tanka420/group-deal/blob/codex/mainnet/docs/mainnet-checklist.md) at [recorded revision 3abf388](https://github.com/tanka420/group-deal/blob/3abf388ca35c4e12177ae3bef40ed0fd32d0d262/docs/mainnet-checklist.md) records Mainnet V2 contract/Safe deployment, separate Mainnet configuration and isolated internal VPS activation. Its recorded application source is 98ea809. Full application acceptance, independent review and public cutover are separate remaining work.

This is an account of the Mainnet branch's recorded progress, not a new RPC, financial or live-runtime audit performed by the documentation update. Follow that checkout's own instructions and latest checklist for further development.

| Domain | Intended role |
| --- | --- |
| testnet.groupdeal.tech | Testnet application |
| groupdeal.tech | Mainnet application; construction page until reopening is explicitly requested |

The public virtual hosts still referenced the Testnet application root/upstream at the latest inspection. That routing observation does not negate the separate internal Mainnet runtime. See [deployment status](deployment-status.md) for the evidence boundaries.

## Working across the branches

Keep network selection, deployment manifests, wallet state, data and credentials scoped to the environment being developed. Moving a feature between branches requires reviewing the source difference and running appropriate checks in the destination. A documentation update on the default branch is not a Mainnet deployment.

Historical prototype, candidate and baseline branches have been retired. Earlier reports may retain their names as historical references. The old UI V2 direction remains set aside.
