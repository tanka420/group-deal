# GroupDeal roadmap

[English introduction](README.md) · [Giới thiệu tiếng Việt](README.vi.md)

GroupDeal is a personal project developing group buying for digital goods with USDC settlement on Arc. The default branch develops Testnet; codex/mainnet develops Mainnet in a separate worktree. The immediate goals are a verifiable Testnet experience, a small pilot and completion of public Mainnet readiness. See [branch roles](docs/branches.md).

This roadmap describes outcomes rather than promised dates. Priorities may change with testing and feedback. **Implemented** means code exists; **in progress** means validation or implementation remains; **planned** means a future milestone. Implemented features are not automatically independently audited or accepted through a complete live journey.

## 1. Core product — implemented, validation continuing

- [x] Buyer discovery and deal pages with products, group price tiers, terms and deadlines.
- [x] USDC commitment, campaign settlement, allocations and pull-claim contract logic.
- [x] Buyer orders and wallet views; seller and operator workspaces.
- [x] Digital delivery, order discussion and dispute workflows.
- [x] Circle wallet access and external-wallet integration through Reown.
- [x] Public read APIs, a TypeScript SDK and signed-webhook integration code.
- [x] English/Vietnamese UI and responsive layouts.
- [x] Reproducible contract, model, API, SDK, integration, build and browser checks.

Evidence lives in source, tests and revision-specific CI. Some integration and recovery cases still need live validation; checked items describe implementation, not blanket production acceptance.

## 2. Testnet completion — in progress

- [ ] Validate complete buyer and seller journeys on the current Testnet release, including the wallet and delivery paths actually used.
- [ ] Finish review of error, retry and recovery cases; keep deferred cases explicitly recorded.
- [ ] Separate Mainnet/Testnet asset roots, API routing, origins and release configuration. Verify the existing isolated Mainnet runtime and its data/credential boundaries before public cutover.
- [ ] Finish sanitized environment examples and a reproducible configured local-application guide.
- [ ] Triage dependency advisories and review paths affected by compatible updates.
- [ ] Improve accessibility and measure desktop/mobile performance.

**Exit:** repeatable Testnet journeys, documented limits, clear environment boundaries and a straightforward way for another person to review the product.

## 3. Small pilot — planned

- [ ] Recruit a small number of digital-product sellers and buyers.
- [ ] Confirm distribution rights, product terms and practical fulfillment for pilot products.
- [ ] Collect feedback about deal clarity, wallet onboarding, delivery and support.
- [ ] Record actual pilot outcomes separately from illustrative design data.
- [ ] Use findings to prioritize the next iteration.

**Exit:** evidence that participants can complete the intended workflow, with identified problems and follow-up work. A pilot is not counted as completed until it takes place.

## 4. Mainnet readiness — in progress, public launch pending

- [x] Maintain Mainnet development separately on codex/mainnet in the existing Mainnet worktree.
- [x] Record the V2 contract/Safe deployment and isolated internal application activation in the [Mainnet checklist](https://github.com/tanka420/group-deal/blob/codex/mainnet/docs/mainnet-checklist.md). These are the recorded Mainnet-branch milestones, not a new live verification by this documentation update.

- [ ] Obtain independent contract/application security review and address findings.
- [ ] Review signer/admin permissions, financial invariants, dispute authority and operational controls for the intended Mainnet deployment.
- [ ] Establish release, monitoring, backup and recovery readiness appropriate to real funds.
- [ ] Verify a separate Mainnet configuration, deployment references and user-facing disclosures.
- [ ] Make an explicit launch decision after reviewing those conditions.

**Exit:** a deliberate, documented Mainnet release decision. `groupdeal.tech` remains a construction page until the maintainer explicitly requests reopening. A domain name or successful CI run does not constitute launch approval.

## 5. Seller tooling and ecosystem examples — planned

- [ ] Turn the existing SDK and webhook receiver into concise, repeatable integration walkthroughs.
- [ ] Improve product import and fulfillment tools using pilot feedback.
- [ ] Document reusable patterns for USDC group pricing, delivery verification and transaction recovery.
- [ ] Share useful examples with the Arc developer ecosystem as they become stable.

Ideas and integration feedback are welcome through [Issues](https://github.com/tanka420/group-deal/issues).
