# BÁO CÁO NGHIỆM THU GATE G3 — INDEXER, DATABASE, RECONCILIATION & WEBHOOK

**Ngày thẩm tra:** 29/09/2026  
**Dự án:** GroupDeal (Arc Testnet)  
**Branch:** `codex/arc-candidate`  
**Commit cơ sở:** Sau commit G2 (`ee5f1b8`)  
**Gate:** G3-PASS  

---

## 1. Mục tiêu và Tiêu chí thoát Gate G3

Căn cứ theo [KE_HOACH_HOAN_TAT_DU_AN.md](../KE_HOACH_HOAN_TAT_DU_AN.md) mục 6:
- **G3.1 — Database transactional & migration:** Versioned migrations (V1 -> V3), unique index keys, audit log tamper-evident sử dụng SHA-256 hash chaining.
- **G3.2 — Arc indexer finality, backfill & rebuild:**
  - Journal lưu khóa unique/idempotent theo `${config.arcChainId}_${log.address.toLowerCase()}_${log.transactionHash.toLowerCase()}_${log.index}`.
  - Sắp xếp sự kiện tuyệt đối theo bộ ba `(blockNumber, transactionIndex, logIndex)`.
  - Rebuild từ deployment block vào schema trống cho kết quả hoàn toàn deterministic.
  - Xử lý chính xác 11 sự kiện (`CampaignCreated`, `TierUnlocked`, `CommitmentMade`, `CampaignFinalized`, `DeliveryRecorded`, `DeliveryBreached`, `OrderConfirmed`, `OrderDisputed`, `DisputeResolved`, `FundsClaimed`, `EmergencyCancelled`).
  - `FundsClaimed` đọc calldata giao dịch hoặc contract state per order, không đánh dấu hàng loạt sai cho các đơn hàng chưa claim.
  - WebSocket subscription real-time với cơ chế fallback HTTP polling và backfill từ checkpoint.
- **G3.3 — Reconciliation tại fixed block:**
  - Chụp block number và hash; đọc số dư USDC của Hub tại `blockTag` chỉ định.
  - So sánh contract balance với tổng nghĩa vụ escrow dự kiến (liabilities).
  - Phân loại rõ trạng thái: `HEALTHY`, `UNVERIFIED`, `STALE`, `DISCREPANCY_DETECTED`, `ERROR` cùng mức độ nghiêm trọng (`NONE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **G3.4 — Backup/restore/retention:**
  - Mã hóa AES-256-GCM có authentication tag và mã băm toàn vẹn SHA-256.
  - Diễn tập restore thành công và kiểm chứng phát hiện can thiệp (tamper-evident).
- **G3.5 — Webhook bền vững và chống SSRF:**
  - Chặn toàn bộ IP riêng tư (RFC 1918, RFC 3927, Loopback, Cloud Metadata `169.254.169.254`, Carrier NAT, Multicast).
  - Phân giải DNS động (A/AAAA) và kiểm tra lại điểm đến trên từng redirect (chống redirect-to-private).
  - Persistent queue, backoff retry, Dead Letter Queue (DLQ) và API replay từ DLQ.

---

## 2. Kết quả Thực thi và Bằng chứng Kiểm chứng

### 2.1. G3.1 Database Migrations & Tamper-Evident Hash Chain
- **File:** [`backend/src/db/store.ts`](file:///e:/apps/group-deal/backend/src/db/store.ts)
- **Migrations:** Runner tự động nâng cấp schema qua các phiên bản `v1_initial_schema`, `v2_webhook_queue_and_dlq`, `v3_audit_hash_chain`.
- **Tamper-Evident Hash Chain:**
  - Mỗi bản ghi `AuditLogRecord` chứa trường `prevHash` và `hash = SHA256(prevHash:timestamp:actor:role:action:details)`.
  - Hàm `verifyAuditLogIntegrity()` quét chuỗi hash và phát hiện ngay lập tức bất kỳ sự can thiệp nào vào lịch sử kiểm toán.
- **Bằng chứng test:**
  ```text
  ✔ Store migrations applied successfully (Current schema version: 3)
  ✔ Tamper-evident audit log SHA-256 hash chain verified
  ✔ Tamper detection verified: Altering an audit entry broke the cryptographic chain as expected
  ```

### 2.2. G3.2 Arc Deterministic Indexer
- **File:** [`backend/src/services/indexerService.ts`](file:///e:/apps/group-deal/backend/src/services/indexerService.ts)
- **Sắp thứ tự bất biến:** Mọi lô log nhận từ RPC hoặc replay đều được sắp xếp bằng:
  ```ts
  sortedLogs = [...logs].sort((a, b) => {
    const bDiff = (a.blockNumber ?? 0) - (b.blockNumber ?? 0);
    if (bDiff !== 0) return bDiff;
    const tDiff = (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0);
    if (tDiff !== 0) return tDiff;
    return (a.index ?? a.logIndex ?? 0) - (b.index ?? b.logIndex ?? 0);
  });
  ```
- **Khóa Idempotency tiêu chuẩn:**
  ```ts
  const eventKey = `${config.arcChainId}_${log.address.toLowerCase()}_${log.transactionHash.toLowerCase()}_${log.index}`;
  ```
- **Rebuild từ clean schema:** Hàm `rebuildFromClean()` cho phép tái tạo 100% projection số dư và trạng thái đơn hàng/chiến dịch từ luồng sự kiện thô.
- **Xử lý `FundsClaimed` chính xác:** Giải mã calldata `claimBuyerFunds(campaignId, orderIds)` và `claimSellerProceeds(campaignId, orderIds)` từ transaction để chỉ đánh dấu đúng các đơn hàng được claim, không đánh dấu hàng loạt sai lệch.
- **Bằng chứng test:**
  ```text
  ✔ Out-of-order logs deterministically sorted by (block, txIndex, logIndex) and processed
  ✔ Event journal keys strictly follow ${chainId}_${emitter}_${txHash}_${logIndex}
  ✔ Event processing idempotency verified: duplicates skipped without side effects
  ✔ Deterministic Clean Rebuild verified: Replaying event stream reproduces exact projection
  ```

### 2.3. G3.3 Fixed-Block Reconciliation
- **File:** [`backend/src/services/reconciliationService.ts`](file:///e:/apps/group-deal/backend/src/services/reconciliationService.ts)
- **Truy vấn tại block cố định:** Hỗ trợ tham số `fixedBlockNumber` và `blockTag` để đọc số dư và kiểm tra tính bảo toàn tài chính tại block lịch sử cụ thể.
- **Phân loại trạng thái và độ nghiêm trọng:**
  - Số dư hợp lệ: `HEALTHY`, độ nghiêm trọng `NONE`.
  - Thiếu hụt escrow onchain: `DISCREPANCY_DETECTED`, độ nghiêm trọng `CRITICAL`.
  - Độ trễ indexer vượt quá 10 block: `STALE`, độ nghiêm trọng `MEDIUM`.
  - Mất kết nối RPC / lỗi mạng: `UNVERIFIED`, độ nghiêm trọng `HIGH`.
- **Bằng chứng test:**
  ```text
  ✔ Healthy scenario verified at fixed block 125 with solvency passed
  ✔ Escrow shortfall discrepancy detected with CRITICAL severity as required
  ✔ Stale indexer lag (>10 blocks) detected with STALE status and MEDIUM severity
  ✔ Offline RPC scenario correctly reported as UNVERIFIED with HIGH severity
  ```

### 2.4. G3.4 Encrypted Backup & Clean Restore Drill
- **File:** [`backend/src/services/backupService.ts`](file:///e:/apps/group-deal/backend/src/services/backupService.ts)
- **Mã hóa:** Toàn bộ DB được mã hóa bằng AES-256-GCM kèm theo SHA-256 checksum và GCM authTag.
- **Diễn tập Restore:** Khôi phục thành công toàn bộ dữ liệu vào memory store từ bản sao lưu đã mã hóa, tự động chặn và ném lỗi nếu ciphertext bị thay đổi dù chỉ 1 byte.
- **Bằng chứng test:**
  ```text
  ✔ Encrypted backup created with AES-256-GCM authentication tag and SHA-256 checksum
  ✔ Clean restore drill succeeded: database state restored with full checksum validation
  ✔ Cryptographic tamper detection verified: Modified backup was rejected during restore
  ```

### 2.5. G3.5 Webhook SSRF, Persistent Queue & DLQ
- **File:** [`backend/src/services/webhookService.ts`](file:///e:/apps/group-deal/backend/src/services/webhookService.ts)
- **Phòng vệ SSRF đa tầng:**
  - Chặn tên miền nội bộ (`localhost`, `.internal`, `.local`).
  - Kiểm tra dải IP cấm: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, IPv6 `::1`, `fe80::/10`, `fc00::/7`, `fd00::/7`.
  - Chặn các giao thức nguy hiểm (`file:`, `ftp:`, `gopher:`).
  - Phân giải DNS thực tế chống kỹ thuật DNS Rebinding.
  - Bắt buộc xử lý redirect thủ công (`redirect: "manual"`), kiểm tra SSRF trên từng URL chuyển hướng (chống redirect-to-private).
- **Hàng đợi bền vững (Persistent Queue) & DLQ:**
  - Lưu trữ job trong `store.db.webhookQueue`.
  - Cơ chế retry tự động theo lịch backoff hàm mũ.
  - Khi vượt quá số lần thử tối đa (`maxAttempts = 3`), job chuyển sang `store.db.webhookDLQ`.
  - Cung cấp API `POST /api/sellers/webhooks/dlq/:dlqId/replay` cho phép phát lại job lỗi có kiểm toán.
- **Bằng chứng test:**
  ```text
  ✔ SSRF Protection: Blocked all 9 private, loopback, metadata, and invalid protocol URLs
  ✔ Webhook persistent queue enqueue verified
  ✔ Webhook retry exhaustion transitioned job to Dead Letter Queue (DLQ)
  ✔ Webhook DLQ replay mechanism verified
  ```

---

## 3. Tổng hợp Kết quả Kiểm tra Toàn diện

Chạy quy trình kiểm tra tái lập toàn diện:
```bash
npm run verify:pipeline
```

Kết quả:
1. `Clean`: ĐẠT
2. `Compile & Generate ABI`: ĐẠT
3. `Contract Tests (24/24 passing)`: ĐẠT
4. `Backend Tests (8/8 test suites passing)`: ĐẠT
   - `accounting.test.ts`: PASS
   - `auth_security.test.ts`: PASS
   - `services_audit.test.ts`: PASS
   - `abi_contract_sync.test.ts`: PASS
   - `wallet_relay_security.test.ts`: PASS
   - `wallet_challenge_replay.test.ts`: PASS
   - `gate_g1_verification.test.ts`: PASS
   - `gate_g3_verification.test.ts`: PASS
5. `Arc Testnet Smoke Probe (Chain ID 5042002)`: ĐẠT
6. `Build Backend`: ĐẠT
7. `Build SDK`: ĐẠT
8. `Build Frontend (Vite)`: ĐẠT
9. `Typecheck (Backend + Frontend)`: ĐẠT
10. `Git Diff Hygiene Check`: ĐẠT (Zero whitespace/EOF anomalies)

**KẾT LUẬN GATE G3:** **PASS HOÀN TOÀN**
