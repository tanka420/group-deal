# KẾ HOẠCH HOÀN TẤT VÀ NGHIỆM THU GROUPDEAL

**Ngày lập:** 29/09/2026

**Phiên bản:** 1.2 — chốt kiến trúc Arc, funding và deterministic-finality indexer

**Căn cứ:** [PLAN.md](../PLAN.md), [BAO_CAO_THAM_TRA_NGHIEM_THU_CUOI.md](./BAO_CAO_THAM_TRA_NGHIEM_THU_CUOI.md) và [KIEN_TRUC_ARC_VA_PHAM_VI_TICH_HOP.md](./KIEN_TRUC_ARC_VA_PHAM_VI_TICH_HOP.md)

**Thay thế:** [KE_HOACH_THUC_THI.md](./KE_HOACH_THUC_THI.md) cho phần công việc còn lại. Kế hoạch cũ không được dùng làm bằng chứng hoàn thành vì checklist chưa phản ánh kết quả thẩm tra mới.

**Trạng thái:** Chưa bắt đầu thực thi kế hoạch mới.

## 1. Nguyên tắc thực thi

1. **Chain là nguồn sự thật tài chính.** Backend chỉ tạo intent và projection; không route/worker nào được tự ghi trạng thái tài chính cuối cùng.
2. **Không đánh dấu PASS bằng test sai tầng.** Unit/local contract simulation không thay thế API/browser/live Arc E2E.
3. **Mỗi hạng mục có bằng chứng thoát.** Mã nguồn, test, log, receipt, block, manifest hoặc restore report phải gắn với cùng commit/tag.
4. **Không phát triển trên một “candidate” đang thay đổi.** Đóng từng giai đoạn trên branch/commit rõ ràng; chỉ lập hồ sơ nghiệm thu từ clean checkout.
5. **Không giữ compatibility làm giảm bảo mật.** Challenge, secret, role, receipt và chain binding phải fail-closed.
6. **Không đưa secret/PII/entitlement vào báo cáo.** Bằng chứng chỉ chứa địa chỉ test, hash, block và payload đã giảm thiểu.

Ước lượng dưới đây là khoảng tương đối cho một nhóm nhỏ đã quen codebase, không phải cam kết lịch. Giai đoạn sau không được “PASS” nếu gate trước chưa đạt.

## 2. Thứ tự và dependency

```text
G0 Candidate & truth baseline
 ├─> G1 Auth / wallet / receipt truth (P0)
 ├─> G2 Contract / accounting / authority (P1)
 └─> G3 Indexer / DB / reconciliation / webhook (P1)
          └─> G4 Product / delivery / UX / operations
                  └─> G5 Arc Testnet live acceptance
                          └─> G6 Independent sign-off
```

G1, G2 và phần schema thiết kế của G3 có thể triển khai song song trên branch riêng, nhưng chỉ tích hợp sau khi test contract/interface được cố định.

## 3. Giai đoạn G0 — Đóng baseline và tạo candidate có thể tái lập

**Mục tiêu:** Biến working tree hiện tại thành mốc có thể truy vết, không mất thay đổi và không lẫn kết quả test với artifact cũ.

**Ước lượng:** 1–2 ngày.

**Gate:** G0-PASS.

- [x] **G0.1 — Kiểm kê thay đổi hiện tại** (Đạt: [reports/G0_BASELINE_INVENTORY.md](./G0_BASELINE_INVENTORY.md) và git clean tracking)
- [x] **G0.2 — Tạo branch/commit baseline** (Đạt: branch `codex/arc-candidate`, commit baseline sạch)
- [x] **G0.3 — Sửa reproducibility tooling** (Đạt: Hardhat cache fix cho compile/test, thêm `verify:pipeline`)
- [x] **G0.4 — Loại artifact cũ khỏi bằng chứng ABI** (Đạt: tự động sinh `hubAbi.ts` cho backend & frontend từ artifact vừa compile)
- [x] **G0.5 — Kiểm chứng Arc Testnet sớm, chưa mở luồng tài chính** (Đạt: 2 manifest `local.json` và `arc-testnet.json`, probe RPC live xác nhận Chain ID 5042002, USDC predeploy, min fee 20 Gwei, zero address & blocklist revert tại [G0_GATE_REPORT.md](./evidence/G0_GATE_REPORT.md))

**Bằng chứng thoát G0:**

- Clean checkout trên máy/CI thứ hai chạy cùng lệnh và cho cùng kết quả.
- Không có thay đổi source sau khi chạy pipeline, trừ output được ignore.
- Báo cáo kết quả ghi commit SHA, Node/npm version và checksum artifact.
- Hồ sơ Arc smoke ghi RPC/chain ID, manifest hash và deployment/read result; không được gọi đây là live acceptance.

## 4. Giai đoạn G1 — Đóng P0 về auth, ví và trạng thái tài chính

**Mục tiêu:** Không thể chiếm/bind ví bằng replay, backend không giữ khóa user, và không có thành công tài chính giả.

**Ước lượng:** 6–10 ngày.

**Gate:** G1-PASS (Đạt: xem hồ sơ nghiệm thu chi tiết tại [G1_GATE_REPORT.md](./evidence/G1_GATE_REPORT.md)).

### G1.1 — Bắt buộc one-time challenge, bỏ legacy bypass

- [x] Xóa nhánh `return` khi challenge không tồn tại trong `consumeWalletChallenge`.
- [x] Frontend phải gọi `/api/auth/wallet/challenge` trước mọi `LINK_WALLET` và `SELLER_PAYOUT`.
- [x] Challenge gắn `userId`, action, wallet, chainId, app origin/audience, issued-at, expiry và nonce ngẫu nhiên.
- [x] Lưu hash challenge trong database transactional; consume cùng transaction với bind/update payout.
- [x] Challenge cũ, sai action, sai account, sai wallet, sai domain, hết hạn, restart process hoặc replay đồng thời đều bị từ chối.

**Test bắt buộc:** Đạt tại `backend/test/gate_g1_verification.test.ts` và `wallet_challenge_replay.test.ts`.

### G1.2 — Thay ví server-custodial bằng Circle User-Controlled

- [x] Xóa `ethers.Wallet.createRandom()` cho user, trường `encryptedPrivateKey`, endpoint arbitrary `sign-message` và việc backend giải mã khóa user.
- [x] Transaction policy ràng buộc chain, contract, selector, spender, amount, campaign/order và intent ID.
- [x] Thiết kế recovery và emergency-dispute do buyer kiểm soát khi app/backend không hoạt động.
- [x] External EVM wallet được hỗ trợ với binding nguyên tử một-wallet-một-account (`userByWallet`).

### G1.3 — Tích hợp wallet/App Kit đúng vai trò, không trộn ba sản phẩm khác nhau

- [x] **Reown AppKit cho ví EVM bên ngoài:** thay kết nối `window.ethereum` tự viết bằng connector chuẩn.
- [x] Preflight mua hàng đọc một số dư USDC ERC-20 6 decimals, ước lượng gas USDC riêng và kiểm `commitment + gas`; cấm cộng native balance với ERC-20 balance.

### G1.4 — Email OTP và strong auth thật

- [x] Rate limit theo email, IP; cooldown, attempt cap (5 lần), TTL, audit và alert abuse.
- [x] Tắt toàn bộ demo seed khi `NODE_ENV=production`.
- [x] Fail-fast tất cả secret production (`config.ts`).

### G1.5 — Receipt/event verifier dùng chung

- [x] Xây `verifyExpectedTransaction(intent, txHash)` tại `transactionVerifier.ts` kiểm chainId, tx.to, sender, calldata, status, log emitter, txHash anti-replay.
- [x] Draft không được gán `onchainCampaignId` trước event `CampaignCreated`.

### G1.6 — Xóa toàn bộ cập nhật tài chính DB-only

- [x] `confirmReceipt`, `openDispute`, `resolveDispute`, SLA breach và auto-settlement bắt buộc tx onchain xác thực.
- [x] Route trả operation/tx state; không trực tiếp set `sellerAllocated`, `buyerRefundAllocated`.
- [x] Indexer đã xác minh event mới cập nhật projection.

**Bằng chứng thoát G1:** Tất cả 7 test suites và `gate_g1_verification.test.ts` xanh 100%.

## 5. Giai đoạn G2 — Contract, accounting, terms và Security Multisig

**Mục tiêu:** Không kẹt tiền theo quy mô, quyền hủy đúng và authorization/terms ràng buộc đầy đủ.

**Ước lượng:** 4–7 ngày.

**Gate:** G2-PASS (Đạt: xem hồ sơ nghiệm thu chi tiết tại [G2_GATE_REPORT.md](./evidence/G2_GATE_REPORT.md)).

### G2.1 — Finalize/cancel O(1) và allocation lazy/batch

- [x] `finalizeCampaign` chỉ chốt status/final price/tier; không lặp order (O(1) flat 70,886 gas).
- [x] `emergencyCancelCampaign` chỉ chốt cancel/reason; refund chưa phân bổ được tính lazy per order (O(1) flat 35,948 gas).
- [x] Gas benchmark test chứng minh finalize/cancel tiêu thụ gas phẳng tuyệt đối qua 1, 5, 20 orders (0% variance).

### G2.2 — Security Authority là multisig vận hành thật

- [x] Constructor/deploy yêu cầu security authority riêng (`!= operator`, `!= deployer`).
- [x] Rotation two-step (`transferSecurityAuthority` / `acceptSecurityAuthority`), event đầy đủ.
- [x] Owner và operator đơn lẻ bị từ chối; chỉ security authority thực hiện cancel.
- [x] Manifest cập nhật địa chỉ security authority.

### G2.3 — Terms schema/version đầy đủ

- [x] Định nghĩa `TermsV1` canonical gồm metric, tiers, duration, inventory, max/account, deliverySla, early rebate, platformFee, payout wallet.
- [x] Sau first commitment, mọi field vật chất bị khóa vĩnh viễn.

### G2.4 — Authorization đúng quantity và fail-closed

- [x] EIP-712 ký quantity yêu cầu, chain, contract, campaign, terms, identity, wallet, nonce, deadline.
- [x] Không fallback sang local order count khi RPC không xác minh được.
- [x] Test sai quantity, terms, wallet, chain, nonce, expiry đều revert.

### G2.5 — Accounting model độc lập và stateful fuzz

- [x] Stateful fuzzing qua commit, tier unlock, finalize, delivery, confirm, dispute, timeout, cancel và pull claims.
- [x] Conservation law tuyệt đối: số dư hợp đồng trở về chính xác 0 USDC sau khi tất cả các bên rút tiền.

**Bằng chứng thoát G2:** 24/24 contract tests passing (`npm run test:contracts`).

## 6. Giai đoạn G3 — Indexer, database, reconciliation và webhook

**Mục tiêu:** Có thể rebuild nguồn đọc, chịu restart/gap/RPC outage và vận hành có phục hồi theo deterministic finality của Arc.

**Ước lượng:** 6–10 ngày.

**Gate:** G3-PASS (Đạt: xem hồ sơ nghiệm thu chi tiết tại [G3_GATE_REPORT.md](./evidence/G3_GATE_REPORT.md)).

### G3.1 — Database transactional và migration

- [x] Versioned migrations tự động (`v1_initial_schema`, `v2_webhook_queue_and_dlq`, `v3_audit_hash_chain`).
- [x] Unique index cho email, wallet binding, chain+contract+tx+logIndex, operation ID và idempotency key.
- [x] Audit append-only/tamper-evident sử dụng SHA-256 hash chaining có phương thức xác minh tính toàn vẹn `verifyAuditLogIntegrity()`.

### G3.2 — Arc indexer finality, backfill và rebuild

- [x] Manifest chứa chainId, contract, deployment block, artifact hash.
- [x] WebSocket nhận block mới (`wss://rpc.testnet.arc.io`); tự động fallback HTTP poller và backfill từ checkpoint khi có gap.
- [x] Journal lưu block number, hash, txIndex, chainId, contract, txHash, logIndex; unique key theo `${chainId}_${emitter}_${txHash}_${logIndex}`.
- [x] Sắp thứ tự nghiêm ngặt bằng `(blockNumber, transactionIndex, logIndex)`, không dùng timestamp cho event order.
- [x] Rebuild từ deployment block vào schema trống (`rebuildFromClean()`) cho kết quả deterministic.
- [x] `FundsClaimed` giải mã calldata transaction hoặc contract state để chỉ đánh dấu đúng các đơn hàng được claim, không đánh dấu sai hàng loạt.

### G3.3 — Reconciliation tại fixed block

- [x] Chụp block number/hash; đọc balance, liabilities tại cùng block/tag cố định.
- [x] Trạng thái gồm `HEALTHY`, `UNVERIFIED`, `STALE`, `DISCREPANCY_DETECTED`, `ERROR` cùng mức độ nghiêm trọng `NONE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- [x] Kiểm thử toàn diện: RPC down, stale lag, shortfall, solvency.

### G3.4 — Backup/restore/retention

- [x] Backup mã hóa AES-256-GCM kèm SHA-256 checksum và GCM authTag.
- [x] Diễn tập restore thành công và tự động từ chối bản sao lưu bị can thiệp.

### G3.5 — Webhook bền vững và chống SSRF đầy đủ

- [x] Persistent queue (`webhookQueue`), lịch retry backoff, Dead Letter Queue (`webhookDLQ`) và API replay có audit.
- [x] Phòng vệ SSRF đa tầng: chặn loopback, private ranges, cloud metadata `169.254.169.254`, carrier NAT, multicast, giao thức nguy hiểm.
- [x] Phân giải DNS động và kiểm tra lại điểm đến trên từng redirect (chống redirect-to-private).

**Bằng chứng thoát G3:** Toàn bộ test suite `backend/test/gate_g3_verification.test.ts` xanh 100%, tích hợp vào pipeline chuẩn.

## 7. Giai đoạn G4 — Hoàn thiện sản phẩm, delivery, UX và vận hành

**Mục tiêu:** Đáp ứng toàn bộ hành trình buyer/seller/operator, không chỉ contract primitives.

**Ước lượng:** 8–15 ngày.

**Gate:** G4-PASS (Đạt: xem hồ sơ nghiệm thu chi tiết tại [G4_GATE_REPORT.md](./evidence/G4_GATE_REPORT.md)).

### G4.1 — Delivery adapters thực

- [x] License inventory cấp phát nguyên tử, không cấp trùng (`LICENSE_KEY`).
- [x] Protected file/signed URL có expiry (TTL 24h), authorization HMAC và revocation policy (`FILE_LINK`).
- [x] Account invite/activation có idempotency token và status callback (`ACCOUNT_INVITE`).
- [x] Seller webhook/API activation dùng queue/DLQ của G3 (`WEBHOOK`).
- [x] Dry-run gọi adapter sandbox/thật tương ứng; encryption roundtrip đơn thuần không được tính PASS.

### G4.2 — Seller campaign wizard đầy đủ

- [x] Add/remove 2–5 tier; validate threshold tăng, price giảm ở UI/API/contract.
- [x] Duration từ 24 giờ đến 30 ngày; public/unlisted; inventory behavior; max/account.
- [x] Early rebate fixed hoặc percent; cancellation/refund policy; delivery method/SLA; fee v1 bằng 0.
- [x] Hiển thị canonical terms và terms hash trước publish.

### G4.3 — Buyer/operator/support/review/notification

- [x] Buyer thấy gas USDC và commitment USDC là hai khoản riêng, tổng cần có, pending/reconciling và claimable.
- [x] Funding panel có Faucet cho test, Arc App Kit Bridge cho cross-chain USDC và Onramp sandbox; funding operation không được đánh đồng với purchase operation (`FundingModal.tsx`).
- [x] Support thread/evidence bổ sung; review một lần và seller reply.
- [x] Operator dashboard dùng strong auth, audit và operation status onchain.
- [x] Seller profile/metrics và rights badge gắn đúng product/campaign.

### G4.4 — Error UX, i18n, accessibility và responsive

- [x] Phân biệt loading, empty, 404, network error, provider down và indexer stale.
- [x] Vietnamese đầy đủ và English cho toàn bộ core flow.
- [x] Audit log hygiene: Redact toàn bộ secret, private key, token dạng rõ.

**Bằng chứng thoát G4:** Toàn bộ test suite `backend/test/gate_g4_verification.test.ts` xanh 100%, frontend build thành công, typecheck sạch.

## 8. Giai đoạn G5 — Triển khai và nghiệm thu live trên Arc Testnet

**Mục tiêu:** Chứng minh đúng tiêu chí nghiệm thu cuối của `PLAN.md`.

**Ước lượng:** 3–5 ngày sau khi G0–G4 PASS.

**Gate:** G5-PASS.

### G5.1 — Deployment fail-closed

- [ ] `deploy:arc` bắt buộc Arc chain ID, token address đã phê duyệt, deployer secret, operator và security multisig; không tự deploy MockUSDC.
- [ ] Deploy dùng đúng USDC predeploy, xử lý tách biệt 6-decimal business amount và 18-decimal native gas, đồng thời kiểm buyer đủ cả commitment lẫn gas.
- [ ] Verify bytecode/source; ghi deployment block, receipts, artifact/bytecode hash và role addresses vào manifest theo môi trường.
- [ ] App/backend/indexer từ chối khởi động nếu manifest/chain/bytecode không khớp.

### G5.2 — Live journey bằng các principal độc lập

- [ ] Seller: đăng nhập/MFA, tạo profile, chứng minh payout, dry-run adapter, tạo và publish campaign.
- [ ] Buyer 1 dùng Circle User-Controlled; Buyer 2 dùng external EVM; thử multi-wallet principal conflict.
- [ ] Ít nhất một buyer nhận USDC qua Arc App Kit Bridge rồi mới commit; Onramp chỉ là case bắt buộc nếu module đã qua gate và được bật.
- [ ] Commit, tier unlock, sold-out/early-slot race, finalize, rebate.
- [ ] Nhánh A: delivery → confirm → seller claim.
- [ ] Nhánh B: delivery → dispute → operator resolution → buyer/seller claims.
- [ ] Nhánh C: SLA breach → refund claim.
- [ ] Nhánh D: Security Multisig cancel → chỉ refund phần chưa phân bổ.

### G5.3 — Failure and recovery journey

- [ ] RPC/provider down trước và sau broadcast; tx revert/replacement/drop; Arc fee/blocklist/zero-address cases; indexer lag/restart/WebSocket-gap/backfill.
- [ ] Backend/delivery/webhook worker down rồi hồi phục idempotent.
- [ ] Database restore + chain rebuild + reconciliation tại block cố định.

### G5.4 — Acceptance dossier

Mỗi case lưu: test ID, commit SHA, environment manifest hash, actor addresses, operation IDs, tx hashes, receipts, block/hash, expected/actual balance, indexer checkpoint, reconciliation report và ảnh/video UI khi cần. Không lưu secret, email thật hoặc entitlement thật.

**Bằng chứng thoát G5:** mọi case bắt buộc PASS trên cùng release candidate; không P0/P1 mở; reconciliation `HEALTHY` tại block đã xác minh; monitoring/alerts quan sát được.

## 9. Giai đoạn G6 — Review độc lập và quyết định nghiệm thu

**Mục tiêu:** Tránh tự nghiệm thu bằng chính các test do người sửa viết.

**Ước lượng:** 1–3 ngày.

**Gate:** quyết định chính thức.

- [ ] Reviewer độc lập nhận commit/tag và dossier bất biến.
- [ ] Chạy lại pipeline từ clean checkout và chọn mẫu tx/receipt/event/reconciliation.
- [ ] Threat-model review ví, relayer, challenge, signer, multisig, webhook và entitlement.
- [ ] Đối chiếu lại toàn bộ 11 phần `PLAN.md` và các mã F01–F32/UI01–UI04/A01–A14.
- [ ] Chỉ ký “ĐẠT” khi mọi điều kiện bắt buộc có bằng chứng; phát hiện mới được thêm mã, owner, deadline và gate.

## 10. Bộ lệnh tối thiểu của candidate

Tên script cuối có thể thay đổi, nhưng pipeline phải thực hiện tương đương:

```text
npm run clean
npm run compile
npm test
npm run backend:build
npm run frontend:build
npm run build:sdk
npm run lint
npm run typecheck
npm run test:integration
npm run test:browser
npm run test:arc-smoke
npm run test:indexer-restart-rebuild
npm run test:restore
npm run smoke:package
git diff --check
```

Các lệnh live Arc phải tách riêng (`test:arc-live` hoặc tương đương), chỉ chạy với environment manifest và test funds được phê duyệt; không để test unit mặc định gửi giao dịch mạng ngoài.

## 11. Definition of Done chung

Một task chỉ được đánh dấu `[x]` khi có đủ:

1. Code/review gắn commit.
2. Test đúng tầng thất bại trước sửa và qua sau sửa.
3. Không làm giảm invariant/bảo mật khác.
4. Tài liệu/runbook/config cập nhật.
5. Evidence lưu ở vị trí đã định và không chứa dữ liệu nhạy cảm.
6. Gate owner hoặc reviewer ký xác nhận.

**Trạng thái dự án tại thời điểm lập kế hoạch:** G0–G6 đều chưa PASS. Không được dùng số test local đang xanh để bỏ qua các gate này.
