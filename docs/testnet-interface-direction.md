# Testnet interface: direction A

The user selected **A — Sản phẩm dẫn dắt / product-led gallery** on 3 November 2026 after reviewing two working directions. The work belongs to `codex/arc-candidate`; UI V2 is set aside.

## Design contract

Home introduces group buying with the supplied full banner, practical steps and user benefits before category-filtered catalog deals. Explore answers “Which product fits my needs?” with product covers, exact prices, categories, search and existing advanced filters. Deal detail answers “What do I receive, and what am I committing?” with a title, gallery, price tiers and the existing purchase review.

Use a white static surface, navy text, cobalt actions and restrained status colors. Be Vietnam Pro supports Vietnamese and English. Product images come from the catalog; unavailable images have an honest fallback. Do not invent live products, sales, testimonials or verification badges. Do not reuse the perspective-grid image or UI V2's frontend/design contract.

The current composition follows the user’s refinement: the complete banner with transparent text overlay, practical buying steps, user benefits, category tabs with All selected by default, and a three-column product grid. On phones the same information becomes one column. Keep primary product text at 14px or above; 12–13px is for supporting facts, 11px only for compact status metadata.

## Implementation boundary

The selected design is implemented in the real Home, Explore and campaign detail components plus the shared buyer shell. The main stylesheet is `frontend/src/styles/storefront.css`; `.storefront-app` scopes its tokens and component styling away from seller/operator workspaces. The previous global decorative grid is removed.

The catalog API, currency arithmetic, eligibility, authentication, wallet operations, consent, fees, checkout recovery, orders and seller/operator behavior remain the source of truth. Deal cards can disclose full license/delivery information inline. The transaction review is the existing implementation, not the prototype's illustrative dialog.

## References and previews

`design/testnet-concepts/` preserves both working directions with identical fixture content. A is the user's selected design reference, not a pixel-perfect image specification: the real interface retains additional required states and disclosures.

Run `npm run preview:testnet-design` from the repository root. The comparison is at `http://127.0.0.1:5178/design/`; the real frontend with isolated illustrative API fixtures is at `http://127.0.0.1:5178/`. This is local design evidence, not a deployed Testnet or production release. The preview does not connect a backend or runtime database.

The two skills are pinned project-local dependencies in `docs/ui-skills.json`. Taste leads composition and screenshot critique; Impeccable supplies the craft floor and quality review. Automatic hooks are not installed.

## Local verification

- TypeScript check passed before the final review corrections; the exact committed frontend build repeats TypeScript checking.
- 33 existing/extended catalog and navigation browser checks passed after corrections, including a new deterministic late-support-error focus regression. The 17 guest-checkout checks passed in the preceding run; their transaction logic is unchanged.
- All 24 combinations of three real screens, VI/EN and 320/390/768/1440px had no horizontal document overflow or page errors. Amendment order was also asserted at390/768px; the existing purchase review was captured at390/1440px without horizontal dialog overflow.
- Impeccable's source detector reported no findings before the final review correction batch. Taste's rendered check reported no FAIL; it flagged secondary text size, large catalog title, development serving and initially expanded filters. The latter was corrected. Compact 11–12px metadata remains secondary to product titles, prices and primary controls.
- An independent review scored its two material design findings resolved: products now start in the first desktop Explore viewport, and amendment history has an explicit mobile position. This is a scoped rendered-design review, not financial or deployment acceptance.

No full CI, live transaction, production release or deployment claim is made. Screenshot evidence remains in the ignored cache.

## User refinements, 3 November 2026

The user requested bordered 14px product cards, rounded-up day countdowns in place of active status badges, no card license/delivery disclosure or personal-rebate unit sentence, and English for a first visit while retaining saved language preferences. The supplied `image/banner home.png` is copied unchanged to `frontend/public/images/marketplace-banner.png`; Home uses HTML headline and actions informed by `image/GroupDeal Marketplace Landing Page.png`. The artwork is illustrative, while catalog prices stay authoritative.

Buyer main/header/footer content now shares one 1360px maximum container with matching outer gutters and no inner side padding. Orders, Wallet and Account headings match Explore. Seller/admin keep their full-width sidebar layouts. The shared tier rail draws one continuous line ending at the first/last milestone centers. Existing purchase, authentication and wallet behavior stays unchanged.

Refinement verification: 52 catalog/guest-checkout/navigation cases, three wallet-route cases, one pricing-rail geometry case and five explicit-locale sign-in/recovery cases passed across the targeted runs (61 unique cases). Legacy wallet and sign-in assertions were aligned with existing baseline UI behavior: signed-out wallets show the sign-in prompt, and the unavailable wallet action is labeled Connect wallet. No application authentication or financial behavior was changed. Thirty responsive/localization combinations had no overflow; header/main/footer edges matched exactly in the 24 six-page width checks. The local rendered-layout review passed. These checks are not full CI or live acceptance.


## Workspace consistency and replacement artwork — 4 November 2026

The supplied `image/banner home.jpg` is copied byte-for-byte to `frontend/public/images/marketplace-banner.jpg` (1600×700). It replaces the previous PNG in Home; the full image and transparent HTML overlay remain. Shared typography, palette, buttons, header and footer styling now live in `product-theme.css`. Seller/admin retain full-width layouts, a 256px desktop sidebar and existing mobile drawers; `workspace-theme.css` applies flat 12px panels, neutral selected navigation and a divided seller metric strip. Authentication, permissions, money, claims, payout, fulfillment and recovery logic stay with the existing components. The public website is temporarily closed using the separately documented maintenance gate.
