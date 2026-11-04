# GroupDeal Testnet

<!-- impeccable:product-schema 1 -->

## Platform

web

## Purpose and users

GroupDeal lets buyers buy digital goods together using USDC, review pinned licenses and group price tiers, then track delivery and allocated rebates/refunds. Sellers manage products, campaigns and fulfillment. Operators handle operational review. These are facts from current source, not user research.

## Approved task

The user asked to leave `codex/ui-v2` aside and use Taste and Impeccable on the actual Testnet branch, `codex/arc-candidate`. The two directions were presented with the same illustrative content. On 3 November 2026 the user selected A, the product-led gallery. Implement it in the real Home, Explore and deal-detail screens, with a consistent shared buyer shell. On 4 November the user extended the shared visual language to seller and admin, retaining their full-width operational layouts and existing behavior, and supplied `image/banner home.jpg` as the replacement homepage artwork.

Taste leads composition and visual direction. Impeccable verifies hierarchy, usability, consistency and implementation quality. The previous UI-UX skill and UI V2 design are not the visual authority for this task.

## Constraints

- Existing React/TypeScript/Vite/plain CSS stack and current APIs.
- Preserve wallet, authorization, accounting, pricing, rights, delivery and transaction recovery behavior.
- Vietnamese and English; English on a first visit, while respecting a saved language choice; desktop and mobile.
- Arc Testnet and test-token disclosures remain explicit.
- Static background; no continuously moving grid or tiled perspective image.
- `testnet.groupdeal.tech` is the Testnet application domain. `groupdeal.tech` is the Mainnet domain and is temporarily gated by the standalone maintenance notice requested on 4 November. Keep the Mainnet website closed until the user explicitly requests reopening; this does not close the Testnet website. Hosting isolation remains open as recorded in `docs/deployment-status.md`. Application releases require checks for the exact commit. Do not alter production data.

## Evidence

Current source and its existing UI fixtures. Concept examples must be labeled illustrative, never presented as live products, users or financial proof. No supplied testimonials or business-performance claims.
