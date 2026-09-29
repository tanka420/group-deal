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

**Gate:** G1-PASS; chưa đạt thì cấm deploy public testnet.

### G1.1 — Bắt buộc one-time challenge, bỏ legacy bypass

- [ ] Xóa nhánh `return` khi challenge không tồn tại trong `consumeWalletChallenge`.
- [ ] Frontend phải gọi `/api/auth/wallet/challenge` trước mọi `LINK_WALLET` và `SELLER_PAYOUT`.
- [ ] Challenge gắn `userId`, action, wallet, chainId, app origin/audience, issued-at, expiry và nonce ngẫu nhiên.
- [ ] Lưu hash challenge trong database transactional; consume cùng transaction với bind/update payout.
- [ ] Challenge cũ, sai action, sai account, sai wallet, sai domain, hết hạn, restart process hoặc replay đồng thời đều bị từ chối.

**Test bắt buộc:** unit + HTTP integration cho first use, second use, cross-account, cross-action, expiry, restart và hai request đồng thời.

### G1.2 — Thay ví server-custodial bằng Circle User-Controlled

- [ ] Tích hợp Circle User-Controlled wallet theo SDK/API hiện hành và threat model chính thức.
- [ ] Xóa `ethers.Wallet.createRandom()` cho user, trường `encryptedPrivateKey`, endpoint arbitrary `sign-message` và việc backend giải mã khóa user.
- [ ] Transaction policy ràng buộc chain, contract, selector, spender, amount, campaign/order và intent ID.
- [ ] Thiết kế recovery và emergency-dispute do buyer kiểm soát khi app/backend không hoạt động.
- [ ] External EVM wallet vẫn được hỗ trợ với binding nguyên tử một-wallet-một-account.

**Quyết định không được để mở:** nếu không tích hợp Circle User-Controlled, phải sửa `PLAN.md`/phạm vi sản phẩm bằng quyết định của chủ dự án; không được tiếp tục gắn nhãn Circle cho custodial relayer.

### G1.3 — Tích hợp wallet/App Kit đúng vai trò, không trộn ba sản phẩm khác nhau

- [ ] **Reown AppKit cho ví EVM bên ngoài:** thay kết nối `window.ethereum` tự viết bằng connector/session chuẩn; cấu hình Arc Testnet như custom EVM network nếu adapter yêu cầu.
- [ ] Test MetaMask, WalletConnect QR/mobile wallet, account switch, chain switch, reconnect, disconnect, rejected signature và stale session.
- [ ] **Circle User-Controlled Wallet SDK:** giữ là luồng ví nhúng riêng của G1.2; không coi Reown AppKit email/social wallet là bằng chứng thay thế Circle User-Controlled.
- [ ] **Arc App Kit Bridge/CCTP V2:** đưa vào funding UX v1 để buyer chuyển USDC từ chain được hỗ trợ sang Arc; hiển thị quote expiry, fee, operation/progress, retry và destination balance trước khi cho commit.
- [ ] **Arc App Kit Onramp:** thực hiện spike sandbox bắt buộc; chỉ bật sau feature flag khi quốc gia, KYC/compliance, CSP/iframe, server-side session, lifecycle/webhook, fee và support flow đều qua gate.
- [ ] **Không đưa vào v1:** Swap, Send và Earn. Unified Balance/Gateway chỉ xem xét sau v1; mọi thay đổi quyết định phải có product/security review và test surface riêng.
- [ ] Mọi App Kit phải dùng adapter chính thức, khóa phiên bản, CSP/domain configuration và integration test; không nhúng API key/secret vào bundle frontend.
- [ ] Preflight mua hàng đọc một số dư USDC ERC-20 6 decimals, ước lượng gas USDC riêng và kiểm `commitment + gas`; cấm cộng native balance với ERC-20 balance.

**Tài liệu chuẩn cần chốt khi thực thi:** Circle Wallets/User-Controlled Wallets, Arc App Kit và Reown AppKit React/Ethers từ tài liệu chính thức hiện hành. Không dùng tên “AppKit” chung chung trong ticket hoặc báo cáo.

### G1.4 — Email OTP và strong auth thật

- [ ] Tích hợp email provider production; response chống enumeration và không chứa OTP.
- [ ] Rate limit theo email, IP và device; cooldown, attempt cap, TTL, audit và alert abuse.
- [ ] Tắt toàn bộ demo operator/seller/campaign seed khi `NODE_ENV=production`.
- [ ] Operator và seller dùng MFA/step-up cho dispute resolution, badge, payout change, cancel và secret rotation.
- [ ] Fail-fast tất cả secret production, gồm campaign identity secret và deployer/operator credentials.

### G1.5 — Receipt/event verifier dùng chung

- [ ] Xây `verifyExpectedTransaction(intent, txHash)` kiểm:
  - chain ID và deterministic finality của Arc;
  - `tx.to` đúng contract;
  - sender/principal đúng;
  - selector và calldata đúng intent;
  - receipt status bằng 1;
  - log emitter đúng contract;
  - event campaign/order/termsHash/proofHash/amount đúng;
  - tx hash chưa gắn intent khác.
- [ ] Draft không được gán `onchainCampaignId` trước event `CampaignCreated`.
- [ ] Mọi operation có state `PENDING_BROADCAST`, `PENDING_FINALITY`, `CONFIRMED`, `REVERTED`, `REPLACED`, `DROPPED`, `RECONCILING`.

### G1.6 — Xóa toàn bộ cập nhật tài chính DB-only

- [ ] `confirmReceipt`, `openDispute`, `resolveDispute`, SLA breach và auto-settlement phải gửi/nhận tx onchain.
- [ ] Route trả operation/tx state; không trực tiếp set `sellerAllocated`, `buyerRefundAllocated` hoặc trạng thái cuối.
- [ ] Indexer đã xác minh event mới cập nhật projection.
- [ ] Retry dùng operation ID/idempotency key, không phát nhiều giao dịch ngoài ý muốn.

**Bằng chứng thoát G1:**

- Static search không còn đường tạo/lưu/decrypt private key user.
- Integration test chứng minh receipt hợp lệ nhưng sai contract/event/intent không thể kích hoạt success.
- Tắt RPC sau broadcast giữ trạng thái `PENDING/RECONCILING`, không chuyển FAILED/SUCCESS tùy tiện.
- Hai request replay/concurrent không bind lại ví hoặc xử lý tiền hai lần.

## 5. Giai đoạn G2 — Contract, accounting, terms và Security Multisig

**Mục tiêu:** Không kẹt tiền theo quy mô, quyền hủy đúng và authorization/terms ràng buộc đầy đủ.

**Ước lượng:** 4–7 ngày.

**Gate:** G2-PASS.

### G2.1 — Finalize/cancel O(1) và allocation lazy/batch

- [ ] `finalizeCampaign` chỉ chốt status/final price/tier; không lặp order.
- [ ] `emergencyCancelCampaign` chỉ chốt cancel/reason; refund chưa phân bổ được tính lazy per order hoặc batch có cursor.
- [ ] Claim buyer/seller xử lý danh sách do caller cung cấp với giới hạn batch rõ; một order lỗi không làm kẹt toàn campaign nếu thiết kế yêu cầu partial progress.
- [ ] Event đủ dữ liệu để indexer dựng chính xác allocation/claim.
- [ ] Gas test tại các mốc 1, 100, 1.000 và 10.000 order chứng minh finalize/cancel không tăng tuyến tính theo toàn campaign.

### G2.2 — Security Authority là multisig vận hành thật

- [ ] Constructor/deploy yêu cầu security authority riêng, không mặc định operator/deployer.
- [ ] Rotation two-step, event đầy đủ và runbook signer/quorum.
- [ ] Test owner/operator đơn lẻ bị từ chối; chỉ multisig test fixture thực hiện cancel.
- [ ] Arc manifest ghi địa chỉ multisig, owners/quorum theo bằng chứng không nhạy cảm.

### G2.3 — Terms schema/version đầy đủ

- [ ] Định nghĩa `TermsV1` canonical gồm metric, tiers, duration/deadline, inventory, max/account, entitlement method/SLA, cancellation/refund, early rebate amount/bps/slots, fee, payout wallet và content/version identifiers cần thiết.
- [ ] Terms hash backend/contract/test cùng một encoder/version; không hash object tùy ý thiếu field.
- [ ] Sau first commitment, test chứng minh mọi field vật chất bị khóa; amendment không vật chất có lịch sử riêng.

### G2.4 — Authorization đúng quantity và fail-closed

- [ ] EIP-712 ký quantity yêu cầu, chain, contract, campaign, terms, identity, wallet, action, nonce, deadline.
- [ ] Không fallback sang local nonce khi RPC/state contract không xác minh được.
- [ ] Test sai quantity, terms, wallet, chain, campaign, nonce, action và expiry đều revert.

### G2.5 — Accounting model độc lập và stateful fuzz

- [ ] Reference model không sao chép cấu trúc triển khai contract.
- [ ] Stateful differential fuzz nhiều buyer/wallet/order qua commit, tier, finalize, delivery, confirm, dispute, timeout, cancel và claims xen kẽ.
- [ ] Race inventory/early slot bằng transaction cạnh tranh; invariant conservation kiểm sau mọi bước.

**Bằng chứng thoát G2:** contract audit test xanh, gas report đạt ngưỡng, không loop toàn campaign trong các hàm bắt buộc và independent review không còn P0/P1 accounting.

## 6. Giai đoạn G3 — Indexer, database, reconciliation và webhook

**Mục tiêu:** Có thể rebuild nguồn đọc, chịu restart/gap/RPC outage và vận hành có phục hồi theo deterministic finality của Arc.

**Ước lượng:** 6–10 ngày.

**Gate:** G3-PASS.

### G3.1 — Database transactional và migration

- [ ] Chuyển JSON store sang PostgreSQL hoặc database có transaction/unique constraint phù hợp.
- [ ] Unique index cho email, wallet binding, chain+contract+tx+logIndex, operation ID và idempotency key.
- [ ] Versioned migrations với forward/backward policy; không auto-seed production.
- [ ] Audit append-only/tamper-evident cho thao tác nhạy cảm.

### G3.2 — Arc indexer finality, backfill và rebuild

- [ ] Manifest chứa chainId, contract, deployment block, artifact/bytecode hash.
- [ ] WebSocket nhận block/event mới; HTTP backfill từ checkpoint khi restart, đứt kết nối hoặc phát hiện gap.
- [ ] Journal lưu block number/hash, transaction index, chain, contract/emitter, tx và log index; unique/idempotent theo chain+emitter+tx+logIndex.
- [ ] Project ngay sau Arc finality; không thêm confirmation buffer hoặc reorg rollback kiểu Ethereum. Block hash vẫn lưu để audit và fixed-block reconciliation.
- [ ] Sắp thứ tự bằng block number/transaction index/log index, không dùng timestamp cho event order.
- [ ] Rebuild từ deployment block vào schema trống cho kết quả deterministic.
- [ ] Không map campaign/order bằng giả định local ID bằng onchain ID.
- [ ] `FundsClaimed` phải có định danh đủ hoặc projection đọc contract state per order để không đánh dấu hàng loạt sai.
- [ ] Theo dõi event `GroupDealHub` làm nguồn chính; USDC Transfer/blocklist/CCTP event chỉ phục vụ đối soát, funding và cảnh báo theo emitter/address đã được G0 xác minh.

### G3.3 — Reconciliation tại fixed block

- [ ] Chụp block number/hash; đọc balance, campaign escrow, order allocations và claimed amounts tại cùng block/tag.
- [ ] So contract state với projection per campaign/order và aggregate.
- [ ] Trạng thái gồm `HEALTHY`, `UNVERIFIED`, `STALE`, `ERROR`, `DISCREPANCY_DETECTED`; có severity/alert.
- [ ] Test RPC down, stale provider, WebSocket gap, backfill, shortfall, surplus, missing event và corrupted projection.

### G3.4 — Backup/restore/retention

- [ ] Backup mã hóa, retention, access control và PITR.
- [ ] Restore drill vào môi trường sạch; chạy indexer rebuild/reconciliation sau restore.
- [ ] Chính sách lưu/xóa PII, entitlement và evidence; log không chứa secret.

### G3.5 — Webhook bền vững và chống SSRF đầy đủ

- [ ] Persistent queue, stable event ID, retry schedule, idempotency contract và DLQ có replay/audit.
- [ ] HTTPS-only production; allow port policy; giới hạn body/response/time.
- [ ] Resolve mọi A/AAAA, chặn private/metadata/special ranges, pin connection target và kiểm lại từng redirect.
- [ ] Egress proxy/firewall nếu hạ tầng hỗ trợ; test DNS rebinding và redirect-to-private.

**Bằng chứng thoát G3:** restart/gap/backfill/rebuild/restore tests xanh; projection sau rebuild bằng projection trước; webhook job sống qua process crash và DLQ replay được; reconciliation đúng tại block đã ghi.

## 7. Giai đoạn G4 — Hoàn thiện sản phẩm, delivery, UX và vận hành

**Mục tiêu:** Đáp ứng toàn bộ hành trình buyer/seller/operator, không chỉ contract primitives.

**Ước lượng:** 8–15 ngày.

**Gate:** G4-PASS.

### G4.1 — Delivery adapters thực

- [ ] License inventory cấp phát nguyên tử, không cấp trùng.
- [ ] Protected file/signed URL có expiry, authorization và revocation policy.
- [ ] Account invite/activation có idempotency và status callback.
- [ ] Seller webhook/API activation dùng queue/DLQ của G3.
- [ ] Dry-run gọi adapter sandbox/thật tương ứng; encryption roundtrip đơn thuần không được tính PASS.

### G4.2 — Seller campaign wizard đầy đủ

- [ ] Add/remove 2–5 tier; validate threshold tăng, price giảm ở UI/API/contract.
- [ ] Duration từ 24 giờ đến 30 ngày; public/unlisted; inventory behavior; max/account.
- [ ] Early rebate fixed hoặc percent; cancellation/refund policy; delivery method/SLA; fee v1 bằng 0.
- [ ] Hiển thị canonical terms và terms hash trước publish.

### G4.3 — Buyer/operator/support/review/notification

- [ ] Buyer thấy gas USDC và commitment USDC là hai khoản riêng, tổng cần có, pending/replaced/reverted/reconciling và claimable theo chain.
- [ ] Funding panel có Faucet cho test, Arc App Kit Bridge cho cross-chain USDC và Onramp chỉ khi feature gate đã PASS; funding operation không được đánh đồng với purchase operation.
- [ ] Support thread/evidence bổ sung; review một lần và seller reply.
- [ ] Operator dashboard dùng strong auth, audit và operation status onchain.
- [ ] Email + in-app notifications có preference/retry và không rò PII.
- [ ] Seller profile/metrics và rights badge gắn đúng product/campaign, không phải một boolean toàn seller.

### G4.4 — Error UX, i18n, accessibility và responsive

- [ ] Phân biệt loading, empty, 404, network error, provider down và indexer stale; có retry/action phù hợp.
- [ ] Vietnamese đầy đủ và English cho toàn bộ core flow.
- [ ] Keyboard/focus/label/contrast audit; desktop, 320/375/768px và landscape.
- [ ] Widget là HTML/read-only component thực, không trỏ endpoint JSON.
- [ ] Code-split frontend để xử lý cảnh báo bundle nếu ảnh hưởng performance budget.

### G4.5 — Observability và incident response

- [ ] Structured logs đã redact, metrics, traces, SLO và alert cho RPC/indexer/reconciliation/queue/DB/auth.
- [ ] Runbook provider outage, WebSocket gap/backfill, stuck tx, Arc blocklist behavior, key/secret incident, webhook backlog và restore.
- [ ] Diễn tập ít nhất một outage và một restore; lưu kết quả.

**Bằng chứng thoát G4:** browser E2E đa account chạy trên desktop/mobile; adapter integration tests; accessibility scan + manual core keyboard test; notification/webhook/incident evidence.

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
