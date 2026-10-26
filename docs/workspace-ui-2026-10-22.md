> Chuẩn bị nghiệm thu 26/10/2026: FE/BE 8c32212; 397 runtime và 186 static files trên VPS khớp artifact lúc 08:30 giờ Việt Nam; observer UP, 95 hold giữ nguyên. Đã có [checklist 32 ca và packet bàn giao](../reports/THUC_THI_SAU_REVIEW_2026-10-26.md); đã chốt giữ 23 ca chưa đủ bằng chứng, không miễn mới; T được chỉ định review/nhận vận hành, chưa xác nhận độc lập hoặc ký G6. G5/G6 OPEN; các cờ nghiệm thu false. Nội dung cũ bên dưới giữ theo thời điểm gốc.

> Cập nhật phát hành sau phê duyệt 24/10/2026, 23:24 giờ Việt Nam: **FE/BE đều đã lên 8c32212**; CI 78/78 PASS, native recovery/admission/reconciliation đạt, 185 tệp HTTPS + 22 tuyến + 2 smoke đạt, backup/private restore/offhost v2 xác minh, observer UP. 95 hold giữ nguyên. Xem [biên bản phát hành và bước tiếp theo](../reports/THUC_THI_SAU_REVIEW_2026-10-24_02.md). **G5/G6 OPEN, các cờ nghiệm thu false.** Blocker activation ghi dưới đây đã được giải quyết bằng phê duyệt trực tiếp; các phần cũ giữ theo thời điểm gốc.

> Bổ sung sau review 24/10/2026: candidate **8c32212** đã sửa F1/F2 và lỗi focus/reflow liên quan, full CI **78/78 PASS**, preflight VPS đạt. **Chưa phát hành:** activate bị duyệt tự động chặn, cần tin nhắn phê duyệt trực tiếp SHA và restart backend. VPS vẫn FE 49f2719 / BE f314de7. Xem [báo cáo thực thi/candidate ledger/acceptance matrix](../reports/THUC_THI_SAU_REVIEW_2026-10-24.md). G5/G6 OPEN và các cờ nghiệm thu vẫn false; nội dung dưới đây giữ theo thời điểm gốc.

# Workspace UI on the synchronized VPS baseline

Base: `cace5849462095116300eae0887a7ee2036dcfa3`. Work was performed in the main repository. The historical VPS manifest remains unchanged; it does not describe this new candidate. The user authorized GitHub publication and VPS deployment on 23 October 2026.

## Deployed versions — 24 October 2026

| Component | Released source |
|---|---|
| Frontend | `49f2719d8c114bb380a16ab87c128b740c47dadc` |
| Backend | `f314de7fc47b77055b25615209dbdb8bd867853e` |

The workspace/backend release is complete. Its [full CI](https://github.com/tanka420/group-deal/actions/runs/40002078347) passed 78/78 steps and native admission preserved live fields and holds. Backup/private verification and offhost layout-v2 round-trip were verified after that upgrade. The [header frontend CI](https://github.com/tanka420/group-deal/actions/runs/40063311147) also passed 78/78 steps. Its recorded artifact was released on 24 October; all 185 public files matched HTTPS hashes, 22 routes/boundaries passed, and desktop/mobile header browser checks passed. The backend was not restarted for the header release.

The latest frontend receipt is `/home/ubuntu/groupdeal/operations/FRONTEND-RELEASE.json`; the preceding backend/workspace receipt remains `/home/ubuntu/groupdeal/operations/WORKSPACE-RELEASE.json`. Local frontend is updated at `http://127.0.0.1:5173`. Documentation-only follow-ups do not change these application source commits or constitute a new runtime release. [Current G5/G6 scope](../reports/PHAM_VI_G5_G6_CON_LAI_2026-10-24.md) keeps inherited live proofs, deferrals and waivers distinct from this completed UI release.

## Release procedure

Release the exact committed candidate after its full GitHub Actions run succeeds. Record both frontend and backend source commits, because the new UI uses the workspace pagination and overview APIs. For backend changes, the native runtime-upgrade procedure takes an authenticated live backup, preserves the live records and existing work holds, and performs fresh reconciliation before application admission. Authentication is refreshed by that existing admission procedure; users sign in again after the backend upgrade.

The SPA route allowlists include `/seller/campaigns`, `/admin/access`, and the six published policy pages. Validate nginx before activation, retain the previous entry files and configuration for rollback, and preserve old immutable assets and the Safe owner page. The release receipt is stored privately on the VPS at `/home/ubuntu/groupdeal/operations/WORKSPACE-RELEASE.json`; it is the evidence of actual activation. No production database or private release evidence belongs in Git.

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

The 24 October header follow-up replaces the centered mobile navigation dialog with a dropdown anchored below the sticky header. Its own scroll area keeps links reachable on short screens. The VI/EN control is public in the header, immediately before notifications for signed-in accounts, and the desktop navigation is centered between balanced side columns. Account and notification dropdowns share the header anchor. This follow-up changes only the frontend; the backend remains on `f314de7fc47b77055b25615209dbdb8bd867853e` and does not require a service restart. The focused navigation browser suite covers scroll anchoring, keyboard dismissal, guest language persistence and desktop positioning.

- `node scripts/run_workspace_checks.cjs`: isolated SQL/API, ownership, private-field exclusion, stable pagination, all-time accounting, historical versions, one-time username and affected wallet/startup regression suites.
- Frontend unit route round trips and frontend/backend TypeScript/build checks.
- Browser checks: `workspace_completion`, `catalog`, `history_session_scope`, `transaction_history_locale`, `operator_access`, `operator_navigation`, `admin_session`, and `product_studio_scope`. Browser data and wallet stubs are explicitly isolated test fixtures. They are not production or real-transaction acceptance evidence.
- Responsive checks include narrow mobile layouts and wide desktop workspaces. Screenshots and traces are private local artifacts under `.cache/`.
- CI browser fixtures use the paginated API contract and explicitly select the transfer/swap tab when exercising those existing flows. The workspace SQL browser fixture runs in its own child process for consistent TypeScript loading on Windows and Linux. Definitive resource-input rejection returns focus after the form is enabled again; long transaction status badges wrap at 200% text size.

## Local application for user testing

After building both packages, run `node scripts/start_local_workspace.cjs` from the repository root. It serves the built frontend at `http://127.0.0.1:5173` and the real application API on loopback port 4000.

The local runtime validates the configured Arc Testnet deployment and runtime security. It uses its own persistent SQLite directory, `.cache/local-workspace`, and does not open `backend/data` or restore/copy the VPS database. There is no sample-data seeding. A new local database can therefore lack the private product/account metadata present on the VPS. Wallet approvals and testnet transaction signatures still require the user's explicit actions in the application.

The local launcher reads the existing backend environment without printing credentials. Automatic email/webhook outbox delivery is disabled in this local mode; normal production startup behavior is unchanged. The launcher records its process IDs and source commit in `.cache/local-workspace-run/run.json`. Do not publish environment files, runtime databases, logs, screenshots or traces.

On a fresh database the launcher first backfills real chain evidence in bounded ranges of up to 5,000 blocks. Transient RPC outages retry the same range with backoff; successful verified checkpoints persist between runs. Invalid evidence fails closed. This preparation can take time and runs before the API opens. The normal production indexer retains its 500-block default.
