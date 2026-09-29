# BÁO CÁO NGHIỆM THU GATE G1: CƠ CHẾ VÍ, XÁC THỰC VÀ BẢO TOÀN TRẠNG THÁI TÀI CHÍNH
**Dự án:** GroupDeal trên Arc Testnet  
**Giai đoạn:** Gate G1 (Authentication, Non-Custodial Wallets, Invariant Verification, Anti-Replay)  
**Thời gian thực thi:** 2026-09-29  
**Branch:** `codex/arc-candidate`  
**Trạng thái nghiệm thu:** **PASS (ĐẠT CHUẨN 100%)**

---

## 1. MỤC TIÊU GATE G1 ĐÃ HOÀN THÀNH

Theo kế hoạch tại [reports/KE_HOACH_HOAN_TAT_DU_AN.md](file:///e:/apps/group-deal/reports/KE_HOACH_HOAN_TAT_DU_AN.md), Gate G1 yêu cầu xóa bỏ hoàn toàn cơ chế ví lưu ký server, bảo đảm chữ ký không ủy quyền (non-custodial), thiết lập challenge nonce chống replay, loại bỏ toàn bộ thay đổi trạng thái tài chính DB-only, và triển khai bộ xác minh giao dịch onchain fail-closed.

---

## 2. CHI TIẾT CÁC HẠNG MỤC VÀ BẰNG CHỨNG KIỂM CHỨNG

### G1.1 — One-time Challenge Nonce & Anti-Replay
- **Vấn đề trước:** Backend cho phép bypass challenge nếu không có challenge message; chữ ký có thể bị replay hoặc dùng chéo tài khoản.
- **Giải pháp triển khai:**
  - Triển khai `AuthService.issueWalletChallenge` phát hành challenge có cấu trúc chuẩn: `userId`, `action` (`LINK_WALLET` | `SELLER_PAYOUT`), `walletAddress`, `chainId`, `origin`, `nonce` ngẫu nhiên và `expiresAt` (5 phút TTL).
  - Triển khai `AuthService.consumeWalletChallenge` bắt buộc kiểm tra và xóa nguyên tử (atomic consumption) challenge ngay sau khi xác thực thành công.
  - Cập nhật [frontend/src/context/AuthContext.tsx](file:///e:/apps/group-deal/frontend/src/context/AuthContext.tsx) gọi API `/api/auth/wallet/challenge` trước khi yêu cầu ví người dùng ký.
- **Bằng chứng kiểm chứng:**
  - File test: [backend/test/wallet_challenge_replay.test.ts](file:///e:/apps/group-deal/backend/test/wallet_challenge_replay.test.ts) và [backend/test/gate_g1_verification.test.ts](file:///e:/apps/group-deal/backend/test/gate_g1_verification.test.ts).
  - Kết quả:
    - ✔ Server-side challenge nonce successfully issued
    - ✔ Legitimate one-time challenge successfully verified and consumed
    - ✔ Replay attack prevented: re-using the same signature/message was strictly blocked!
    - ✔ Cross-Account protection verified: Challenge scoped strictly to userId + wallet

---

### G1.2 — Xóa Bỏ Hoàn Toàn Khóa Lưu Ký (Non-Custodial Guarantee)
- **Vấn đề trước:** Backend tự sinh private key người dùng bằng `ethers.Wallet.createRandom()`, mã hóa và lưu trữ `encryptedPrivateKey` trong cơ sở dữ liệu, có endpoint ký tùy ý `/api/wallet/sign-message`.
- **Giải pháp triển khai:**
  - Xóa bỏ hoàn toàn `ethers.Wallet.createRandom()` cho user trong toàn bộ codebase backend.
  - Xóa bỏ trường `encryptedPrivateKey` và logic giải mã khóa user trong [backend/src/services/authService.ts](file:///e:/apps/group-deal/backend/src/services/authService.ts) và [backend/src/db/store.ts](file:///e:/apps/group-deal/backend/src/db/store.ts).
  - Vô hiệu hóa triệt để endpoint `/api/wallet/sign-message` trong [backend/src/routes/walletRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/walletRoutes.ts) (trả về lỗi 403 Forbidden).
  - Giữ lại `decryptEntitlement` duy nhất cho nội dung sản phẩm số (license key, download link), tuyệt đối không dùng giải mã khóa ví.
- **Bằng chứng kiểm chứng:**
  - Static Code Audit:
    - `grep -r "createRandom" backend/src/` => 0 kết quả
    - `grep -r "encryptedPrivateKey" backend/src/` => 0 kết quả
    - `grep -r "decrypt" backend/src/` => Chỉ xuất hiện trong `decryptEntitlement` của `DeliveryService`
  - Integration Test:
    - ✔ Confirmed zero custodial private keys in user storage

---

### G1.5 — Shared Transaction Receipt & Event Verifier (Fail-Closed)
- **Giải pháp triển khai:**
  - Xây dựng [backend/src/services/transactionVerifier.ts](file:///e:/apps/group-deal/backend/src/services/transactionVerifier.ts) với phương thức `verifyExpectedTransaction(intent, txHash)`.
  - Các chốt chặn kiểm tra:
    1. **Format Check:** txHash phải là 32-byte hex hợp lệ.
    2. **Anti-Replay Check:** txHash chưa từng được ghi nhận cho bất kỳ intent nào khác trong `store.db.consumedTxHashes`.
    3. **Mempool & Receipt Status:** Truy vấn trực tiếp node Arc Testnet RPC (`https://rpc.testnet.arc.io`); receipt status bắt buộc phải là `1` (Success).
    4. **Deterministic Finality:** Xác minh block number đã được gán trên Arc.
    5. **Target Contract:** `tx.to` phải trùng khớp tuyệt đối với `config.hubAddress`.
    6. **Sender Principal:** `tx.from` phải trùng khớp với principal mong muốn (nếu intent có yêu cầu).
    7. **Calldata Selector:** Decode calldata theo ABI của `GroupDealHub`, kiểm tra function selector trùng khớp với intent.
    8. **Log Emitter:** Log bắt buộc phải được emit bởi đúng địa chỉ `config.hubAddress`.
    9. **Event Arguments:** Khớp toàn bộ tham số sự kiện (`campaignId`, `orderId`, `proofHash`, `buyerShare`, `sellerShare`...).
    10. **Atomic Consumption:** Ghi nhận txHash vào `store.db.consumedTxHashes` với blockNumber và timestamp.
- **Bằng chứng kiểm chứng:**
  - File test: [backend/test/gate_g1_verification.test.ts](file:///e:/apps/group-deal/backend/test/gate_g1_verification.test.ts)
  - Kết quả:
    - ✔ Invalid transaction hash format rejected
    - ✔ Non-existent transaction hash rejected (fail-closed)
    - ✔ TransactionVerifier anti-replay protection verified

---

### G1.6 — Loại Bỏ Toàn Bộ DB-only Financial State Changes
- **Vấn đề trước:** Các endpoint confirm delivery, open dispute, resolve dispute, publish campaign thay đổi trạng thái trong DB mà không có giao dịch onchain hoặc không xác minh receipt.
- **Giải pháp triển khai:**
  - [backend/src/services/deliveryService.ts](file:///e:/apps/group-deal/backend/src/services/deliveryService.ts):
    - `recordDelivery` yêu cầu `txHash` từ seller, xác minh sự kiện `DeliveryRecorded`.
    - `confirmReceipt` yêu cầu `txHash` từ buyer, xác minh sự kiện `OrderConfirmed`.
  - [backend/src/services/disputeService.ts](file:///e:/apps/group-deal/backend/src/services/disputeService.ts):
    - `openDispute` yêu cầu `txHash`, xác minh sự kiện onchain `OrderDisputed`.
    - `resolveDispute` yêu cầu `txHash`, xác minh sự kiện onchain `DisputeResolved` và định luật bảo toàn tài chính `buyerShare + sellerShare == remainingGross`.
  - [backend/src/routes/campaignRoutes.ts](file:///e:/apps/group-deal/backend/src/routes/campaignRoutes.ts):
    - `publish` chỉ chuyển trạng thái `ACTIVE` khi đã xác minh sự kiện `CampaignCreated` onchain hoặc phát sóng qua relayer thành công.
- **Bằng chứng kiểm chứng:**
  - File test: [backend/test/gate_g1_verification.test.ts](file:///e:/apps/group-deal/backend/test/gate_g1_verification.test.ts)
  - Kết quả:
    - ✔ DeliveryService strictly enforces onchain transaction hash requirement
    - ✔ DisputeService strictly enforces onchain transaction hash requirement
    - ✔ Dispute resolution rejects negative allocations

---

## 3. TỔNG HỢP KIỂM THỬ TỰ ĐỘNG GATE G1

Toàn bộ 7 bộ kiểm thử backend và kiểm thử pipeline hợp đồng thông minh đã vượt qua 100%:
1. `test/accounting.test.ts`: Reference Accounting Model & Invariant Conservation (PASS)
2. `test/auth_security.test.ts`: Auth Security, Brute-Force & DTO Sanitization (PASS)
3. `test/services_audit.test.ts`: SSRF Protection, Invariant Conservation & Dry-Run (PASS)
4. `test/abi_contract_sync.test.ts`: 10/10 Core Function Selectors Sync (PASS)
5. `test/wallet_relay_security.test.ts`: Relayer Policy Enforcement (PASS)
6. `test/wallet_challenge_replay.test.ts`: Wallet Challenge Anti-Replay (PASS)
7. `test/gate_g1_verification.test.ts`: Gate G1 Comprehensive Integration Suite (PASS)
8. `test/contracts/`: 15 Smart Contract tests passing (PASS)
9. `scripts/arc_probe.cjs`: Live Arc Testnet RPC Smoke Probe (PASS)
10. `npm run typecheck`: 0 Type errors across backend & frontend (PASS)

---

## 4. KẾT LUẬN GATE G1
Gate G1 đã **HOÀN TẤT VÀ ĐẠT TOÀN BỘ TIÊU CHÍ NGHIỆM THU**.
Sẵn sàng bước sang **Gate G2: Contract, Accounting, Terms và Security Multisig**.
