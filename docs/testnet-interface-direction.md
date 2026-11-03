# Testnet interface: direction A

The user selected **A — Sản phẩm dẫn dắt / product-led gallery** on 3 November 2026 after reviewing two working directions. The work belongs to `codex/arc-candidate`; UI V2 is set aside.

## Design contract

Home answers “What could I buy together?” with an actual catalog product as the leading visual. Explore answers “Which product fits my needs?” with product covers, exact prices, categories, search and existing advanced filters. Deal detail answers “What do I receive, and what am I committing?” with a title, gallery, price tiers and the existing purchase review.

Use a white static surface, navy text, cobalt actions and restrained status colors. Be Vietnam Pro supports Vietnamese and English. Product images come from the catalog; unavailable images have an honest fallback. Do not invent live products, sales, testimonials or verification badges. Do not reuse the perspective-grid image or UI V2's frontend/design contract.

The chosen composition is a broad gallery: a split title/introduction, a large featured product, three product columns, then categories and practical buying steps. On phones the same information becomes one column. Keep primary product text at 14px or above; 12–13px is for supporting facts, 11px only for compact status metadata.

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
