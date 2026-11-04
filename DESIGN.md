---
name: GroupDeal Testnet Buyer Interface
description: Product-first group buying with clear prices, terms, and next steps.
colors:
  primary: "#1757e5"
  primary-hover: "#1048c7"
  surface: "#ffffff"
  surface-muted: "#f1f5fb"
  surface-soft: "#f5f7fb"
  gallery-well: "#f0f4fa"
  text-primary: "#17243a"
  text-secondary: "#53647c"
  text-muted: "#5e6d82"
  border-subtle: "#e1e7f0"
  border-medium: "#cdd7e6"
  selection-surface: "#dce7ff"
  selection-text: "#142b50"
  status-positive-surface: "#e4f2ea"
  status-positive-text: "#256545"
  status-discount-surface: "#eaf5ee"
  status-discount-text: "#236548"
  status-neutral-surface: "#eef3fa"
  status-neutral-text: "#4d6280"
  category-selected: "#172c4d"
  countdown-text: "#a42e40"
  countdown-surface: "#fff4f4"
typography:
  display: {fontFamily: "Be Vietnam Pro, system-ui, sans-serif", fontSize: "36px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.04em"}
  headline: {fontFamily: "Be Vietnam Pro, system-ui, sans-serif", fontSize: "40px", fontWeight: 700, lineHeight: 1.2}
  title: {fontFamily: "Be Vietnam Pro, system-ui, sans-serif", fontSize: "20px", fontWeight: 600, lineHeight: 1.4, letterSpacing: "-0.025em"}
  body: {fontFamily: "Be Vietnam Pro, system-ui, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: 1.7}
  label: {fontFamily: "Be Vietnam Pro, system-ui, sans-serif", fontSize: "13px", fontWeight: 600, lineHeight: 1.7}
rounded: {badge: "4px", category: "6px", control: "8px", panel: "12px", product: "14px", banner: "16px", circle: "50%"}
spacing: {compact: "8px", small: "12px", medium: "16px", large: "24px", wide: "40px", section: "64px"}
components:
  button-primary: {backgroundColor: "{colors.primary}", textColor: "{colors.surface}", typography: "{typography.label}", rounded: "{rounded.control}"}
  button-secondary: {backgroundColor: "{colors.surface}", textColor: "{colors.text-primary}", typography: "{typography.label}", rounded: "{rounded.control}"}
  input-search: {backgroundColor: "{colors.surface}", textColor: "{colors.text-primary}", typography: "{typography.body}", rounded: "{rounded.control}"}
  category-selected: {backgroundColor: "{colors.category-selected}", textColor: "{colors.surface}", typography: "{typography.label}", rounded: "{rounded.category}"}
---

# Design System: GroupDeal Testnet Buyer Interface

## Overview

**Creative North Star: "The Clear Product Shelf"**

Give the product and buying decision room to be understood: real catalog items lead, with price, availability, delivery, and license details nearby. The shared buyer language is open and calm: white static surfaces, navy text, cobalt actions, fine dividers, and restrained status colors.

Be Vietnam Pro supports English and Vietnamese. Catalog images come from product data and use a labeled fallback when unavailable. Buyer, seller and operator share the tokens and controls in `product-theme.css`; their page layouts remain scoped to `.storefront-app` and `.workspace-app`.

**Key Characteristics:** product-led; spacious and static; bilingual; factual status colors.

## Colors

Clear cobalt emphasizes actions and tier progress. Navy and slate carry information; pale blue surfaces and fine borders separate content. Green and slate statuses remain semantic.

### Primary
- **Clear Cobalt:** primary action and progress.
- **Deep Cobalt:** primary hover.

### Neutral
- **Paper White:** page and control surfaces.
- **Cool Mist, Soft Blue Gray, Gallery Mist:** quiet sections, purchase surface, and product-image wells.
- **Navy Ink, Slate Ink, Muted Slate:** headings, body, and supporting copy.
- **Fine Blue Gray, Quiet Blue Gray:** dividers and outlines.

**The Quiet Status Rule.** Green and slate badges describe actual product or purchase states; they are not decoration.

## Typography

**Display / Body:** Be Vietnam Pro (system-ui, sans-serif fallback).

### Hierarchy
- **Display** (700): banner overlay copy scales from 36px desktop to compact 13–16px on phones so the full image remains visible. Supporting banner copy recedes at narrow widths; primary touch targets remain 44px.
- **Headline** (700): Explore and deal titles, 40px desktop and 31–32px mobile.
- **Title** (600): product titles and section headings.
- **Body** (400): descriptions and terms; long detail copy stays near 75ch.
- **Label** (600): buttons and concise field labels.

**The Two-Language Rule.** Keep the same hierarchy in both languages; do not shrink or truncate Vietnamese labels to make layouts fit.

## Layout

Buyer main content, header inner content and footer inner content share one container: up to 1360px wide, with 24px outer gutters and 16px at 700px and below. Their inner horizontal padding is zero. Seller and operator remain full width for sidebars. Home shows the complete supplied JPEG banner at its 1600:700 aspect ratio. HTML copy and actions overlay the empty left side of that image with a transparent background; never split it into image and information panels. How it works and a separate user-benefits section follow, then category tabs and the product grid. All is the default tab; categories filter through the catalog API and retain pagination. The grid drops to two columns below 1100px and one below 700px. Deal detail stacks below 992px.

Explore's advanced filters start closed on desktop. At 768px the filter button opens a dialog; its initial state is closed. Keep search, categories, active-filter chips, prices, availability, and pagination in the real catalog flow.

**The Product-First Rule.** Lead with the real product, title, current price, and status; keep the complete license and delivery details reachable from it.

## Elevation & Depth

Catalog tiles, galleries, and the purchase panel are flat at rest. Pale surfaces and borders provide separation; the overlay shadow is reserved for menus and the compact filter drawer. Buttons use a 150ms background transition; reduced-motion preference removes it. Backgrounds stay static.

**The Flat Surface Rule.** Do not add ambient shadows to product tiles, galleries, or the purchase panel.

## Shapes

Use the frontmatter radius scale for controls, badges, and panels. Product cards have a 1px quiet border, 14px corner radius, clipped image corners and 20px content padding. The banner uses a 16px radius; detail image wells remain flat. Seller avatars are circular. Keyboard focus is a cobalt outline with offset, not a glow.

## Components

### Seller and Operator Workspaces

- Keep the full viewport width, existing 256px desktop sidebars and keyboard-accessible mobile drawers. Share Be Vietnam Pro, navy/slate text, cobalt actions, focus outlines and header/footer treatments with buyer pages.
- Use 30px workspace headings (26px on phones), 14px body text, 13px control labels, 8px controls and flat 12px panels. Status colors retain their existing meanings.
- A neutral selected navigation row identifies the current section. The seller overview's four linked metrics form one divided strip, with two columns on smaller screens. Operator monetary summaries use four columns, then two, then one on narrow phones; values remain exact and tabular.
- Financial, wallet, permission, payout, fulfillment and recovery behavior remains in the existing components. Styling does not imply verification of projected financial values.

### Buttons and Inputs
- Primary buttons are solid cobalt; secondary actions are white with a quiet outline. Base buttons are at least 46px tall, search controls 48px, the in-panel purchase action 50px on every screen, and the separate mobile footer action at least 58px. Hover deepens color without lift; focus uses a 3px outline with 4px offset.
- Search is a labeled form. Keep price validation and USDC-per-unit meaning visible.

### Catalog Products and Filters
- Product cards are bordered and rounded. Use a centered cover-fill catalog thumbnail with a labeled fallback on absence or error. Active campaign badges show remaining hours below 24 hours, otherwise remaining days, rounded up; expired campaigns show Ended.
- Keep current price, tier progress, deadline and seller facts with the card. Cards omit the license/delivery disclosure and the per-unit personal-rebate sentence; the full license and delivery facts remain on deal detail and purchase review.
- Desktop advanced filters begin closed. Compact screens use the existing filter dialog; selected categories and removable filter chips retain clear states.

### Navigation and Deal Detail
- The buyer header is white with a fine lower divider and a thin cobalt active-route underline; it is 84px tall desktop and 72px mobile. The login button is solid cobalt with white text. Orders, Wallet and Account use the same title structure and type as Explore, including signed-out states. English is the first-visit default; saved language choices remain respected.
- Keep gallery, seller, key facts, license, delivery, and purchase panel in the existing detail order. License and delivery navigation targets remain keyboard reachable.
- Mobile retains the in-panel purchase action and adds a fixed bottom shortcut with the current price. Both open the same review, share blocking states and restore focus to the initiating button. New forward page navigation starts at the top once. Back/Forward and explicit return links restore the saved position after content is ready; touch, wheel and keyboard input cancel pending restoration. Catalog query changes and in-page content navigation retain their own behavior.

### Purchase Panel
- The tier rail is one continuous track joining the centers of its first and last circular milestones. There are no per-tier line gaps or track overhangs. Keep status, deadline, unit price, tier rail, fee note, and join action together. Preserve the existing pre-transaction review, consent, authentication, funding, wallet authorization, transaction status, and recovery behavior.

## Do's and Don'ts

### Do:
- **Do** use real product imagery and the labeled fallback; keep price, rights, license, and delivery attached to that product.
- **Do** preserve English/Vietnamese and visible Arc Testnet and USDC context.

### Don't:
- **Don't** invent live products, sales, testimonials, or rights-approval states.
- **Don't** add moving or repeating perspective grids, or bypass the existing financial and transaction flows.

### Shared page spacing and footer reading
- Main content has equal top and bottom padding: 32px desktop, 24px below 768px. Page roots do not add a second outer block padding. Header/footer horizontal containers remain unchanged; seller and operator keep their sidebar layout.
- Footer information fills the shared container without the old 800px cap. Use the existing type and cobalt links, a compact native contents disclosure, clear section headings, short paragraphs and procedure lists. Desktop sections use a heading column and a text column; mobile reads as one column. The user guide lives at `/policies/help`. Contents navigation focuses its heading and reveals the section below the app header without changing the route.
- The order-list column heading is opaque, flush to the top of the bounded scroller and square inside its rounded outer frame. No padding strip, rounded header gaps or row gaps may expose records behind it.
