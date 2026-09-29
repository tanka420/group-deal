# BÁO CÁO THẨM TRA NGHIỆM THU CUỐI — GROUPDEAL

**Ngày thẩm tra:** 29/09/2026

**Workspace:** `E:\apps\group-deal`

**Git HEAD:** `571593761d41024638cbc85eb3457697dcfaabdb`

**Trạng thái workspace:** Có nhiều thay đổi chưa commit và tệp chưa được theo dõi; chưa có release candidate bất biến để nghiệm thu.

**Tài liệu đối chiếu:** [PLAN.md](../PLAN.md), [BAO_CAO_KIEM_TRA_DU_AN.md](./BAO_CAO_KIEM_TRA_DU_AN.md), [BAO_CAO_NGHIEM_THU_VA_KHAC_PHUC.md](./BAO_CAO_NGHIEM_THU_VA_KHAC_PHUC.md), [BAO_CAO_KHAC_PHUC_TOAN_DIEN.md](./BAO_CAO_KHAC_PHUC_TOAN_DIEN.md).

## 1. Quyết định

**KHÔNG ĐỒNG Ý TUYÊN BỐ DỰ ÁN ĐÃ HOÀN THÀNH. KHÔNG NGHIỆM THU.**

Phiên bản hiện tại chỉ có thể được công nhận là **mốc khắc phục cục bộ đang phát triển**. Chưa đủ điều kiện gọi là **Arc Testnet Deployment Candidate**, càng chưa đủ điều kiện gọi là sản phẩm hoàn thành theo `PLAN.md`.

Lý do quyết định không nằm ở việc giao diện chưa đẹp hoặc thiếu một vài test nhỏ. Các điều kiện bắt buộc của `PLAN.md` vẫn chưa được chứng minh hoặc còn bị vi phạm trực tiếp:

1. Chưa có hồ sơ triển khai và hành trình live trên Arc Testnet.
2. Một số luồng vẫn có thể ghi trạng thái tài chính thành công ở DB mà không có bằng chứng onchain đúng nghiệp vụ.
3. Ví được gọi là “Circle User-Controlled EOA” vẫn là khóa do backend tự tạo, lưu và sử dụng.
4. Cơ chế chống replay vẫn có nhánh bỏ qua challenge; frontend chưa dùng endpoint challenge mới.
5. `finalizeCampaign` và `emergencyCancelCampaign` vẫn lặp toàn bộ order, trái yêu cầu xử lý theo từng phần.
6. Indexer chưa rollback/rebuild an toàn theo block hash/reorg; reconciliation chưa đối chiếu state từng campaign/order tại cùng một block.
7. Hạ tầng dữ liệu, webhook, email, xác thực mạnh, backup/restore, monitoring và incident drill chưa đạt yêu cầu vận hành.
8. UI và cấu hình sản phẩm vẫn thiếu các hành vi bắt buộc; chưa có browser E2E sau khắc phục.

## 2. Kết luận khi đối chiếu bốn tài liệu

### 2.1. `BAO_CAO_KHAC_PHUC_TOAN_DIEN.md` không tự tuyên bố dự án hoàn thành

Phần kết luận của báo cáo này chỉ ghi **“ĐỦ ĐIỀU KIỆN CHUYỂN TIẾP SANG GIAI ĐOẠN TRIỂN KHAI TESTNET LIVE”**. Trong khi đó, `PLAN.md` chỉ cho nghiệm thu khi seller, buyer và operator hoàn thành hành trình thật trên bản đã triển khai, tiền được quyết toán/claim/dispute/refund đúng, indexer đối soát được và monitoring hoạt động.

Vì vậy, ngay cả nếu toàn bộ nội dung báo cáo khắc phục là đúng, kết luận hợp lệ tối đa cũng chỉ là “được phép bước sang giai đoạn kiểm chứng live”, không phải “hoàn thành dự án”.

### 2.2. Tuyên bố “A01–A14 đã khắc phục toàn bộ” không khớp chính nội dung báo cáo

Bảng tổng hợp của báo cáo khắc phục chỉ trình bày A01–A07, A09, A11 và A13. Bốn hạng mục A08, A10, A12 và A14 không có dòng kết quả tương ứng:

- A08: bằng chứng triển khai/E2E Arc Testnet;
- A10: webhook SSRF và delivery durability;
- A12: UI/chức năng sản phẩm;
- A14: tài liệu mô tả vượt bằng chứng.

Do đó không thể suy ra “toàn bộ A01–A14 PASS” từ bảng bằng chứng được cung cấp.

### 2.3. Một số tuyên bố quan trọng bị mã nguồn hiện tại bác bỏ

| Tuyên bố trong báo cáo khắc phục | Kết quả thẩm tra | Bằng chứng |
|---|---|---|
| A02: đã xóa hoàn toàn fail-open/offline success | **Không đúng; còn điểm chặn** | Draft được gán sẵn `onchainCampaignId` cục bộ tại [campaignRoutes.ts](../backend/src/routes/campaignRoutes.ts#L99). Nhánh publish dùng `txHash` chỉ kiểm tra receipt thành công, không bắt buộc event đúng contract/terms; nếu không đọc được event vẫn có thể giữ ID cục bộ rồi đặt `ACTIVE` tại [campaignRoutes.ts](../backend/src/routes/campaignRoutes.ts#L272). Delivery cũng chỉ kiểm tra receipt chung tại [deliveryService.ts](../backend/src/services/deliveryService.ts#L69). Confirm/dispute/auto-settlement vẫn ghi DB trực tiếp tại [deliveryService.ts](../backend/src/services/deliveryService.ts#L139), [disputeService.ts](../backend/src/services/disputeService.ts#L9), [index.ts](../backend/src/index.ts#L180). |
| A03: relayer đã an toàn | **Một phần** | Allowlist target/selector là cải thiện thật. Nhưng backend vẫn giải mã private key và ký/gửi giao dịch tại [walletRoutes.ts](../backend/src/routes/walletRoutes.ts#L129), đồng thời endpoint `sign-message` ký chuỗi tùy ý. Đây vẫn là ví custodial do server kiểm soát, không phải Circle User-Controlled. Test relayer tự chép lại hàm validation thay vì gọi route thật tại [wallet_relay_security.test.ts](../backend/test/wallet_relay_security.test.ts#L9), nên có thể drift khỏi production code. |
| A05: Security Authority độc lập | **Một phần, chưa đạt PLAN** | Modifier đã chỉ chấp nhận `securityAuthority`, nhưng constructor vẫn gán authority bằng operator tại [GroupDealHub.sol](../contracts/contracts/GroupDealHub.sol#L75); owner có thể đổi trực tiếp một bước tại [GroupDealHub.sol](../contracts/contracts/GroupDealHub.sol#L98). Deploy script không cấu hình multisig riêng. Không có bằng chứng multisig live, two-step rotation hoặc runbook. |
| A06: indexer đã đúng và bền vững | **Một phần** | Có deployment cursor và journal, nhưng không lưu/kiểm block hash, confirmation depth hoặc rollback projection. Khi head lùi, code chỉ lùi cursor; journal cũ vẫn làm log bị skip tại [indexerService.ts](../backend/src/services/indexerService.ts#L55). `FundsClaimed` vẫn đánh dấu toàn bộ order phù hợp recipient/campaign đã claim dù event không mang order ID tại [indexerService.ts](../backend/src/services/indexerService.ts#L286). |
| A07: reconciliation trung thực | **Đóng lỗi “HEALTHY khi RPC down”, nhưng chưa đạt nghiệm thu** | `UNVERIFIED` khi RPC lỗi là đúng. Tuy nhiên service chỉ so aggregate DB với balance token, không đọc claimable/state từng campaign/order tại một block cố định; DB và projection cùng sai vẫn có thể cho kết quả “HEALTHY” tại [reconciliationService.ts](../backend/src/services/reconciliationService.ts#L21). |
| A09: zero data loss/storage đã đạt | **Chỉ đóng lỗi parse-wipe** | File hỏng được giữ lại và process dừng là cải thiện. Store vẫn là một JSON file, không transaction đa bản ghi, không lock đa process, migration, PITR, backup/restore drill hay audit bất biến tại [store.ts](../backend/src/db/store.ts#L214). |
| A11: challenge nonce chống replay đã cưỡng chế | **Không đúng; còn bypass** | Nếu không tìm thấy challenge và message không chứa marker mới, `consumeWalletChallenge` trả về thành công tại [authService.ts](../backend/src/services/authService.ts#L184). Frontend vẫn tự tạo message cũ và ký trước khi gọi bind/profile tại [AuthContext.tsx](../frontend/src/context/AuthContext.tsx#L97). Test chỉ phủ đường challenge mới nên không phát hiện nhánh bypass. |
| A13: đã loại bỏ DoS gas do loop unbounded | **Không đúng** | `finalizeCampaign` vẫn lặp toàn bộ `_campaignOrderIds` tại [GroupDealHub.sol](../contracts/contracts/GroupDealHub.sol#L366); `emergencyCancelCampaign` cũng lặp toàn bộ order tại [GroupDealHub.sol](../contracts/contracts/GroupDealHub.sol#L762). Việc thêm `allocateRebatesBatch` không giúp nếu finalize/cancel vẫn phải hoàn thành vòng lặp toàn cục trước. |
| “Full Lifecycle E2E on Arc Network” | **Tên test gây hiểu nhầm** | Test dùng Hardhat signers và tự deploy `MockUSDC` trong `beforeEach` tại [GroupDealE2ESimulation.test.ts](../contracts/test/GroupDealE2ESimulation.test.ts#L70). Đây là local contract simulation, không phải app/API/browser E2E và không phải Arc Testnet. |
| Contracts compilation PASS bằng lệnh tài liệu hóa | **Không tái lập trực tiếp** | `npm run compile` thất bại với lỗi Hardhat `EEXIST` trên môi trường hiện tại. Compile chỉ chạy được sau khi đặt `LOCALAPPDATA` sang thư mục tạm; workaround mới chỉ được đóng gói cho test, chưa áp dụng cho script compile. |

## 3. Kết quả chạy kiểm tra độc lập

| Kiểm tra | Kết quả | Cách diễn giải đúng |
|---|---:|---|
| `npm test` | **PASS** | 15 contract test local Hardhat và các script backend hiện có đều qua. Không phải Arc live E2E, browser E2E hay full acceptance suite. |
| `npm run backend:build` | **PASS** | TypeScript backend biên dịch. |
| `npm run frontend:build` | **PASS có cảnh báo** | Bundle JS 580,97 kB, vượt ngưỡng cảnh báo 500 kB. |
| `npm run build:sdk` | **PASS** | SDK sinh được JS và declaration; chưa có consumer/package smoke test. |
| `git diff --check` | **PASS có cảnh báo line ending** | Không có whitespace error; có cảnh báo LF sẽ đổi thành CRLF. |
| `npm run compile` | **FAIL** | Lỗi `EEXIST` tại Hardhat data directory. |
| `LOCALAPPDATA=<temp>; npm run compile` | **PASS** | Xác nhận source/artifact hiện tại có thể compile khi áp dụng workaround môi trường. |
| Deployment metadata | **LOCAL** | [shared/contracts.json](../shared/contracts.json) ghi `network: hardhat`, `chainId: 31337`. |
| Arc deployment dossier | **KHÔNG CÓ TRONG HỒ SƠ** | Không có manifest Arc bất biến, deployment receipt, verified address/bytecode, tx hash cho hành trình, checkpoint đối soát hoặc explorer evidence. |
| Dependency audit hiện thời | **CHƯA XÁC MINH ĐỦ** | Audit production dependencies của contracts trả 0 vulnerability; backend/frontend không lấy được advisory hiện thời trong môi trường kiểm tra. Không được tính PASS. |
| Clean checkout/release candidate | **FAIL** | Working tree có hàng chục file modified/untracked; kết quả hiện tại chưa gắn với commit/tag bất biến. |

## 4. Ma trận trạng thái A01–A14 sau thẩm tra

| Mã | Trạng thái | Nhận định |
|---|---:|---|
| A01 — ABI drift | **Đạt cục bộ** | 10 selector được đối chiếu với artifact hiện có. Cần sinh bindings từ artifact và chạy integration test sau clean compile để đóng hoàn toàn rủi ro artifact cũ/manual ABI. |
| A02 — fail-open/offline success | **Không đạt** | Publish bằng txHash, delivery receipt chung, confirm/dispute/worker DB-only vẫn cho phép projection thành công không dựa trên event nghiệp vụ đã xác minh. |
| A03 — relayer/custody | **Không đạt PLAN** | Policy relayer tốt hơn, nhưng mô hình vẫn server-custodial và có signing oracle; không phải Circle User-Controlled. |
| A04 — secret/backdoor/auth | **Một phần** | Nút admin demo đã bỏ và production fail-fast một số secret. Vẫn có default deployer key cho Arc config, seed operator production, chưa có email OTP thật và MFA/step-up. |
| A05 — Security Multisig | **Một phần** | Modifier tách quyền nhưng cấu hình/deployment/lifecycle multisig chưa tồn tại. |
| A06 — indexer | **Không đạt** | Chưa confirmation/reorg rollback/rebuild proof; projection claim còn mơ hồ. |
| A07 — reconciliation | **Một phần** | Đã có `UNVERIFIED`; chưa đối chiếu contract state chi tiết tại block cố định. |
| A08 — Arc live readiness | **Không đạt** | Chỉ có local Hardhat metadata và simulation. |
| A09 — storage/operations | **Không đạt** | Chỉ sửa corruption handling; kiến trúc dữ liệu và phục hồi vận hành chưa đáp ứng. |
| A10 — webhook | **Không đạt** | Chặn literal private IP nhưng chưa DNS resolve/pinning, redirect policy, HTTPS-only production, durable queue hoặc DLQ. |
| A11 — signature replay | **Không đạt** | Challenge mới chưa bắt buộc; frontend dùng message cũ; nonce nằm trong `Map` process-local. |
| A12 — UI/product completeness | **Không đạt** | Vẫn 3 tier cố định, không có 24h, luôn PUBLIC, thiếu early rebate %, cancellation policy; loading/404/network còn nhập nhằng; chưa có browser regression mới. |
| A13 — gas/batch | **Không đạt** | Hai vòng lặp toàn campaign còn nguyên; chưa có gas-bound/load test campaign lớn. |
| A14 — docs/evidence truthfulness | **Không đạt** | README và tên test vẫn gọi sản phẩm/Arc mạnh hơn bằng chứng; báo cáo khắc phục đánh dấu triệt để quá phạm vi test. |

## 5. Ma trận bám sát `PLAN.md`

| Phần PLAN | Đánh giá hiện tại | Điểm chặn chính |
|---|---:|---|
| 1. Người dùng và giá trị sản phẩm | **Một phần** | Có khung buyer/seller nhưng delivery adapter thực, notification và vận hành sản phẩm số chưa hoàn chỉnh. |
| 2. Buyer | **Không đạt** | OTP chưa gửi email thật; ví nhúng không phải Circle User-Controlled; pending/revert/reload chưa được chứng minh; các quyền tài chính chưa có live E2E. |
| 3. Seller | **Một phần** | Publish/delivery đã có đường onchain nhưng verification chưa đủ chặt; dry-run chỉ kiểm encryption; wizard và entitlement adapter thiếu. |
| 4. Quy tắc chiến dịch | **Một phần** | Contract validate khá hơn; UI/API chưa đầy đủ, terms hash chưa bao trùm toàn bộ điều khoản vật chất. |
| 5. Giá cuối/early rebate | **Khá ở contract local** | Local tests qua; chưa có race test thực và chưa chứng minh qua app→Arc. |
| 6. Danh tính/ví/quyền tài chính | **Không đạt** | Custodial wallet gắn nhãn Circle, challenge bypass, authorization vẫn ký `maxQuantity` thay vì quantity yêu cầu và fallback khi RPC lỗi. |
| 7. Giao hàng/refund/dispute | **Không đạt runtime** | Confirm/dispute/SLA worker còn DB-only; emergency path không do buyer kiểm soát khi backend ngừng hoạt động. |
| 8. Claim/cancel/bảo toàn | **Một phần** | Một số invariant local đã sửa; cancel loop unbounded và Security Multisig live chưa đạt. |
| 9. Nguồn sự thật/kiến trúc | **Không đạt** | DB vẫn tự ghi state tài chính; indexer/reconcile chưa đủ rebuild/reorg/prove. |
| 10. Vận hành/tích hợp/UX | **Không đạt** | JSON store, thiếu migration/backup/PITR/monitoring/email/DLQ/MFA; UI và SDK chưa đủ hồ sơ nghiệm thu. |
| 11. Kiểm thử/nghiệm thu | **Không đạt** | Không có clean candidate, browser/API E2E, outage/reorg/restore/load test và live Arc dossier. |

## 6. Các điểm chặn phát hành phải đóng trước khi triển khai public Arc Testnet

### B01 — P0 — Xóa toàn bộ đường thành công DB-only và receipt không ràng buộc nghiệp vụ

Mọi thay đổi `ACTIVE`, `DELIVERED`, `CONFIRMED`, `DISPUTED`, `RESOLVED`, refund hoặc seller allocation phải xuất phát từ event đã xác minh: đúng chain, đúng contract, đúng tx target, đúng selector, đúng campaign/order/principal/terms/proof và đủ confirmation. API chỉ tạo intent `PENDING_*`; indexer là nơi dựng projection.

### B02 — P0 — Chốt lại mô hình ví theo đúng PLAN

Tích hợp Circle User-Controlled Wallet theo lifecycle chính thức hoặc loại bỏ tuyên bố Circle và thay đổi phạm vi sản phẩm. Theo `PLAN.md`, phương án nghiệm thu là tích hợp Circle User-Controlled thật. Backend không được tiếp tục tạo/lưu/giải mã private key người dùng hoặc ký arbitrary message.

### B03 — P0 — Bắt buộc server challenge và strong auth

Xóa nhánh legacy bypass; challenge phải gắn user, action, wallet, domain/audience, chain, issued-at, expiry và nonce; consume trong transaction bền vững. Frontend phải xin challenge trước khi ký. OTP phải được gửi qua provider thật; operator/seller sensitive actions cần MFA/step-up; seed demo bị vô hiệu trong production.

### B04 — P1 — Loại vòng lặp toàn campaign

Finalize/cancel phải O(1) hoặc khởi tạo trạng thái rồi phân bổ lazy/batch độc lập; không giao dịch bắt buộc nào lặp toàn bộ buyer. Cần gas-bound test với quy mô lớn và chứng minh không kẹt claim.

### B05 — P1 — Hoàn thiện source-of-truth, data và operations

Indexer phải có confirmation depth, block hash, rollback/replay, journal theo chain/contract/tx/logIndex và rebuild sạch. Reconciliation phải đọc contract state ở block cố định. Dữ liệu phải chuyển sang store transactional có migration/backup/restore; webhook dùng durable queue/DLQ và SSRF kiểm DNS/redirect/egress.

### B06 — P1 — Hoàn thiện sản phẩm và hồ sơ live

Hoàn thiện delivery adapters, seller wizard, notification, error/offline UX, i18n/accessibility và browser E2E. Sau đó tạo release candidate sạch, deploy Arc đúng token/config, chạy hành trình live đa ví và lập acceptance dossier.

## 7. Điều kiện đổi quyết định sang “ĐẠT”

Chỉ nghiệm thu khi cùng một commit/tag bất biến thỏa tất cả điều kiện sau:

- Clean checkout chạy được compile, test, build, typecheck/lint và package smoke bằng đúng lệnh tài liệu hóa.
- Không còn private key user trong backend; Circle User-Controlled và external EVM wallet đều có luồng thật, recovery và policy được test.
- Không route/worker nào tự quyết định state tài chính; projection có thể rebuild hoàn toàn từ chain.
- Finalize/cancel/claim không bị giới hạn bởi số order toàn campaign.
- Security Authority là multisig đã triển khai; owner/operator đơn lẻ không hủy được campaign.
- Database migration, backup/restore, audit, alert, webhook retry/DLQ và incident drill có bằng chứng.
- Browser E2E bao phủ buyer/seller/operator trên desktop/mobile, gồm pending/revert/outage/reload/error/accessibility cốt lõi.
- Arc Testnet dossier có chain ID, RPC/token, contract address, bytecode/artifact hash, deployment block/receipt, role addresses và tx hash của create→commit→finalize→delivery→confirm/dispute/timeout→claim/refund→reconcile.
- Một lần review độc lập xác nhận không còn P0/P1 mở và tài liệu không mô tả vượt bằng chứng.

## 8. Kết luận cuối

`BAO_CAO_KHAC_PHUC_TOAN_DIEN.md` phản ánh một số sửa lỗi có giá trị thật: ABI cốt lõi đã đồng bộ hơn, root test chạy được, một số invariant contract đã có test, publish/delivery có đường fail-closed tốt hơn, reconciliation không còn báo `HEALTHY` khi RPC tắt, và JSON corruption không bị âm thầm xóa.

Tuy nhiên, các cải thiện này **không đủ để lật kết luận “CHƯA ĐẠT”** của hai báo cáo kiểm tra/nghiệm thu trước. Nhiều điểm chặn vẫn mở, một số test không kiểm tra chính code production, và bằng chứng Arc live hoàn toàn chưa có trong hồ sơ. Quyết định đúng tại mốc này là **tiếp tục khắc phục theo kế hoạch mới, không công bố hoàn thành và không mở cho người dùng thật**.
