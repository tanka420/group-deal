# Deployment status and domain roles

Last checked: **5 November 2026**. This is a public summary, not an instruction to deploy or open a website.

| Domain | Intended role | Observed website |
| --- | --- | --- |
| [testnet.groupdeal.tech](https://testnet.groupdeal.tech/) | GroupDeal Testnet application | Application page returned HTTP 200 |
| [groupdeal.tech](https://groupdeal.tech/) | GroupDeal Mainnet application | Construction notice returned HTTP 503 |

The public application routing reports Arc Testnet (5042002). This routing observation does not describe the separate Mainnet development/runtime: the [Mainnet branch checklist](https://github.com/tanka420/group-deal/blob/codex/mainnet/docs/mainnet-checklist.md) records V2 contract/Safe deployment and isolated internal VPS activation as of 3 November 2026. Public Mainnet cutover and application acceptance remain open. See [branch roles](branches.md).

## Environment separation remains open

At the last configuration inspection, both virtual hosts referenced the same static application root and backend upstream. Both `/api/health` responses reported the Testnet chain ID. The apex construction gate closes website routes; it does not block the API or create a separate Mainnet runtime.

The intended next step is to separate asset roots, API routing, origins and release configuration, then verify the existing internal Mainnet runtime and its data/credential boundaries before public cutover. The [roadmap](../ROADMAP.md) tracks this work. Do not describe the hostnames as fully isolated deployments.

`groupdeal.tech` must retain its construction page until the maintainer explicitly requests reopening. Installing a frontend artifact does not authorize removing the page.

## Recorded Testnet application release

| Component | Source | Scope |
| --- | --- | --- |
| Frontend | `a70f6a94576e52b9e8b29404b9e2fb4ee3ff0274` | Contact page and footer credit, direct Circle email login, and cancellation of pending admin login when leaving administration |
| Backend | `8c32212fdb051cdb01f98226932f3a61afa3e9bf` | Existing backend retained during the frontend update |

The frontend source passed [full CI, run 41980221849](https://github.com/tanka420/group-deal/actions/runs/41980221849): 78 executed steps, all PASS with zero exit codes and complete scope. A separately prepared configured artifact was installed and all 192 file hashes checked. The fixture CI build and configured public build are not claimed to have identical bytes.

Public checks verified the contact route, support footer link, email address, credit and login dialog in English and Vietnamese at mobile and desktop widths, plus the apex notice and backend health. Live Circle initialization reached ready without requesting an OTP. Local artifact browser checks used defined fixture scopes; live OTP and authenticated journeys were not performed. Independent security acceptance remains separate work. Private receipts, artifact inventories and backup paths are intentionally not published.

Documentation may be newer than either running component. Use component release records rather than treating the repository's latest commit as the deployed backend version.
