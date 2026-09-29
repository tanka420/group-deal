# BÁO CÁO TÁI NGHIỆM THU VÀ ĐỐI CHIẾU PLAN.md — GROUPDEAL

**Ngày kiểm tra:** 29/09/2026  
**Mốc Git:** `571593761d41024638cbc85eb3457697dcfaabdb`, kèm nhiều thay đổi chưa commit trong working tree  
**Chuẩn đối chiếu:** `PLAN.md` tại workspace hiện tại  
**Kết luận:** **CHƯA ĐẠT — KHÔNG THỂ NGHIỆM THU HOẶC TUYÊN BỐ 100% COMPLIANT**

Dự án đã sửa đúng một số lỗi contract, build được các package chính và có thêm test. Tuy nhiên, hành trình ứng dụng tới contract hiện bị chặn bởi ABI backend không khớp contract, nhiều API vẫn đánh dấu thành công khi giao dịch onchain thất bại, ví “Circle” vẫn là khóa riêng do server tự sinh và nắm giữ, indexer/đối soát chưa đủ làm nguồn dữ liệu tin cậy, và chưa có bằng chứng triển khai/E2E trên Arc Testnet thật.

Bản báo cáo trước trong chính file này tuyên bố “HOÀN TOÀN ĐẠT CHUẨN” và “sẵn sàng triển khai thực chiến”. Hai kết luận đó không được dữ liệu kiểm tra xác nhận. Bảng F01–F32 cũ còn gán sai nội dung cho nhiều mã lỗi so với báo cáo gốc; ví dụ F16 gốc là replay challenge liên kết ví, không phải static RPC; F18 gốc là chain/config mismatch, không phải chỉ thiếu proxy `/health`; UI04 gốc là loading/not-found/network error, không phải sửa terms sau ACTIVE.

## 1. Kết quả kiểm tra thực tế

| Kiểm tra | Kết quả | Ý nghĩa |
|---|---:|---|
| `npm test` tại root | **FAIL** | Script `test:contracts` escape PowerShell sai; Hardhat tiếp tục lỗi `EEXIST`. Không thể ghi “test tự động đạt 100%” khi lệnh chính thức thất bại. |
| Contract test chạy trực tiếp với `LOCALAPPDATA` tạm | **15 passing** | Chạy trên Hardhat chain 31337 và `MockUSDC`; xác nhận một số logic contract, không phải Arc Testnet E2E. |
| Backend test | **PASS** | Accounting/auth/service test qua; phạm vi hẹp và có assertion chấp nhận reconciliation `HEALTHY` khi RPC đang `ECONNREFUSED`. |
| Backend build | **PASS** | TypeScript biên dịch; không chứng minh ABI/runtime đúng. |
| Frontend build | **PASS** | Vite build; còn cảnh báo bundle JS 581,51 kB > 500 kB. |
| SDK build | **PASS** | Sinh `dist/index.js` và `.d.ts`; chưa có consumer/package test. |
| `git diff --check` | **FAIL** | Có blank line cuối file tại `frontend/src/index.css`. |
| Deployment metadata | **LOCAL** | [shared/contracts.json](E:/apps/group-deal/shared/contracts.json) ghi `network: hardhat`, `chainId: 31337`. |
| Arc Testnet deployment/transaction evidence | **KHÔNG CÓ** | Không có địa chỉ triển khai Arc đã xác minh, tx hash, receipt, block, explorer link hoặc số dư đối soát live. |

Test tên “GroupDeal Full Lifecycle E2E Simulation on Arc Network” thực tế tạo `MockUSDC` trong `beforeEach` tại [GroupDealE2ESimulation.test.ts:73](E:/apps/group-deal/contracts/test/GroupDealE2ESimulation.test.ts:73) và chạy network Hardhat mặc định. Dòng log “published on Arc Network” chỉ là chuỗi console, không phải bằng chứng mạng Arc.

## 2. Các điểm chặn nghiệm thu

### A01 — P0 — ABI backend không khớp contract hiện tại

[onchainService.ts:5](E:/apps/group-deal/backend/src/services/onchainService.ts:5) định nghĩa các hàm cũ. So selector từ ABI service với artifact contract hiện tại:

| Hàm | Selector contract | Selector backend | Khớp |
|---|---:|---:|:---:|
| `createCampaign` | `0x0bb522ec` | `0x8199c805` | Không |
| `recordDelivery` | `0x784cd414` | `0x19a835d9` | Không |
| `confirmReceipt` | `0xe5b56091` | `0x843cba13` | Không |
| `settleUndisputedOrder` | `0xed6a2f0a` | `0x34957159` | Không |
| `resolveDispute` | `0x16670bcd` | `0x3fabe74f` | Không |

Ví dụ contract yêu cầu `recordDelivery(campaignId, orderId, proofHash)` tại [GroupDealHub.sol:433](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:433), còn backend gọi `recordDelivery(orderId, proofHash)`. `createCampaign` của contract nhận `CampaignTerms` và mảng tiers riêng, backend lại nhét tiers vào struct duy nhất. Vì selector khác, publish/delivery qua service này không thể gọi đúng contract hiện tại.

**Khắc phục:** sinh ABI/type bindings từ artifact duy nhất sau compile; không chép ABI bằng chuỗi thủ công. Thêm integration test khởi chạy backend với contract mới deploy, gọi publish/delivery/confirm/dispute/claim qua đúng HTTP/UI và đối chiếu receipt/event.

### A02 — P0 — Ứng dụng vẫn báo thành công khi không có bằng chứng onchain

Publish bắt lỗi onchain rồi tiếp tục đặt campaign `ACTIVE` tại [campaignRoutes.ts:329](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:329) và [dòng 335](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:335). Delivery cũng bắt lỗi chain rồi vẫn ghi `DELIVERED` tại [deliveryService.ts:90](E:/apps/group-deal/backend/src/services/deliveryService.ts:90) và [dòng 99](E:/apps/group-deal/backend/src/services/deliveryService.ts:99). Các route confirm/dispute/operator còn có đường cập nhật DB trực tiếp.

Điều này vi phạm yêu cầu PLAN: Arc contract là nguồn sự thật và trạng thái không chắc chắn phải giữ `pending/reconciling`. Đây cũng làm các tuyên bố F09/F11 “đã xử lý” trong báo cáo cũ sai.

**Khắc phục:** bỏ mọi “offline success”; lưu intent là `PENDING_BROADCAST`, `PENDING_CONFIRMATION` hoặc `RECONCILING`; chỉ chuyển ACTIVE/DELIVERED/RESOLVED sau receipt đúng chain, đúng contract, đủ confirmations và event được index. Retry phải idempotent theo operation ID/tx hash.

### A03 — P0 — Ví nhúng không phải Circle User-Controlled EOA

[authService.ts:106](E:/apps/group-deal/backend/src/services/authService.ts:106) dùng `ethers.Wallet.createRandom()`, sau đó server mã hóa và lưu private key. [walletRoutes.ts:62](E:/apps/group-deal/backend/src/routes/walletRoutes.ts:62) giải mã khóa tại server và [dòng 66](E:/apps/group-deal/backend/src/routes/walletRoutes.ts:66) ký/gửi transaction tùy ý từ `{to,data,value}` do client cung cấp.

Đây là server-custodial wallet tự xây, không phải Circle User-Controlled Wallet. API relay không allowlist contract/function, không có policy/step-up auth, không giới hạn value và không ràng buộc intent đã phê duyệt. Việc DTO không trả private key ra browser là cải thiện tốt, nhưng không sửa mô hình custody và không đủ để đóng F02.

**Khắc phục:** tích hợp Circle User-Controlled theo lifecycle/challenge chính thức hoặc đổi toàn bộ tên và threat model thành custodial relayer; dùng KMS/HSM, transaction policy, allowlist selector/contract/chain, step-up auth, quota và audit bất biến. Không giữ master key mặc định trong source.

### A04 — P0 — Secret mặc định và luồng đăng nhập/vận hành chưa dùng được an toàn

[config.ts:33](E:/apps/group-deal/backend/src/config.ts:33) vẫn có JWT secret mặc định; file này còn master encryption key, campaign identity secret và Hardhat signer mặc định tại [dòng 46](E:/apps/group-deal/backend/src/config.ts:46). [hardhat.config.ts:8](E:/apps/group-deal/contracts/hardhat.config.ts:8) cũng mặc định Hardhat private key khi deploy Arc. Production có thể khởi động bằng các giá trị công khai này.

OTP đã chuyển sang CSPRNG, hash và giới hạn thử; đây là sửa đúng một phần. Tuy nhiên service chỉ tạo mã rồi trả thông báo “đã gửi” tại [authService.ts:48](E:/apps/group-deal/backend/src/services/authService.ts:48); repository không có email provider/send-mail. Người dùng thật không nhận được OTP. Nút [Header.tsx:299](E:/apps/group-deal/frontend/src/components/Header.tsx:299) “Đăng nhập Admin (Test Demo)” vẫn còn, trái với báo cáo cũ nói đã xóa; hiện shortcut thường thất bại vì response không còn code, nhưng code demo/backdoor path chưa được loại bỏ. Operator cũng chưa có MFA/step-up auth cho thao tác nhạy cảm.

**Khắc phục:** fail-fast nếu thiếu secret production; loại key mẫu khỏi cấu hình Arc; dùng secret manager/KMS và rotation. Tích hợp email thật với chống enumeration, rate limit theo email/IP/device. Xóa shortcut operator, bỏ seed operator khỏi production và bắt buộc MFA/step-up cho phân xử, xác minh, cancel.

### A05 — P1 — Security Authority chưa độc lập, chưa phải multisig

Modifier tại [GroupDealHub.sol:65](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:65) cho phép `securityAuthority`, `operatorAddress` **hoặc owner** hủy khẩn cấp; constructor còn đặt securityAuthority bằng operator. PLAN yêu cầu quyền hủy toàn chiến dịch thuộc Security Multisig, không phải operator/owner thay thế.

**Khắc phục:** chỉ chấp nhận multisig/timelock cấu hình rõ, tách khỏi operator/owner; có event rotation, two-step transfer, lý do/bằng chứng và runbook. Test phải chứng minh owner/operator đơn lẻ bị từ chối.

### A06 — P1 — Indexer chưa thể rebuild/reorg an toàn

Lần chạy đầu chỉ quét 200 block gần nhất tại [indexerService.ts:65](E:/apps/group-deal/backend/src/services/indexerService.ts:65), nên không thể dựng lại toàn bộ trạng thái từ deployment block. Khi reorg, code lùi cursor nhưng journal cũ không rollback; log cùng tx/index bị skip. Handler `FundsClaimed` không có order IDs nhưng đánh dấu tất cả order của recipient đã claim; handler cancel ghi full refund và xóa allocation thay vì phản chiếu đúng “chỉ phần chưa phân bổ”.

Store journal dùng `JSON.stringify` tại [store.ts:256](E:/apps/group-deal/backend/src/db/store.ts:256); payload `parsed.args.toObject()` có thể chứa bigint, nhưng không có serializer bigint. Chưa có test crash/restart/reorg/backfill dài hoặc rebuild sạch.

**Khắc phục:** lưu deployment block, block hash và confirmation depth; rollback dữ liệu theo block khi reorg; journal event theo chainId/contract/tx/logIndex; projection phải idempotent và rebuild từ genesis/deployment. Claim event cần đủ định danh hoặc projection đọc state contract theo order.

### A07 — P1 — Reconciliation có thể báo HEALTHY khi không truy cập được chain

[reconciliationService.ts:114](E:/apps/group-deal/backend/src/services/reconciliationService.ts:114) đặt `HEALTHY` chỉ theo danh sách discrepancy; RPC lỗi chỉ đặt `onchainBalanceVerified=false`, không tạo discrepancy. Backend test đã in `ECONNREFUSED 127.0.0.1:8545` rồi vẫn assert `HEALTHY`.

Ngoài ra service chỉ so tổng số dư USDC với nghĩa vụ suy ra từ DB, không đối chiếu từng campaign/order/claim state tại một block cố định. Vì indexer có thể sai, hai thành phần có thể cùng sai mà vẫn “khớp”.

**Khắc phục:** thêm trạng thái `UNVERIFIED/STALE/ERROR`; tuyệt đối không HEALTHY khi chưa đọc chain. Chụp block number/hash, đọc campaign/order claimable từ contract, so projection và balance, phát cảnh báo có severity; có test RPC down/stale/reorg/shortfall/surplus.

### A08 — P1 — “Arc E2E” và deployment readiness chưa có bằng chứng

[shared/contracts.json](E:/apps/group-deal/shared/contracts.json) là Hardhat 31337. Các contract test đều deploy `MockUSDC`. Deploy script còn dùng MockUSDC trên `arcTestnet` trừ khi `USE_SYSTEM_USDC=true` tại [deploy.ts:12](E:/apps/group-deal/contracts/scripts/deploy.ts:12). Health API lại hardcode chuỗi “Arc Testnet (5042002)” dù config mặc định có thể là localhost 31337.

**Khắc phục:** deploy bản candidate lên Arc Testnet với contract/token đúng; lưu manifest theo môi trường và checksum artifact; chạy smoke/E2E bằng account riêng, tx thật, explorer/receipt và đối soát. Script deploy Arc phải fail nếu thiếu địa chỉ token/secret thay vì âm thầm deploy mock.

### A09 — P1 — Storage và vận hành chưa đạt yêu cầu PLAN

Ứng dụng vẫn dùng một JSON file, ghi temp rồi rename tại [store.ts:256](E:/apps/group-deal/backend/src/db/store.ts:256). Cách này giảm file rách trong một process nhưng không cung cấp transaction đa bản ghi, lock đa process, unique constraint nguyên tử, migration, backup/PITR hay audit bất biến. Nếu parse lỗi, code “starting fresh” tại [store.ts:236](E:/apps/group-deal/backend/src/db/store.ts:236), có nguy cơ che mất hỏng dữ liệu bằng database rỗng.

Không tìm thấy migration framework, backup/restore test, metrics/alerts thực, incident runbook, retention/deletion policy, notification center hoặc email delivery.

**Khắc phục:** dùng database có transaction/constraint; migration versioned; backup mã hóa và restore drill; append-only audit; metrics, alert, SLO và runbook. Parse/corruption phải fail closed và chuyển recovery mode.

### A10 — P1 — Webhook vẫn chưa đủ chống SSRF và chưa có delivery durability

Validation đã chặn literal localhost/private IP và có retry trong process. Nhưng code chưa resolve DNS trước/sau kết nối, chưa pin IP, chưa chặn redirect sang private network và không có outbound proxy/egress policy. Retry chỉ chạy trong request/process; không có queue bền, idempotency consumer contract hoặc dead-letter dù PLAN yêu cầu.

**Khắc phục:** resolve và kiểm tra toàn bộ A/AAAA, kiểm tra lại redirect/connection target, chỉ HTTPS trong production, giới hạn port/size/time; dùng persistent queue với retry schedule, event ID ổn định và DLQ có replay/audit.

### A11 — P1 — Challenge liên kết ví/payout vẫn replay được

Backend nhận `message`/`challengeMessage` do client cung cấp và chỉ verify chữ ký; không có nonce do server phát, audience/domain, expiration hay one-time consumption. Vì vậy chữ ký cũ có thể được phát lại. Báo cáo cũ không hề xử lý đúng F16 gốc.

**Khắc phục:** endpoint phát challenge one-time gắn user, action, wallet, domain, chain, nonce, issued-at/expiry; lưu hash và consume atomically. Seller payout proof dùng challenge riêng, bắt step-up auth khi đổi ví.

### A12 — P1 — UI và chức năng sản phẩm vẫn thiếu so với PLAN

Các sửa có thật: số liệu Explore được tính động; layout campaign có class responsive tại [CampaignDetailPage.tsx:163](E:/apps/group-deal/frontend/src/pages/CampaignDetailPage.tsx:163); Web3 state đã có logic sync lại user. Tuy nhiên chưa có browser regression mới chứng minh toàn bộ luồng sau sửa.

Các thiếu sót còn thấy trực tiếp:

- Campaign 404/network error vẫn rơi vào màn hình “Đang tải…” tại [CampaignDetailPage.tsx:72](E:/apps/group-deal/frontend/src/pages/CampaignDetailPage.tsx:72); Explore vẫn biến lỗi API thành danh sách rỗng.
- Wizard vẫn có đúng 3 tier cố định, không có add/remove 2–5 tier.
- Duration UI chỉ 3/7/14/30 ngày, thiếu 24 giờ.
- UI luôn gửi `visibility: "PUBLIC"` tại [SellerDashboard.tsx:158](E:/apps/group-deal/frontend/src/pages/SellerDashboard.tsx:158).
- Chưa cấu hình early rebate theo phần trăm, cancellation policy, inventory behavior đầy đủ, protected file/account activation thực, ảnh chia sẻ, seller profile/metrics đầy đủ và notification/email.
- Dry-run chỉ kiểm tra mã hóa/giải mã payload mẫu; chưa thực thi adapter thật cho license inventory, file/link bảo vệ, account invite hoặc webhook sản phẩm.
- Widget iframe vẫn trỏ endpoint JSON, không phải widget HTML hoàn chỉnh.
- i18n vẫn trộn Việt/Anh; accessibility keyboard/focus chưa có audit.

### A13 — P1 — Vòng lặp unbounded và test coverage nghiệm thu vẫn thiếu

Finalize lặp toàn bộ order tại [GroupDealHub.sol:376](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:376); emergency cancel lặp toàn bộ order tại [dòng 721](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:721). Điều này trái yêu cầu xử lý theo từng phần và có thể vượt gas khi campaign lớn. Báo cáo cũ gộp F26–F28 thành “được fuzz cover” nhưng test không loại bỏ rủi ro thiết kế này.

Chưa có test thực cho: race inventory/early slot bằng transaction cạnh tranh; reorg/rebuild indexer; provider/indexer/backend/delivery outage xuyên suốt; authorization fallback khi DB stale; browser E2E nhiều account; Circle recovery/emergency dispute; backup restore; webhook DNS rebinding/redirect/DLQ; tải/gas campaign lớn.

### A14 — P2 — Tài liệu và báo cáo cũ mô tả vượt bằng chứng

README gọi sản phẩm “hoàn chỉnh”, Circle, Arc và privacy mạnh hơn implementation. Báo cáo cũ tuyên bố không còn mock/backdoor trong khi seed demo, MockUSDC, offline fallback và Admin Test Demo vẫn tồn tại. “AES-256-GCM chỉ buyer có thể giải mã” cũng không đúng threat model vì server giữ master key và endpoint server trả plaintext cho buyer đã auth.

**Khắc phục:** tài liệu phải phân biệt local simulation, Arc candidate và production; nêu rõ custody/key trust; chỉ dùng “PASS” khi có test/evidence đúng tầng.

## 3. Những phần đã cải thiện và có bằng chứng

Các thay đổi sau là tiến bộ thực, nhưng không đủ để nghiệm thu toàn dự án:

- Contract tests xác nhận cumulative buyer claim, cancel/settlement guard, sold-out final order rebate, fee v1 bằng 0 và canonical nested hash.
- OTP không còn trả plaintext trong API/log; dùng CSPRNG, hash+salt, cooldown và giới hạn thử theo email.
- DTO sanitizer bỏ private key và payout proof khỏi response được test.
- Public campaign API đã bỏ delivery template; support route có kiểm tra buyer/seller/operator.
- Frontend metrics không còn hardcode; CSS responsive đã được thêm.
- Backend, frontend và SDK build thành công; SDK sửa length check trước `timingSafeEqual`.
- Webhook có bước chặn literal private address và retry cơ bản.

Không nên chuyển các mục này thành “toàn bộ F01–F32 PASS”: nhiều mã chỉ được sửa một phần, bị gán sai hoặc chưa có integration/live evidence.

## 4. Ma trận bám sát PLAN.md

| Phần PLAN | Đánh giá | Bằng chứng chính |
|---|---|---|
| 1. Người dùng và giá trị sản phẩm | **Một phần** | Có buyer/seller UI và entitlement mẫu; chưa có sản phẩm/adapters thực, notification và vận hành hoàn chỉnh. |
| 2. Buyer | **Một phần, bị chặn** | Có checkout/order/claim UI và contract logic; ABI/runtime, Circle wallet, OTP delivery và Arc E2E chưa đạt. |
| 3. Seller | **Một phần** | Có hồ sơ/wizard/fulfillment/webhook; wizard thiếu nhiều cấu hình, dry-run giả lập, publish/delivery fail-open. |
| 4. Quy tắc chiến dịch | **Một phần** | Contract validate 2–5 tier và duration; UI/API chưa đầy đủ, chưa có cancellation policy/24h UI. |
| 5. Giá cuối và early rebate | **Khá ở contract, chưa đạt ứng dụng** | Local tests qua; chưa chứng minh app→Arc, race hoặc percentage UI. |
| 6. Danh tính, ví, quyền tài chính | **Không đạt** | Server-custodial wallet gắn nhãn Circle, default secrets, relay rộng, challenge replay. |
| 7. Giao hàng/refund/dispute | **Một phần, không đạt runtime** | Contract có primitives; backend có offline success, adapter giao hàng thực và emergency user-controlled chưa hoàn chỉnh. |
| 8. Claim/cancel/bảo toàn | **Một phần** | Một số lỗi accounting đã sửa; Security Multisig và batch processing chưa đạt. |
| 9. Nguồn sự thật/kiến trúc | **Không đạt** | DB vẫn tự quyết định success; ABI sai; indexer/reconcile không rebuild/reorg/verify đầy đủ. |
| 10. Vận hành/tích hợp/UX | **Không đạt** | JSON store, thiếu backup/migration/monitoring/email/DLQ; SDK và UI chỉ là nền tảng ban đầu. |
| 11. Kiểm thử/nghiệm thu | **Không đạt** | Root test fail; test E2E là local Hardhat; không có deployed Arc lifecycle evidence. |

## 5. Thứ tự khắc phục đề xuất

### Giai đoạn 0 — Chặn tuyên bố/deploy

1. Đổi trạng thái báo cáo/release thành chưa nghiệm thu; không dùng “Arc E2E” cho Hardhat test.
2. Sửa ABI bằng generated bindings và thêm integration test backend↔contract.
3. Xóa offline-success cho publish/delivery/settlement; thiết kế pending/reconciling.
4. Xóa Admin Test Demo; fail-fast secret; hoàn thiện email OTP và operator strong auth.
5. Chốt kiến trúc ví: Circle User-Controlled thật hoặc custodial được mô tả/kiểm soát đúng.

### Giai đoạn 1 — Nguồn sự thật và tài chính

1. Deploy candidate Arc Testnet đúng token/config; lưu manifest/tx evidence.
2. Viết lại indexer có deployment cursor, confirmation, rollback/rebuild và projection đúng claim/cancel.
3. Reconciliation có `UNVERIFIED`, đối chiếu state per campaign/order tại block cố định.
4. Security Multisig độc lập; paginate finalize/cancel; fuzz/invariant thêm race và batch.
5. Challenge one-time cho link/payout; relay policy/step-up/KMS.

### Giai đoạn 2 — Sản phẩm và vận hành

1. Database transaction, migration, backup/restore, immutable audit, retention.
2. Delivery adapters thật, evidence, notification/email, seller profile/metrics, review/support reply UI.
3. Hoàn thiện wizard 2–5 tier, 24h–30d, unlisted, early fixed/percent, cancellation policy, inventory.
4. Persistent webhook queue/DLQ và chống DNS rebinding/redirect SSRF.
5. Error/not-found/offline UX, i18n, accessibility, responsive/browser regression.

## 6. Điều kiện nghiệm thu lại

Chỉ chuyển sang ĐẠT khi có một release candidate bất biến và tất cả điều kiện sau có bằng chứng:

- `npm test`, build, lint/typecheck và package smoke chạy từ clean checkout bằng lệnh tài liệu hóa.
- Contract/backend dùng cùng generated ABI; test selector/interface tự động chặn drift.
- Một seller thật tạo, dry-run adapter thật và publish campaign trên Arc Testnet; tx/receipt/event xác minh được.
- Buyer dùng Circle User-Controlled EOA hoặc ví EVM liên kết mua thành công; pending/revert/provider outage hiển thị đúng.
- Finalize, delivery, decrypt, confirm, dispute, timeout, rebate/refund/seller claim chạy trên Arc và bảo toàn số dư.
- Indexer rebuild từ deployment block, chịu restart/reorg và đối soát `HEALTHY` tại block đã xác minh.
- Operator dùng strong auth; Security Multisig thực hiện cancel; owner/operator đơn lẻ bị từ chối.
- Backup restore, migration, webhook retry/DLQ, alert và incident drill có kết quả.
- Browser E2E chạy buyer/seller/operator riêng trên desktop/mobile, gồm error/offline/accessibility cốt lõi.

## 7. Quyết định nghiệm thu

**KHÔNG THÔNG QUA ở trạng thái hiện tại.**

Dự án bám PLAN ở mức có bộ khung và một phần logic contract tương đối tốt, nhưng chưa đáp ứng mục tiêu “sản phẩm web hoàn chỉnh có thể triển khai và vận hành cho người dùng trên Arc Testnet”. Rủi ro lớn nhất hiện nay không nằm ở giao diện mà ở đường nối ứng dụng–contract, mô hình ví/secret, trạng thái thành công giả, indexer/reconciliation và thiếu bằng chứng live. Các build và 15 contract test local là tín hiệu tích cực, không phải điều kiện nghiệm thu cuối.
