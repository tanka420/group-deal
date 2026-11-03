# Testnet design directions

The user chose **A, the product-led gallery**. Both prototypes remain available for reference; the actual implementation is in `frontend/src/` on `codex/arc-candidate`.

From the repository root, with the existing frontend dependencies installed:

```sh
npm run preview:testnet-design
```

Open `http://127.0.0.1:5178/design/` for A/B comparison, or `http://127.0.0.1:5178/` for the actual React frontend with the same isolated sample content. Stop with Ctrl+C. The server binds only to loopback and uses port 5178 strictly. After building an exact commit, `npm run preview:testnet-design -- --built` serves the compiled frontend with these fixtures on port 5188.

- A: covers, product value and a spacious gallery lead; group pricing remains visible.
- B: pricing milestones and comparison rows lead; retained as the unselected alternative.
- Each prototype includes Home, Explore and deal detail, VI/EN, responsive views, search, categories, sorting and a purchase-total preview. These prototype screens do not connect wallets or send transactions.
- The root React interface retains the application's real route and checkout code. Its API is replaced by read-only fixture responses in this preview host; there is no backend/database connection. Use the existing Testnet startup workflow for integration work.

All products, covers and counts in this preview are explicitly illustrative, derived from the existing local master-deal fixture. They are not live offers or financial proof. Cached before/after screenshots and browser reports are under ignored `.cache/testnet-design/`; the comparison thumbnails render live and do not require those files.

Be Vietnam Pro regular/medium/semibold/bold is self-hosted from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/bevietnampro). See `assets/OFL.txt` for its SIL Open Font License. The actual frontend keeps its copy at `frontend/public/fonts/be-vietnam-pro/`.

See `docs/testnet-interface-direction.md` for the implementation boundary and `docs/ui-skills.json` for the pinned skill repositories, commits and licenses. No merge or deployment is part of this local redesign.
