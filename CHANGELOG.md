# Changelog

Selected product and documentation changes. This starts with the current milestone, not a reconstruction of every historical release. Repository documentation changes do not automatically deploy the application.

## Unreleased

### Interface fixes

- Keep mobile order scrolling stable when browser chrome changes the viewport height; retain explicit keyboard focus visibility.
- Position native dialogs in the current viewport and preserve the page offset when closing them.
- Keep the close button sticky on short screens and return wallet Send/Receive focus to its trigger.

### Documentation

- Retire old prototype/candidate/baseline branches; retain only the default Testnet branch and the existing Mainnet development branch.

- Introduce GroupDeal as a personal project with USDC group buying on Arc.
- Add English/Vietnamese introductions, a milestone roadmap, architecture and development guides.
- Document the two maintained development branches, their existing worktrees, recorded Mainnet internal progress and the open public-routing separation task.
- Add actual UI screenshots with illustrative-data provenance.
- Add the canonical MIT license, bundled-material notices and security reporting guidance.

## 2026-11-04 — Testnet interface milestone

- Refine buyer discovery: full-image homepage banner, buying steps, benefits, category tabs and deal cards.
- Keep inline and sticky purchase actions on mobile deal detail, and reset scroll between pages.
- Use the supplied JPEG homepage artwork with HTML text overlay.
- Share Be Vietnam Pro typography, controls and tokens across buyer, seller and operator UI; preserve sidebar workspaces.
- Correct narrow wallet-review wrapping without changing wallet behavior.
- Enable the construction notice on `groupdeal.tech`; keep `testnet.groupdeal.tech` as the testing application domain.

Frontend source: `1edb3df`; [full CI](https://github.com/tanka420/group-deal/actions/runs/41795933334). Backend remained `8c32212`. See [deployment scope and limits](docs/deployment-status.md).
