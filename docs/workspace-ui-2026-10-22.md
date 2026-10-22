# Workspace UI on the synchronized VPS baseline

Base: `cace5849462095116300eae0887a7ee2036dcfa3`. Work was performed in the main repository. The historical VPS manifest remains unchanged; it does not describe this new candidate. No VPS deployment or production-data transfer is part of this change.

## Product decisions

- Usernames are created once. The account receives a stable suggested name in the form `user_<16 hex characters>`; the suggestion is not registered until the user explicitly confirms. Existing usernames are retained. The same username cannot be changed, including through the API. Public handles are displayed with `@`.
- Wallet activity adds GroupDeal purchases and sales, with commitment, allocation, claimed and remaining amounts kept distinct. Transfers and swaps initiated in the app remain available separately. This is not a complete external blockchain-wallet history. Activity can be scoped to the selected wallet or all wallets belonging to the account.
- Seller proceeds are the sum of verified `sellerAllocated` values. Commitments, proceeds already claimed and remaining claimable amounts are separate. Unknown or inconsistent financial data is not converted to zero. The overview is explicitly all-time; no period-based revenue is inferred from order creation dates.
- Tier progress uses the campaign's actual account-count or unit-count metric. Participant count remains independent. The opening-price comparison excludes personal early rebates and does not change the contract's locked-price or final-rebate rules.

## Implemented surfaces

- Five primary destinations on desktop and mobile; account-menu icons and no operator-access menu entry.
- Transaction rows with time, expandable recovery details and 20 records per page. Existing receipt, replacement, expiry, Circle and checkpoint guards remain in use. Failed refreshes retain the previous valid history.
- Bounded SQL pages for seller campaigns/orders/products and buyer orders, with ownership checks and filter-scoped cursors. Totals are read separately from pages.
- A seller overview and links between campaigns, product versions and orders. Historical product/license versions are read-only and remain distinct from the latest editor version.
- Existing full-width seller layout and desktop sidebar retained; mobile drawer retained.
- Verified admin account/access information moved into a dedicated workspace section. The APP/ADMIN session separation and outer access gate remain.
- Policy/help footer with real application routes and in-app support tickets as the contact channel.
- Consistent Vietnam display time without timezone suffixes. Stored timestamps and financial deadlines are unchanged.

## Verification

- `node scripts/run_workspace_checks.cjs`: isolated SQL/API, ownership, private-field exclusion, stable pagination, all-time accounting, historical versions, one-time username and affected wallet/startup regression suites.
- Frontend unit route round trips and frontend/backend TypeScript/build checks.
- Browser checks: `workspace_completion`, `catalog`, `history_session_scope`, `transaction_history_locale`, `operator_access`, `operator_navigation`, `admin_session`, and `product_studio_scope`. Browser data and wallet stubs are explicitly isolated test fixtures. They are not production or real-transaction acceptance evidence.
- Responsive checks include narrow mobile layouts and wide desktop workspaces. Screenshots and traces are private local artifacts under `.cache/`.

## Local application for user testing

After building both packages, run `node scripts/start_local_workspace.cjs` from the repository root. It serves the built frontend at `http://127.0.0.1:5173` and the real application API on loopback port 4000.

The local runtime validates the configured Arc Testnet deployment and runtime security. It uses its own persistent SQLite directory, `.cache/local-workspace`, and does not open `backend/data` or restore/copy the VPS database. There is no sample-data seeding. A new local database can therefore lack the private product/account metadata present on the VPS. Wallet approvals and testnet transaction signatures still require the user's explicit actions in the application.

The local launcher reads the existing backend environment without printing credentials. Automatic email/webhook outbox delivery is disabled in this local mode; normal production startup behavior is unchanged. The launcher records its process IDs and source commit in `.cache/local-workspace-run/run.json`. Do not publish environment files, runtime databases, logs, screenshots or traces.

On a fresh database the launcher first backfills real chain evidence in bounded ranges of up to 5,000 blocks. Transient RPC outages retry the same range with backoff; successful verified checkpoints persist between runs. Invalid evidence fails closed. This preparation can take time and runs before the API opens. The normal production indexer retains its 500-block default.
