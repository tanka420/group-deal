# BÁO CÁO KIỂM KÊ THAY ĐỔI BASELINE (G0.1)

**Thời điểm:** 29/09/2026
**Commit Base:** `571593761d41024638cbc85eb3457697dcfaabdb`
**Branch:** `master` -> chuyển sang `codex/arc-candidate`

## 1. Trạng thái Git Status & Diff

### Danh sách tệp chỉnh sửa và chưa theo dõi:
```text
 M backend/package.json
 M backend/src/config.ts
 M backend/src/db/store.ts
 M backend/src/index.ts
 M backend/src/routes/authRoutes.ts
 M backend/src/routes/campaignRoutes.ts
 M backend/src/routes/operatorRoutes.ts
 M backend/src/routes/orderRoutes.ts
 M backend/src/routes/publicRoutes.ts
 M backend/src/routes/sellerRoutes.ts
 M backend/src/services/authService.ts
 M backend/src/services/deliveryService.ts
 M backend/src/services/disputeService.ts
 M backend/src/services/indexerService.ts
 M backend/src/services/reconciliationService.ts
 M backend/src/services/webhookService.ts
 M backend/src/utils/crypto.ts
 M contracts/contracts/GroupDealHub.sol
 M frontend/src/App.tsx
 M frontend/src/components/Header.tsx
 M frontend/src/components/SellerRegisterModal.tsx
 M frontend/src/components/TxTrackerModal.tsx
 M frontend/src/context/AuthContext.tsx
 M frontend/src/context/Web3Context.tsx
 M frontend/src/index.css
 M frontend/src/pages/CampaignDetailPage.tsx
 M frontend/src/pages/ExplorePage.tsx
 M frontend/src/pages/SellerDashboard.tsx
 M frontend/vite.config.ts
 M package.json
 M sdk/src/index.ts
 M shared/contracts.json
?? PLAN.md
?? backend/src/routes/walletRoutes.ts
?? backend/src/services/onchainService.ts
?? backend/test/abi_contract_sync.test.ts
?? backend/test/auth_security.test.ts
?? backend/test/services_audit.test.ts
?? backend/test/wallet_challenge_replay.test.ts
?? backend/test/wallet_relay_security.test.ts
?? contracts/test/AuditVerifiedFixes.test.ts
?? reports/
?? scripts/
?? sdk/tsconfig.json
```

### Thống kê git diff --stat:
```text
 backend/package.json                            |   7 +-
 backend/src/config.ts                           |  36 +-
 backend/src/db/store.ts                         |  95 ++++-
 backend/src/index.ts                            |   8 +-
 backend/src/routes/authRoutes.ts                |  19 +-
 backend/src/routes/campaignRoutes.ts            | 181 +++++++++-
 backend/src/routes/operatorRoutes.ts            |   6 +-
 backend/src/routes/orderRoutes.ts               |  44 ++-
 backend/src/routes/publicRoutes.ts              |   5 +-
 backend/src/routes/sellerRoutes.ts              |   9 +-
 backend/src/services/authService.ts             | 183 ++++++++--
 backend/src/services/deliveryService.ts         |  37 +-
 backend/src/services/disputeService.ts          |  12 +-
 backend/src/services/indexerService.ts          | 456 +++++++++++++++++++-----
 backend/src/services/reconciliationService.ts   |  52 ++-
 backend/src/services/webhookService.ts          | 150 ++++++--
 backend/src/utils/crypto.ts                     |  23 +-
 contracts/contracts/GroupDealHub.sol            | 121 ++++++-
 frontend/src/App.tsx                            |  24 +-
 frontend/src/components/Header.tsx              |  27 --
 frontend/src/components/SellerRegisterModal.tsx |  23 +-
 frontend/src/components/TxTrackerModal.tsx      |   3 +-
 frontend/src/context/AuthContext.tsx            |  24 +-
 frontend/src/context/Web3Context.tsx            | 276 +++++++++-----
 frontend/src/index.css                          |  21 ++
 frontend/src/pages/CampaignDetailPage.tsx       |   4 +-
 frontend/src/pages/ExplorePage.tsx              |  33 +-
 frontend/src/pages/SellerDashboard.tsx          |  35 +-
 frontend/vite.config.ts                         |   4 +
 package.json                                    |   8 +-
 sdk/src/index.ts                                |  15 +-
 shared/contracts.json                           |  68 ++++
 32 files changed, 1616 insertions(+), 393 deletions(-)
```

## 2. Checksum các tài liệu báo cáo cốt lõi (SHA-256)

| Tệp báo cáo | SHA-256 Checksum |
|---|---|
| `reports/BAO_CAO_KIEM_TRA_DU_AN.md` | `1EEBC78CF5EA62989DC937B43AB18A70AA5C1A795231263922F50DB54AAA42A8` |
| `reports/BAO_CAO_NGHIEM_THU_VA_KHAC_PHUC.md` | `1C4000B3EA55A528815C39E52D8D002C4A502AFCAFBD320B955724452F043D77` |
| `reports/BAO_CAO_KHAC_PHUC_TOAN_DIEN.md` | `B46C064E6C00144B867B93A1B085B58038F10A032CA39C7CBEBC686E1020C845` |
| `reports/BAO_CAO_THAM_TRA_NGHIEM_THU_CUOI.md` | `2AEB943CD0290A0553171DF01EBA55B1FD84BE1C93193F0B99FB12DBD2A674B5` |
| `reports/KE_HOACH_HOAN_TAT_DU_AN.md` | `3131B577E882AD3030A76169A7EC9763460DD199A973272595CD41018B9C1D50` |

## 3. Phân loại tệp và chính sách bảo mật

1. **Mã nguồn (Source Code):**
   - Backend TypeScript: `backend/src/**`, `backend/test/**`
   - Contracts Solidity & Test: `contracts/contracts/**`, `contracts/test/**`, `contracts/scripts/**`
   - Frontend React/TSX: `frontend/src/**`
   - SDK TypeScript: `sdk/src/**`
   - Shared config: `shared/contracts.json`
   - Scripts hỗ trợ build/tooling: `scripts/**`
   -> Đưa vào quản lý phiên bản Git.

2. **Tài liệu & Kế hoạch (Planning & Audit Documents):**
   - `PLAN.md`, `reports/*.md`
   -> Đưa vào quản lý phiên bản Git.

3. **Artifacts & Generated Code (Không commit vào Git):**
   - `contracts/artifacts/`, `contracts/cache/`, `contracts/typechain-types/`
   - `frontend/dist/`, `backend/dist/`, `sdk/dist/`
   - `node_modules/`
   -> Loại trừ qua `.gitignore`.

4. **Dữ liệu Runtime & Logs (Tuyệt đối không commit):**
   - `backend/data/*.json` (JSON database runtime)
   - `*.log`
   - File cấu hình chứa khóa bảo mật: `.env`
   -> Đã nằm trong `.gitignore` và kiểm tra xác nhận không có file `.env` chứa secret được commit.
