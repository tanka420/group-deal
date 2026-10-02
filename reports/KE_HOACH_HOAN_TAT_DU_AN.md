# KẾ HOẠCH HOÀN TẤT VÀ NGHIỆM THU GROUPDEAL

**Ngày lập:** 29/09/2026

**Phiên bản:** 1.7 — cập nhật 03/10/2026 sau sửa định danh Circle và tích hợp checkout USDC

**Căn cứ:** [PLAN.md](../PLAN.md), [BAO_CAO_THAM_TRA_NGHIEM_THU_CUOI.md](./BAO_CAO_THAM_TRA_NGHIEM_THU_CUOI.md) và [KIEN_TRUC_ARC_VA_PHAM_VI_TICH_HOP.md](./KIEN_TRUC_ARC_VA_PHAM_VI_TICH_HOP.md)

**Thay thế:** [KE_HOACH_THUC_THI.md](./KE_HOACH_THUC_THI.md) cho phần công việc còn lại. Kế hoạch cũ không được dùng làm bằng chứng hoàn thành vì checklist chưa phản ánh kết quả thẩm tra mới.

**Trạng thái:** RELEASE CANDIDATE TESTNET CÓ ĐIỀU KIỆN, CHƯA NGHIỆM THU PRODUCTION. Deployment, Safe và cleanup có bằng chứng lịch sử; không suy ra nghiệm thu sản phẩm. Đã sửa định danh Circle, RPC đọc số dư/authorization và nối USDC funding vào checkout; chưa có đủ OTP/chữ ký/receipt live mới hoặc review độc lập. G1 và G4 vẫn mở. Xem [báo cáo ngày 03/10/2026](./BAO_CAO_SUA_LOI_VA_CHECKOUT_03_10_2026.md). Mục tiêu token khác và Arc Mainnet được bổ sung ở mục 12, không bật trên deployment Testnet.

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

**Gate:** CHƯA PASS. Các mục đã kiểm chứng vẫn được giữ; mục thiếu được mở lại bên dưới.

### G1.1 — Bắt buộc one-time challenge, bỏ legacy bypass

- [x] Xóa nhánh `return` khi challenge không tồn tại trong `consumeWalletChallenge`.
- [x] Frontend phải gọi `/api/auth/wallet/challenge` trước mọi `LINK_WALLET` và `SELLER_PAYOUT`.
- [x] Challenge gắn `userId`, action, wallet, chainId, app origin/audience, issued-at, expiry và nonce ngẫu nhiên.
- [x] Lưu hash challenge trong database transactional; consume cùng transaction với bind/update payout.
- [x] Challenge cũ, sai action, sai account, sai wallet, sai domain, hết hạn, restart process hoặc replay đồng thời đều bị từ chối.

**Test bắt buộc:** Đạt tại `backend/test/gate_g1_verification.test.ts` và `wallet_challenge_replay.test.ts`.

### G1.2 — Thay ví server-custodial bằng Circle User-Controlled

- [x] Tích hợp Circle User-Controlled wallet theo SDK/API hiện hành; API key chỉ ở backend và người dùng tự thực thi challenge bằng Circle Web SDK (đã kiểm tra code/policy; live credential còn ở G5).
- [x] Xóa `ethers.Wallet.createRandom()` cho user, trường `encryptedPrivateKey`, endpoint arbitrary `sign-message` và việc backend giải mã khóa user.
- [x] Xóa relayer ký thay user; `authorizedSignerPrivateKey` chỉ còn ký EIP-712 buy authorization, không gửi transaction. Circle policy ràng buộc chain, contract, selector, spender, amount, campaign/order và operation intent.
- [x] Thiết kế recovery và emergency-dispute do buyer kiểm soát khi app/backend không hoạt động.
- [x] External EVM wallet được hỗ trợ với binding nguyên tử một-wallet-một-account (`userByWallet`).

### G1.3 — Tích hợp wallet/App Kit đúng vai trò, không trộn ba sản phẩm khác nhau

- [x] **Reown AppKit cho ví EVM bên ngoài:** connector chuẩn, custom Arc Testnet và lazy chunk đã được tích hợp; giao dịch live còn ở G5.
- [x] Reown wallet-first login hoạt động độc lập với Circle: challenge 5 phút bind origin/Arc chain/address, nonce riêng, rate limit, chữ ký một lần và atomic wallet-to-account; backend không nhận private key/seed phrase.
- [ ] Nghiệm thu preflight mua hàng thật: code đã đọc một số dư USDC, kiểm ngân sách trước approve và estimate từng call trước ký; bigint 6/18 decimals, không cộng hai balance. Còn hiển thị quote gas/tổng đầy đủ trước ký cho từng loại ví và bằng chứng live; không lấy mock test làm nghiệm thu.

### G1.4 — Email OTP và strong auth thật

- [x] Luồng email OTP dùng Circle hosted verification; response chống enumeration và không trả mã OTP. Việc gửi thật qua Circle Console còn phải chứng minh bằng credential live ở G5.
- [x] Ở mức code và browser mock: đăng ký lại callback trên SDK singleton; tạo phiên ứng dụng ngay sau OTP được backend xác minh, đồng bộ ví trong nền tối đa 120 giây, timeout API và nút thử lại/xác thực lại không cần đăng xuất. Live email login mới và cũ vẫn cần nghiệm thu.

**Cập nhật 03/10/2026:** Không dùng device-token `sub` làm Circle user ID. Backend dùng ID từ API xác thực user token, lookup theo Circle ID, chặn replay/merge bằng email chưa chứng minh. Nếu token không có email đã xác minh thì chưa gắn email nhận thông báo. Yêu cầu OTP mới cho các lượt theo cơ chế cũ; live identity, email liên hệ và recovery vẫn mở.
- [x] Khôi phục địa chỉ ví đã xác thực sau reload; tách phiên ứng dụng khỏi phiên ký, hỗ trợ kết nối lại và từ chối signer khác tài khoản. Không lưu credentials Circle vào localStorage.
- [x] Faucet trực tiếp qua API Circle, yêu cầu đăng nhập, kiểm ownership và cooldown; không tự mint hoặc cấp tiền từ treasury. API faucet yêu cầu quyền Console được nâng cấp mainnet, nhưng blockchain nhận vẫn cố định Arc Testnet; receipt cấp token thật còn phải kiểm tra.
- [x] Rate limit bền vững theo hash email, IP và device; có cooldown, TTL, attempt cap và audit. Alert delivery thật phụ thuộc email provider live.
- [x] Operator có one-time `OPERATOR_ACTION` signature challenge; seller payout/action tài chính yêu cầu wallet signer đã bind.
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

**Gate:** PASS ở mức contract/code và thiết lập authority live. Safe 2-of-3 đã được tạo, xác minh owners/quorum/bytecode và gắn vào deployment mới; diễn tập emergency cancel bằng hai signer còn nằm trong G5.

### G2.1 — Finalize/cancel O(1) và allocation lazy/batch

- [x] `finalizeCampaign` chỉ chốt status/final price/tier; không lặp order (O(1) flat 70,886 gas).
- [x] `emergencyCancelCampaign` chỉ chốt cancel/reason; refund chưa phân bổ được tính lazy per order (O(1) flat 35,948 gas).
- [x] Gas benchmark test chứng minh finalize/cancel tiêu thụ gas phẳng tuyệt đối qua 1, 5, 20 orders (0% variance).

### G2.2 — Security Authority là multisig vận hành thật

- [x] Constructor và deploy policy yêu cầu security authority riêng (`!= operator`, `!= deployer`, `!= authorized signer`).
- [x] Rotation two-step (`transferSecurityAuthority` / `acceptSecurityAuthority`), event đầy đủ.
- [x] Owner và operator đơn lẻ bị từ chối; chỉ security authority thực hiện cancel.
- [x] Deploy policy từ chối EOA, EIP-7702 delegation marker và các tài khoản dev công khai cho security authority.
- [x] Tạo Safe `0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6` trên Arc Testnet; xác minh ba owner, threshold `2`, Safe `1.5.0` và runtime bytecode tại [ARC_SECURITY_MULTISIG.json](./evidence/ARC_SECURITY_MULTISIG.json).
- [x] Deployment mới và manifest ghi đúng địa chỉ multisig; fixed-block verification PASS tại [ARC_CANDIDATE_DEPLOYMENT_VERIFY.json](./evidence/ARC_CANDIDATE_DEPLOYMENT_VERIFY.json).
- [ ] Diễn tập Safe propose/confirm/execute emergency cancel bằng ít nhất hai owner độc lập trong G5.

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

**Gate:** PASS Ở MỨC CODE/TEST CANDIDATE; restore/rebuild live nằm trong G5. SQLite là persistence authoritative, JSON cũ chỉ được migrate một lần.

### G3.1 — Database transactional và migration

- [x] Chuyển JSON store sang SQLite WAL có transaction/unique constraint; có migration one-time và test trên database thật.
- [x] Unique constraint DB cho email, Circle user ID, wallet binding, chain+contract+tx+logIndex, operation ID và idempotency key.
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

**Gate:** CHƯA PASS. Unit/service test không thay thế browser E2E, accessibility và vận hành thật.

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

- [ ] Buyer thấy commitment và phí gas là hai chi phí từ cùng số dư USDC, có tổng trước khi ký. Code đã kiểm ngân sách/estimate trong transaction path; còn hoàn thiện hiển thị gas quote đầy đủ và nghiệm thu ví thật.
- [x] Funding panel tích hợp `@circle-fin/app-kit` Bridge/CCTP trong app với operation lifecycle/retry/explorer; receipt bridge live còn ở G5.

**Cập nhật checkout 03/10/2026:** Đã có hai lựa chọn USDC Arc hoặc USDC các testnet nguồn qua CCTP. Bridge lấy báo giá rồi mới xác nhận; kiểm USDC/ETH nguồn, giữ hồ sơ qua reload và chặn thao tác trùng giữa tab. Mua kiểm lại campaign sau funding, xác minh receipt/CommitmentMade và chờ đơn indexer; không báo thành công theo timer. Hồ sơ localStorage chưa thay phục hồi phía server/thiết bị khác. Token khác vẫn bị khóa trên các mạng nguồn Testnet không hỗ trợ Swap.
- [x] Email + in-app notifications có preference, event dedupe, persistent outbox, retry/DLQ và payload tối thiểu không chứa entitlement.
- [x] Support thread/evidence bổ sung; review một lần và seller reply.
- [x] Operator dashboard dùng strong auth, audit và operation status onchain.
- [x] Seller profile/metrics và rights badge gắn đúng product/campaign.

### G4.4 — Error UX, i18n, accessibility và responsive

- [x] Phân biệt loading, empty, 404, network error, provider down và indexer stale.
- [x] Vietnamese đầy đủ và English cho toàn bộ core flow.
- [x] Audit log hygiene: Redact toàn bộ secret, private key, token dạng rõ.
- [x] Browser E2E với API/SDK giả lập: fail-closed, reload ví, faucet không mở tab, phiên email không chờ callback tạo ví và OTP sau reload. Không phải bằng chứng ký/chuyển tiền live.
- [ ] Browser E2E đa account live, keyboard/accessibility và responsive 320/375/768px.
- [x] Runbook/SLO/ngưỡng vận hành cho RPC, indexer, reconciliation, outbox/DLQ và restore tại [RUNBOOK_VAN_HAN_ARC.md](./RUNBOOK_VAN_HAN_ARC.md).
- [ ] Kênh alert thật và diễn tập incident live với credential production-like.

**Bằng chứng thoát G4:** Toàn bộ test suite `backend/test/gate_g4_verification.test.ts` xanh 100%, frontend build thành công, typecheck sạch.

## 8. Giai đoạn G5 — Triển khai và nghiệm thu live trên Arc Testnet

**Mục tiêu:** Chứng minh đúng tiêu chí nghiệm thu cuối của `PLAN.md`.

**Ước lượng:** 3–5 ngày sau khi G0–G4 PASS.

**Gate:** CHƯA PASS TOÀN BỘ. **G5.1 có bằng chứng PASS lịch sử**: cleanup, Safe 2-of-3 và Hub mới đã được xác minh. Người dùng xác nhận kiểm soát các ví và đã cấu hình môi trường, nhưng G5.2–G5.4 chưa có bộ receipt/ảnh/API/database cho đủ nhánh sản phẩm. Journey cũ vẫn bị thu hồi vì dùng ví dẫn xuất và bỏ qua UI/API/Circle/Reown. Không yêu cầu gửi private key trong chat; chủ ví xác nhận các bước ký cần thiết trong UI.

### G5.1 — Deployment fail-closed

- [x] `deploy:arc` đã được sửa fail-closed: bắt buộc Arc chain ID, USDC predeploy, deployer secret, operator, authorized signer và `SECURITY_MULTISIG_ADDRESS`; từ chối fallback/tài khoản dev/EOA/EIP-7702 cho security role.
- [x] Deploy dùng đúng USDC predeploy; quy đổi đúng giữa giao diện ERC-20 6 decimals và native 18 decimals của cùng một số dư, đồng thời kiểm số dư đủ cho cả commitment lẫn gas.
- [x] Cleanup deployment cũ `0x7d4b...9F9a`: hoàn tất delivery/confirm/claims, escrow và Hub USDC đều về `0`; bốn receipt tại [LEGACY_ARC_CLEANUP.json](./evidence/LEGACY_ARC_CLEANUP.json).
- [x] Tạo Safe 2-of-3 thật `0xdDB2...72e6`, deploy candidate mới `0x2A7a...0574` tại block `64644317`, ghi manifest và xác minh role/bytecode/receipt lại tại fixed block `64660310`.
- [x] App/backend/indexer từ chối khởi động nếu manifest/chain/bytecode không khớp (`validateManifestAndEnvironment`).

### G5.2 — Live journey bằng các principal độc lập

- [ ] Seller: đăng nhập/step-up, tạo profile, chứng minh payout, dry-run adapter, tạo và publish campaign qua browser/API.
- [ ] Buyer 1 dùng Circle User-Controlled; Buyer 2 dùng Reown external EVM; thử multi-wallet principal conflict.
- [ ] Commit, tier unlock, sold-out/early-slot race, finalize và rebate qua đúng các principal độc lập.
- [ ] Nhánh A: delivery → confirm → seller claim.
- [ ] Nhánh B: delivery → dispute → operator resolution → buyer/seller claims.
- [ ] Nhánh C: SLA breach → refund claim.
- [ ] Nhánh D: Security Multisig cancel → chỉ refund phần chưa phân bổ.
- [ ] Bảo toàn tuyệt đối vốn sau khi tất cả các nhánh kết thúc; không còn escrow ngoài liability hợp lệ.

### G5.3 — Failure and recovery journey

- [ ] RPC/provider down trước/sau broadcast; tx revert/replacement/drop; indexer lag/restart/reorg simulation.
- [ ] Backend/delivery/webhook worker down rồi hồi phục idempotent.
- [ ] Database restore + chain rebuild + reconciliation tại block cố định `HEALTHY`.

### G5.4 — Acceptance dossier

Mỗi case lưu: test ID, commit SHA, environment manifest hash, actor addresses, operation IDs, tx hashes, receipts, block/hash, expected/actual balance, indexer checkpoint, reconciliation report và ảnh/video UI khi cần. Không lưu secret, email thật hoặc entitlement thật.

**Bằng chứng thoát G5:** Mọi case bắt buộc PASS trên cùng release candidate, qua browser/API/database/indexer/Arc; hồ sơ cũ chỉ được giữ làm bằng chứng deployment và contract primitive.

## 9. Giai đoạn G6 — Review độc lập và quyết định nghiệm thu

**Mục tiêu:** Tránh tự nghiệm thu bằng chính các test do người sửa viết.

**Ước lượng:** 1–3 ngày.

**Gate:** CHƯA PASS; bắt buộc reviewer độc lập sau khi G0–G5 có candidate bất biến.

- [ ] Reviewer độc lập nhận commit/tag và dossier bất biến.
- [ ] Chạy lại pipeline từ clean checkout và chọn mẫu tx/receipt/event/reconciliation.
- [ ] Threat-model review ví, relayer, challenge, signer, multisig, webhook và entitlement.
- [ ] Đối chiếu lại toàn bộ 11 phần `PLAN.md` và các mã F01–F32/UI01–UI04/A01–A14.
- [ ] Chỉ ký “ĐẠT” khi mọi điều kiện bắt buộc có bằng chứng.

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

**Trạng thái cập nhật 03/10/2026:** G0/G2/G3/G5.1 có bằng chứng code hoặc triển khai lịch sử theo từng phạm vi; G1/G4 chưa PASS toàn bộ, G5.2–G5.4/G6 còn mở. Backend test và 15 ca frontend đã qua trên working tree, không phải chứng thư nghiệm thu. Các sửa lỗi mới phải có xác nhận live trên cùng candidate; không dùng API/SDK giả lập hoặc contract primitive để thay bằng chứng sản phẩm và review độc lập.

## 12. Checkout production trên Arc Mainnet

Đây là phần mở rộng theo mục tiêu production và trả bằng token khác của chủ dự án. Tiếp tục các gate đang mở ở trên; không viết lại hoặc xóa bằng chứng lịch sử của kế hoạch. Mainnet 5042 và Testnet 5042002 cần manifest, deployment và cấu hình tách biệt. Nguồn: [Arc network](https://docs.arc.io/arc/references/connect-to-arc), [App Kit capabilities](https://docs.arc.io/app-kit/references/supported-blockchains).

| Thứ tự | Phần thực thi | Người thực hiện | Điều kiện hoàn tất |
|---|---|---|---|
| 1 | OTP mới/cũ, reconnect, faucet, USDC bridge và purchase live trên candidate Testnet | Agent kiểm API/chain; chủ dự án nhập OTP và ký | Đúng Circle ID/ví; số dư/receipt thật; thiếu gas và retry không tạo giao dịch mua/burn trùng |
| 2 | Hoàn thiện tổng/gas quote, email liên hệ đã xác minh, pending/replacement/drop, recovery trên backend và failover vận hành | Agent; chủ dự án kiểm xác thực email/ví | Không claim email bằng request; phục hồi qua restart/thiết bị; không tự gửi lại khi trạng thái không rõ |
| 3 | Đóng G5/G6, audit custody/nonce/authority/dependency/CSP và vận hành | Agent chuẩn bị; chủ dự án ký các vai trò; reviewer độc lập nghiệm thu | Candidate bất biến, đủ receipt seller/buyer/operator/Safe, đối soát và restore |
| 4 | Chuẩn bị manifest/deployment GroupDealHub riêng cho Arc Mainnet, hạn mức và rollout | Agent chuẩn bị; chủ dự án kiểm soát ví và quyết định phát hành | Không dùng địa chỉ deployment Testnet; review code/authority và quy trình emergency trước tiền thật |
| 5 | Tích hợp App Kit Swap và quote service cho token/chain hỗ trợ | Agent | Quote gắn sender/recipient/chain/token/amount; có minReceived/slippage/deadline, phí rõ, API key chỉ server, không giữ private key buyer |
| 6 | Nối Swap/CCTP vào checkout và rollout từng route | Agent; chủ dự án test và ký | USDC đến đúng buyer trên Arc, kiểm lại campaign rồi approve/commit; sold-out giữ tiền trong ví, không tạo đơn giả; có recovery và fallback nạp thủ công |

Không hứa hỗ trợ mọi token/mạng. Sepolia hiện dùng không có tuyến Swap chính thức; không dùng Mainnet làm môi trường thử thay thế. Unified Balance chỉ là lựa chọn sau khi có nhu cầu USDC đã deposit; không tự lấy hoặc quy đổi mọi token ngoài ví. Onramp và Earn không tự được mở theo yêu cầu checkout này.
