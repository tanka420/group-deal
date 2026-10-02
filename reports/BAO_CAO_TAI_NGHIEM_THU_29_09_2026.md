# BÁO CÁO TÁI NGHIỆM THU GROUPDEAL SAU KHẮC PHỤC

**Ngày kiểm tra:** 29/09/2026

**Nhánh làm việc:** `codex/arc-candidate`

**HEAD nền:** `c76ab857c9314ea5a6ee9f84eae2856e00de910b`

**Kết luận:** **CHƯA ĐỒNG Ý NGHIỆM THU HOÀN THÀNH DỰ ÁN.** Mã nguồn hiện là candidate có điều kiện: pipeline code/test đã xanh và phần lớn điểm chặn kiến trúc cũ đã được khắc phục, nhưng chưa có live journey qua Circle User-Controlled, Reown và Arc App Kit Bridge với các actor độc lập; chưa có credential/test funds, kiểm thử accessibility/responsive đầy đủ, xử lý advisory frontend và reviewer độc lập. Working tree cũng chưa được đóng thành commit/tag bất biến.

**Phụ lục cập nhật 30/09/2026:** deployment cũ đã bị thu hồi và sau đó cleanup về `0`; Safe 2-of-3 cùng Hub candidate mới đã được deploy/xác minh. G5 product journey và G6 vẫn mở. Xem [BAO_CAO_TIEN_DO_LIVE_ARC_30_09_2026.md](./BAO_CAO_TIEN_DO_LIVE_ARC_30_09_2026.md).

**Cập nhật 02/10/2026:** người dùng đã xác nhận cấu hình môi trường/OTP và quyền kiểm soát ví, nhưng G1/G4 còn điểm mở và live journey chưa đủ bằng chứng. Đã sửa luồng reload/Circle email/faucet/bridge và tách SQLite test; không diễn giải các sửa lỗi này thành nghiệm thu hoàn tất. Xem [báo cáo rà soát ví và dự án](./BAO_CAO_RA_SOAT_VI_VA_DU_AN_02_10_2026.md) và kế hoạch v1.6.

## 1. Cách đọc các báo cáo trước

| Tài liệu | Kết luận cũ | Đánh giá hiện tại |
|---|---|---|
| `BAO_CAO_KHAC_PHUC_TOAN_DIEN.md` | Tuyên bố dự án hoàn tất và PASS | Không còn đủ để nghiệm thu. Báo cáo này từng chấp nhận relayer/server signer, JSON store và test sai tầng. Chỉ giữ làm lịch sử khắc phục. |
| `BAO_CAO_KIEM_TRA_DU_AN.md` | CHƯA ĐẠT, liệt kê F01–F32/UI | Là baseline thiếu hụt đúng hướng. Nhiều P0/P1 đã được sửa trong working tree hiện tại. |
| `BAO_CAO_NGHIEM_THU_VA_KHAC_PHUC.md` | CHƯA ĐẠT, thu hồi kết luận “100% compliant” | Vẫn đúng về nguyên tắc bằng chứng. Các mục Circle/Reown/live Arc/G6 không được suy ra từ unit test. |
| `PLAN.md` | Yêu cầu sản phẩm hoàn chỉnh và vận hành được trên Arc | Vẫn là chuẩn cuối. Không hạ tiêu chí để khớp implementation. |
| `KE_HOACH_HOAN_TAT_DU_AN.md` v1.5 | Gate G0–G6 và tiêu chí bằng chứng | Là kế hoạch thực thi hiện hành; G5.2–G5.4 và G6 còn mở. |

Báo cáo này thay thế mọi kết luận “đã hoàn thành 100%” trước đó, nhưng không xóa lịch sử audit.

## 2. Những phần đã thực thi

### 2.1. Arc là nguồn sự thật tài chính

- `GroupDealHub` trên Arc giữ escrow và quyết định campaign/finalize/delivery/dispute/allocation/claim.
- Backend signer path gửi giao dịch tài chính đã bị xóa. `OnchainService` chỉ đọc provider/receipt.
- Create campaign, record delivery, confirm, dispute, SLA breach, settlement và resolution đều yêu cầu transaction do đúng ví người dùng/operator ký; backend xác minh sender, target, exact calldata, receipt và event trước khi nhận. Draft dùng UUID cục bộ và chỉ nhận `onchainCampaignId` từ `CampaignCreated` đã xác minh.
- Worker theo wall clock không còn tự sửa allocation tài chính trong DB. Indexer chỉ cập nhật projection từ event Arc.
- Seller UI chặn sớm nếu ví ký không trùng payout wallet đã đăng ký.

### 2.2. Circle User-Controlled Wallet

- Backend dùng `@circle-fin/user-controlled-wallets`; API key chỉ tồn tại phía server.
- Frontend dùng Circle Web SDK cho email login, hosted OTP, wallet initialization và user-approved challenge. Circle token/encryption key chỉ giữ trong memory.
- Email/device/IP limiter dùng identifier đã hash, cooldown, TTL/attempt limit; response bắt đầu login chống enumeration.
- Transaction policy bind Arc chain, Hub/USDC address, selector, spender, amount, draft/campaign/order, proof/allocation và stable operation ID.
- Legacy local OTP, arbitrary relay và sign-message endpoint trả `410`.

Chưa được phép gọi phần này “live PASS” cho đến khi cấu hình Circle API key/App ID/SMTP Console và lưu bằng chứng user-approved transaction thật.

### 2.3. Reown và Arc App Kit

- Reown AppKit thay kết nối `window.ethereum` tự viết, dùng custom Arc Testnet network và connector external wallet.
- Reown/Circle/App Kit được tải động để không đưa toàn bộ SDK vào initial bundle.
- Funding modal tích hợp `@circle-fin/app-kit` Bridge/CCTP trong ứng dụng, có operation lifecycle, retry và explorer; không còn chỉ là external link.
- Native gas view 18 decimals và USDC ERC-20 nghiệp vụ 6 decimals được tách riêng; không cộng hai view balance.

Chưa có receipt live chứng minh external wallet commit/claim hoặc CCTP bridge hoàn tất trên Arc.

### 2.4. Persistence, indexer và vận hành

- Store chuyển sang SQLite WAL/FULL synchronous với transaction và UNIQUE vật lý cho email, Circle ID, wallet, event identity và idempotency.
- Có migration one-time từ JSON, audit hash chain, encrypted backup/restore drill.
- Indexer backfill/checkpoint, canonical ordering, event dedupe, clean rebuild và `FundsClaimed` fail-closed.
- Fixed-block reconciliation có `HEALTHY`, `UNVERIFIED`, `STALE`, `DISCREPANCY_DETECTED`, `ERROR`; lag trên 10 block bị cảnh báo.
- In-app notification và email outbox có preference, event-level dedupe, retry/backoff/DLQ; webhook queue tiếp tục có SSRF guard và DLQ replay.
- Runbook mới quy định RPC outage, pending tx, indexer gap, reconciliation discrepancy, restore, DLQ và credential rotation.

### 2.5. Trải nghiệm sản phẩm

- Seller: draft/dry-run/canonical terms hash/create onchain/publish, delivery onchain, settle và claim.
- Buyer: commit, confirm/dispute, SLA breach claim và claim funds bằng onchain IDs.
- Operator: one-time wallet step-up, resolve dispute onchain và badge action có audit.
- Header có notification list/unread/read state; modal được render qua portal để không bị sticky header cắt.
- Có browser E2E cho fail-closed Circle/Reown và Arc App Kit funding path khi thiếu credential.

## 3. Bằng chứng kiểm tra mới nhất

Môi trường: Node `v24.11.1`, npm `11.6.2`, Windows/PowerShell. Lệnh `npm run verify:pipeline` đã chạy thành công ngày 29/09/2026.

| Lớp | Kết quả |
|---|---|
| Clean + compile + ABI generation | PASS; compile lại 27 Solidity files và sinh ABI backend/frontend |
| Contract tests | PASS `24/24`, gồm O(1), EIP-712, conservation và lifecycle simulation |
| Backend suites | PASS toàn bộ accounting/auth/security/ABI/Circle policy/SQLite/outbox/G1/G3/G4/G5 validator suites |
| Arc Testnet smoke | PASS lại sau deployment tại block `64644670`, chain `5042002`, USDC predeploy 6 decimals, CCTP, Multicall3, 20 Gwei base fee, zero/blocklist revert |
| Backend + SDK + frontend build | PASS |
| Backend + frontend typecheck | PASS |
| Browser acceptance | PASS `2/2` trên Chromium |
| Diff hygiene | PASS; chỉ còn cảnh báo chuyển LF/CRLF của Git trên Windows |

Arc smoke là read-only/environment proof, không phải live financial E2E. Contract “Full Lifecycle E2E” trong pipeline chạy ở lớp contract simulation, không được dùng thay buyer/seller/operator journey qua browser/API/Circle/Reown trên Arc Testnet.

## 4. Dependency và rủi ro còn lại

- Backend production audit: `0` vulnerability.
- Frontend production audit: `37` (`8 low`, `19 moderate`, `10 high`, `0 critical`).
- High findings đi qua `@circle-fin/app-kit` và các package transitive như Bridge/Gateway/Swap/Unified Balance, `@coral-xyz/anchor`, `toml`, `undici`.
- Các dependency Circle trực tiếp đang ở phiên bản npm mới nhất tại thời điểm kiểm tra: App Kit `1.15.3`, adapter viem `1.18.0`, Web SDK `1.1.11`.
- `npm audit` đề xuất App Kit `1.8.1`, tức downgrade/breaking path, nên không tự động `--force`. Cần theo dõi upstream, đánh giá reachability của module đã dùng và chạy regression trước mọi thay đổi.
- Frontend vẫn cảnh báo các lazy chunk lớn hơn 500 kB: initial app khoảng 583 kB, App Kit khoảng 703 kB, Reown khoảng 814 kB trước gzip. Đã tách tải theo nhu cầu nhưng chưa đạt budget tối ưu.

Với 10 high advisory production, candidate chưa nên được coi là production-ready dù không có critical.

## 5. Các điều kiện chưa đạt

1. Chưa cấu hình và chứng minh live `CIRCLE_API_KEY`, `VITE_CIRCLE_APP_ID`, Circle email Console, `VITE_REOWN_PROJECT_ID`, email provider và secret production.
2. Chưa có các ví test độc lập được nạp đủ Arc gas/USDC và source-chain USDC cho CCTP.
3. Chưa chạy seller + Circle buyer + Reown buyer + operator + security multisig qua cùng candidate trên Arc Testnet.
4. Chưa có receipt cho create/commit/finalize/delivery/confirm/dispute/timeout/claim/cancel và CCTP bridge, kèm fixed-block reconciliation cuối.
5. Chưa chạy failure/recovery live cho RPC timeout sau broadcast, process restart, indexer gap, outbox/webhook DLQ và database restore/rebuild.
6. Chưa hoàn tất multi-account browser E2E, keyboard/WCAG và responsive 320/375/768 px.
7. Frontend dependency audit còn 10 high advisory và bundle chunks lớn.
8. Working tree chưa đóng commit/tag; chưa có clean-checkout reproduction từ máy thứ hai.
9. Chưa có reviewer độc lập ký G6/threat model và đối chiếu toàn bộ PLAN/F01–F32/UI.

## 6. Kế hoạch đóng dự án

### Bước 1 — Đóng candidate kỹ thuật

- Review diff, bảo đảm không có secret, commit/tag candidate bất biến.
- Chạy `npm ci` từ clean checkout và `npm run verify:pipeline` trên máy/CI thứ hai.
- Lưu checksum artifact, manifest, probe, dependency report và bundle report theo commit.

### Bước 2 — Cấu hình môi trường nghiệm thu

- Cấp Circle API key/App ID và email Console; Reown Project ID; email provider; production secrets qua secret manager.
- Chuẩn bị seller, Circle buyer, Reown buyer, operator và security multisig độc lập.
- Nạp test funds có kiểm soát; không đưa seed phrase/private key vào repo hoặc report.

### Bước 3 — G5 live acceptance

- Chạy các nhánh happy path, dispute, SLA breach và emergency cancel.
- Bridge USDC qua Arc App Kit/CCTP và kiểm balance trước commit.
- Lưu operation ID, tx hash, receipt, event, block/hash, explorer, expected/actual balance và indexer checkpoint.
- Chạy fixed-block reconciliation; yêu cầu conservation/solvency chính xác và escrow không còn ngoài liability hợp lệ.

### Bước 4 — Failure/recovery và UX

- Diễn tập RPC down/timeout/dropped tx, indexer restart/gap, backend/webhook/email worker restart và backup restore.
- Chạy đa account, accessibility keyboard/screen-reader audit và responsive viewports.
- Chốt remediation/acceptance cho advisory frontend; không dùng `audit fix --force` thiếu regression.

### Bước 5 — G6 độc lập

- Reviewer không phải người sửa chạy lại candidate từ clean checkout, lấy mẫu receipt/event/reconciliation và threat-model Circle/Reown/signer/multisig/webhook/entitlement.
- Chỉ sau chữ ký G6 mới đổi kết luận báo cáo sang “ĐẠT”.

## 7. Lệnh vận hành

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
# Điền credential thật qua cơ chế secret phù hợp; không commit hai file .env.

npm ci --prefix backend
npm ci --prefix frontend
npm run verify:pipeline
```

Sau khi G0–G4 đã xanh trên candidate bất biến và test funds được phê duyệt:

```powershell
npm run test:arc-live
```

Không chạy `test:arc-live` chỉ để “làm xanh báo cáo”; lệnh này có thể gửi giao dịch thật và phải dùng đúng bộ actor/manifest/evidence của G5.

## 8. Quyết định cuối

Phần triển khai trong repository đã tiến xa hơn rõ rệt so với `BAO_CAO_KIEM_TRA_DU_AN.md`: Arc đã được dùng làm settlement thật trong kiến trúc, Circle/Reown/App Kit có mặt trong code đúng vai trò, SQLite transactional và browser pipeline đã được bổ sung, các financial DB-only path bị loại bỏ. Tuy nhiên, chuẩn cuối của `PLAN.md` là một sản phẩm được chứng minh vận hành end-to-end trên Arc Testnet, không chỉ code/test local. Vì G5/G6 và dependency/UX gates còn mở, quyết định hiện tại vẫn là **CHƯA NGHIỆM THU HOÀN THÀNH**.

## 9. Phụ lục cập nhật sau tái triển khai ngày 30/09/2026

Sau kết luận trên, phần G5.1 đã được thực thi thật trên Arc Testnet:

- Hub cũ đã cleanup về `0` escrow và `0` USDC; xem [LEGACY_ARC_CLEANUP.json](./evidence/LEGACY_ARC_CLEANUP.json).
- Safe `0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6` phiên bản `1.5.0`, threshold `2-of-3` đã deploy/xác minh; xem [ARC_SECURITY_MULTISIG.json](./evidence/ARC_SECURITY_MULTISIG.json).
- Hub mới `0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574` đã deploy với owner/operator/authorized signer/security authority tách biệt và fixed-block verification PASS; xem [ARC_CANDIDATE_DEPLOYMENT_VERIFY.json](./evidence/ARC_CANDIDATE_DEPLOYMENT_VERIFY.json).
- Pipeline sau deployment PASS toàn bộ contract `24/24`, backend, Arc smoke, build, typecheck và browser `2/2`.

Phụ lục này đóng thiếu sót deployment/multisig/legacy escrow của G5.1 nhưng không thay đổi quyết định cuối: G5 product journey bằng Circle/Reown/operator/Safe và G6 review độc lập vẫn chưa có đủ credential/principal/evidence. Xem [báo cáo tiến độ live](./BAO_CAO_TIEN_DO_LIVE_ARC_30_09_2026.md).
