# KẾ HOẠCH THỰC THI TOÀN DIỆN DỰ ÁN GROUPDEAL

> **Tài liệu lịch sử:** lịch thực thi và trạng thái công việc trong tài liệu này đã được thay thế bởi [Kế hoạch thống nhất hoàn thiện GroupDeal v2.0](./KE_HOACH_HOAN_TAT_DU_AN.md). Giữ nội dung bên dưới để truy vết, không dùng checklist làm trạng thái nghiệm thu hiện tại.

**Căn cứ:** [BAO_CAO_KIEM_TRA_DU_AN.md](file:///e:/apps/group-deal/reports/BAO_CAO_KIEM_TRA_DU_AN.md) & [PLAN.md](file:///e:/apps/group-deal/PLAN.md)  
**Ngày khởi tạo:** 29/09/2026  
**Trạng thái chung:** Lưu lịch sử; xem kế hoạch v2.0 để thực thi.

---

## 1. Tuyên bố Đồng thuận với Báo cáo Kiểm tra
Chúng tôi **hoàn toàn đồng ý với 100% nội dung và đánh giá của [BAO_CAO_KIEM_TRA_DU_AN.md](file:///e:/apps/group-deal/reports/BAO_CAO_KIEM_TRA_DU_AN.md)**:
1. Dự án hiện **CHƯA ĐẠT** chuẩn nghiệm thu của PLAN.md. 
2. Các lỗ hổng P0 (OTP leak, cleartext private key, boolean claim khóa refund, cancel over-allocation) là các lỗi chết người cần chặn đứng ngay lập tức.
3. Hệ thống offchain (backend & worker) đang tự ý quyết định tài chính thay vì dựa trên nguồn sự thật smart contract trên Arc Testnet.
4. Kế hoạch thực thi này được lập ra để khắc phục triệt để từng phát hiện (từ F01 đến F32 và UI01 đến UI04) theo lộ trình kiểm soát chặt chẽ.

---

## 2. Lộ trình Thực thi Chi tiết theo Giai đoạn

### GIAI ĐOẠN A: Khóa Lỗ hổng P0 & Bảo mật Cốt lõi
*Mục tiêu: Đóng toàn bộ các lỗ hổng chiếm đoạt tài khoản, rò rỉ khóa ví và phá vỡ invariant bảo toàn quỹ Escrow.*

- [ ] **A.1 (F01 - P0) Bảo mật hệ thống OTP & Loại bỏ Admin Bypass**
  - [ ] Sửa [authService.ts](file:///e:/apps/group-deal/backend/src/services/authService.ts): Dùng CSPRNG (`crypto.randomInt`), hash OTP trước khi lưu, rate-limit 5 lần thử, TTL 5 phút.
  - [ ] Sửa [authRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/authRoutes.ts): Không bao giờ trả mã OTP trong response; xóa log console OTP.
  - [ ] Sửa [App.tsx](file:///e:/apps/group-deal/frontend/src/App.tsx): Xóa bỏ nút shortcut "Đăng nhập Admin (Test Demo)" và cơ chế auto-fill OTP.
  - [ ] Bỏ seed tài khoản operator mặc định khỏi runtime.

- [ ] **A.2 (F02 - P0) Bảo vệ Ví & Ngăn chặn Lộ Private Key**
  - [ ] Sửa [authService.ts](file:///e:/apps/group-deal/backend/src/services/authService.ts) & [operatorRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/operatorRoutes.ts): Loại bỏ hoàn toàn trường `encryptedPrivateKey` / `privateKey` khỏi mọi DTO trả về frontend (`/me`, `/bind`, `/sellers`).
  - [ ] Mã hóa private key bằng AES-256-GCM với Master Key chuyên dụng lưu trong biến môi trường bí mật; frontend không nắm giữ private key.

- [ ] **A.3 (F03 - P0) Smart Contract: Đổi Claim Boolean sang Cumulative Claim**
  - [ ] Sửa [GroupDealHub.sol](file:///e:/apps/group-deal/contracts/contracts/GroupDealHub.sol): Đổi `mapping(uint256 => bool) public buyerClaimed;` thành `mapping(uint256 => uint256) public buyerClaimedAmount;`.
  - [ ] Cập nhật hàm `claimBuyerFunds`: Tính `claimable = rebateAllocated + buyerRefundAllocated - buyerClaimedAmount`. Cho phép buyer rút nhiều lần khi phát sinh refund sau khi đã claim rebate.

- [ ] **A.4 (F04 - P0) Smart Contract: Ngăn chặn Double Allocation khi Cancel**
  - [ ] Sửa [GroupDealHub.sol](file:///e:/apps/group-deal/contracts/contracts/GroupDealHub.sol): Khi chiến dịch bị `CANCELLED`, khóa mọi chuyển trạng thái của order.
  - [ ] Cấm `confirmReceipt`, `settleUndisputedOrder`, `resolveDispute` thực hiện phân bổ mới cho seller nếu order/campaign đã bị hủy. Bảo đảm bất biến: $\text{allocated} \le \text{committedGross}$.

- [ ] **A.5 (F14, F15, F17 - P1) Vá IDOR, Lọc DTO & Quản lý Secret**
  - [ ] Sửa [orderRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/orderRoutes.ts): Thêm middleware phân quyền sở hữu order cho Support Thread (chỉ buyer, seller của campaign hoặc operator mới có quyền xem/nhắn).
  - [ ] Sửa [campaignRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/campaignRoutes.ts) & [publicRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/publicRoutes.ts): Ẩn trường `deliveryContentTemplate` và chữ ký payout khỏi API public.
  - [ ] Tách `CAMPAIGN_IDENTITY_SECRET` riêng, không dùng chung `JWT_SECRET`.

---

### GIAI ĐOẠN B: Chuẩn hóa Smart Contract & Accounting
*Mục tiêu: Đảm bảo toàn bộ quy tắc kinh tế, chia thưởng rebate, và điều khoản chiến dịch đạt chuẩn bảo toàn $100\%$.*

- [ ] **B.1 (F05 - P1) Đưa Sold-out Order cuối cùng vào Rebate**
  - [ ] Sửa [GroupDealHub.sol](file:///e:/apps/group-deal/contracts/contracts/GroupDealHub.sol): Tạo order và cập nhật số lượng trước khi gọi `_finalizeCampaignInternal`.
- [ ] **B.2 (F06 - P1) Chuyển Finalize sang O(1) & Lazy Rebate Calculation**
  - [ ] Tách việc tính rebate ra khỏi hàm `finalizeCampaign`. Khi finalize chỉ lưu `finalClearingPrice` ($O(1)$ gas). Tính rebate trực tiếp khi buyer thực hiện claim.
- [ ] **B.3 (F07 - P1) Khóa Cứng Phí Nền Tảng 0 bps**
  - [ ] Thêm `require(terms.platformFeeBps == 0, "Fee must be 0")` trong `createCampaign`.
- [ ] **B.4 (F08 - P1) Tách Biệt Role Security Multisig**
  - [ ] Tách quyền `emergencyCancelCampaign` gán riêng cho `securityAuthority` (Multisig), không dùng chung `onlyOperator`.
- [ ] **B.5 (F10 - P1) Canonical Recursive Terms Hash**
  - [ ] Sửa [crypto.ts](file:///e:/apps/group-deal/backend/src/utils/crypto.ts): Băm chuẩn hóa đệ quy toàn bộ cấu trúc terms bao gồm `tiers` (`threshold`, `price`), metric, SLA, cancellation policy.
- [ ] **B.6 (F24, F26 - P1) Buy Authorization & Early Rebate Cap**
  - [ ] Ký EIP-712 đúng số lượng `quantity` buyer mua.
  - [ ] Ràng buộc Early Rebate chỉ áp dụng cho 1 đơn vị đầu tiên và cap lợi ích không vượt quá giá mua của đơn vị đó.
- [ ] **B.7 Cập nhật Reference Accounting Model**
  - [ ] Đồng bộ hóa [referenceModel.ts](file:///e:/apps/group-deal/backend/src/accounting/referenceModel.ts) khớp chuẩn với hợp đồng.

---

### GIAI ĐOẠN C: Kết nối Offchain vào Nguồn sự thật Onchain
*Mục tiêu: Chuyển toàn bộ các luồng giao dịch, giao hàng, đối soát từ DB-only sang gửi transaction onchain thật.*

- [ ] **C.1 (F09, F11 - P1) Publish & Delivery/Dispute Onchain Integration**
  - [ ] Sửa [campaignRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/campaignRoutes.ts): Xuất bản chiến dịch gửi transaction `createCampaign` lên chain, lấy ID từ event.
  - [ ] Sửa [deliveryService.ts](file:///e:/apps/group-deal/backend/src/services/deliveryService.ts): Gửi `recordDelivery` lên chain khi giao hàng.
  - [ ] Sửa [disputeService.ts](file:///e:/apps/group-deal/backend/src/services/disputeService.ts) & worker: Tự động gửi tx `settleUndisputedOrder`, `claimDeliveryBreach`, `resolveDispute`.
- [ ] **C.2 (F12 - P1) Xây dựng Indexer Service Bền vững**
  - [ ] Sửa [indexerService.ts](file:///e:/apps/group-deal/backend/src/services/indexerService.ts): Bổ sung Event Journal, cursor block, checkpoint chống duplicate; xử lý đầy đủ 10 events.
- [ ] **C.3 (F13 - P1) Reconciler Đối soát Block-level Thật**
  - [ ] Sửa [reconciliationService.ts](file:///e:/apps/group-deal/backend/src/services/reconciliationService.ts): Đối chiếu số dư token trong hợp đồng với tổng nợ chưa rút theo từng block.
- [ ] **C.4 (F18, F19 - P1) Đồng bộ Arc Testnet Config**
  - [ ] Cấu hình đúng ChainId `5042002`, RPC `https://rpc.testnet.arc.io`, explorer.
  - [ ] Phân định Native Gas USDC (18 decimals) vs Test USDC ERC20 (6 decimals). Sửa Vite proxy forwarding `/health`.
- [ ] **C.5 (F20 - P1) Transaction Tracker Realtime**
  - [ ] Sửa [TxTrackerModal.tsx](file:///e:/apps/group-deal/frontend/src/components/TxTrackerModal.tsx) & [Web3Context.tsx](file:///e:/apps/group-deal/frontend/src/context/Web3Context.tsx): Lấy hash ngay sau broadcast, theo dõi pending/revert chính xác.

---

### GIAI ĐOẠN D: Hoàn thiện Sản phẩm, Giao hàng & Trải nghiệm UX
*Mục tiêu: Đảm bảo giao hàng số thực tế, vá SSRF webhook, sửa lỗi responsive mobile và chuẩn hóa i18n.*

- [ ] **D.1 (F21 - P1) Adapters Giao hàng Thực tế & Dry-run Thật**
  - [ ] Triển khai 3 adapter: License Key kho nguyên tử, Signed URL File, Webhook/API activation.
  - [ ] Sửa nút Dry-run [SellerDashboard.tsx](file:///e:/apps/group-deal/frontend/src/pages/SellerDashboard.tsx): Kiểm tra status thật, chặn publish nếu dry-run lỗi.
- [ ] **D.2 (F22 - P1) Vá SSRF Webhook & Thêm Durable Retry**
  - [ ] Sửa [webhookService.ts](file:///e:/apps/group-deal/backend/src/services/webhookService.ts): Chặn loopback/private/metadata IP. Thêm hàng đợi retry exponential + DLQ.
- [ ] **D.3 (F23 - P1) Nâng cấp Cơ sở Dữ liệu & Lưu vết**
  - [ ] Bổ sung cơ chế mutex / SQLite transaction chống race condition ghi file; append-only audit log.
- [ ] **D.4 (UI01–UI04, F30 - P1/P2) Sửa Giao diện Mobile & Trạng thái**
  - [ ] Sửa [ExplorePage.tsx](file:///e:/apps/group-deal/frontend/src/pages/ExplorePage.tsx): Xóa hardcode $42,850.
  - [ ] Sửa [CampaignDetailPage.tsx](file:///e:/apps/group-deal/frontend/src/pages/CampaignDetailPage.tsx): Sửa responsive mobile 375px (tránh tràn 879px).
  - [ ] Tách biệt rõ loading, 404 not found, network error.
  - [ ] Bổ sung dịch tiếng Anh/Việt đầy đủ.
- [ ] **D.5 (F29, F31 - P2/P1) Hoàn thiện SDK & Verification Badge**
  - [ ] Bổ sung `tsconfig.json` cho SDK, sửa lỗi `timingSafeEqual`, build thành công `.d.ts`.
  - [ ] Tách bạch badge xác minh Seller vs Quyền phân phối sản phẩm theo từng chiến dịch.

---

### GIAI ĐOẠN E: Kiểm thử Toàn diện & Nghiệm thu trên Arc Testnet
*Mục tiêu: Chạy toàn bộ các ca kiểm thử hồi quy, differential fuzzing và thực thi hành trình live trên Arc Testnet.*

- [ ] **E.1 Chạy lại toàn bộ ca kiểm thử trong [audit-repro.cjs](file:///e:/apps/group-deal/reports/audit-repro.cjs)** (kết quả mong đợi: tất cả các lỗi F03-F10 đã được giải quyết).
- [ ] **E.2 Bộ kiểm thử Stateful Differential Fuzzing** giữa Smart Contract và Reference Model.
- [ ] **E.3 Thực thi Live E2E trên Arc Testnet** với 3 ví độc lập (Seller, Buyer 1, Buyer 2): Tạo $\rightarrow$ Commit $\rightarrow$ Finalize $\rightarrow$ Giao hàng $\rightarrow$ Xác nhận $\rightarrow$ Claim $\rightarrow$ Đối soát.
- [ ] **E.4 Lập Hồ sơ Nghiệm thu Bàn giao (Acceptance Dossier).**

---
*(Kế hoạch này sẽ được cập nhật liên tục tiến độ thực thi từng bước)*
