# BÁO CÁO NGHIỆM THU GATE G0: CANDIDATE & TRUTH BASELINE

**Ngày thực hiện:** 29/09/2026  
**Trạng thái Gate:** **G0-PASS**  
**Branch:** `codex/arc-candidate`  
**Môi trường thử nghiệm:** Windows 10/11, Node.js `v24.11.1`, npm `11.6.2`

---

## 1. Mục tiêu và Tiêu chí nghiệm thu Gate G0

Gate G0 thiết lập mốc cơ sở (baseline) có thể tái lập 100%, bảo đảm môi trường kiểm thử nhất quán, loại bỏ hoàn toàn việc lẫn lộn cấu hình giữa Local và Arc Testnet, đồng thời thẩm định kết nối và các hành vi EVM đặc thù của Arc Testnet trước khi triển khai các gate nghiệp vụ tài chính.

### Danh mục hạng mục G0 đã hoàn tất và kiểm chứng:

| Mã | Hạng mục | Trạng thái | Bằng chứng thực tế |
|---|---|---|---|
| **G0.1** | Kiểm kê thay đổi hiện tại | **ĐẠT** | [G0_BASELINE_INVENTORY.md](../G0_BASELINE_INVENTORY.md), `git status`, `.gitignore` mở rộng ngăn rò rỉ secret/runtime data. |
| **G0.2** | Nhánh và commit baseline | **ĐẠT** | Nhánh `codex/arc-candidate`, loại bỏ toàn bộ file rác và runtime store khỏi Git. |
| **G0.3** | Sửa reproducibility tooling | **ĐẠT** | Hardhat `LOCALAPPDATA` workaround áp dụng tự động cho cả `compile` và `test`. Thêm `verify:pipeline` chạy toàn diện. |
| **G0.4** | Loại bỏ ABI chuỗi viết tay | **ĐẠT** | Tự động sinh `backend/src/contracts/hubAbi.ts` và `frontend/src/contracts/hubAbi.ts` trực tiếp từ artifact sau khi biên dịch. |
| **G0.5** | Kiểm chứng Arc Testnet trực tiếp | **ĐẠT** | Tách 2 manifest `local.json` và `arc-testnet.json`. Chạy probe trực tiếp lên RPC Arc Testnet xác thực chain ID 5042002, USDC predeploy và các hành vi EVM đặc thù. |

---

## 2. Kết quả Probe Arc Testnet Thực tế (Evidence)

Kết quả thăm dò trực tiếp từ RPC chính thức `https://rpc.testnet.arc.io` được lưu tại [reports/evidence/G0_ARC_TESTNET_PROBE.json](./G0_ARC_TESTNET_PROBE.json):

```json
{
  "network": "Arc Testnet",
  "chainIdExpected": 5042002,
  "chainIdActual": 5042002,
  "blockNumber": 64574450,
  "usdcPredeploy": {
    "address": "0x3600000000000000000000000000000000000000",
    "decimals": 6,
    "symbol": "USDC"
  },
  "cctp": {
    "domain": 26,
    "tokenMessenger": "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    "hasCode": true
  },
  "multicall3": {
    "address": "0xcA11bde05977b3631167028862bE2a173976CA11",
    "hasCode": true
  },
  "arcBehaviors": {
    "zeroAddressTransferReverts": true,
    "zeroAddressRevertMessage": "execution reverted: \"Zero address not allowed\"",
    "blocklistAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "blocklistTransferReverts": true,
    "minFeeFloorGwei": 25,
    "instantFinalityReport": {
      "baseFeePerGasGwei": "20.0"
    }
  }
}
```

### Các phát hiện kỹ thuật cốt lõi được mã hóa:
1. **USDC Predeploy:** `0x3600000000000000000000000000000000000000` là ERC-20 interface chuẩn (6 decimals), chia sẻ chung số dư với Native gas token (18 decimals).
2. **Revert Zero Address:** Lệnh gửi Native value tới `0x0000000000000000000000000000000000000000` revert với lỗi `"Zero address not allowed"`.
3. **Revert Blocklist:** Địa chỉ test blocklist `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` revert ngay khi thực hiện giao dịch chuyển giá trị.
4. **Base Fee Floor:** Base fee trên Arc Testnet duy trì tối thiểu 20.0 Gwei; mempool drop các giao dịch có `maxFeePerGas < 20 Gwei`.
5. **Deterministic Finality:** Block được xác nhận ngay sau khi xuất hiện trên block, không cần buffer 12 confirmation.

---

## 3. Quy trình Tái lập (Pipeline Verification)

Lệnh root duy nhất:
```bash
npm run verify:pipeline
```
Thực thi tuần tự 9 bước sạch:
1. `npm run clean`: Xóa toàn bộ cache, typechain-types, dist của contracts, backend, frontend, sdk.
2. `npm run compile`: Biên dịch contracts với safe Hardhat cache và tự động sinh ABI typed bindings.
3. `npm test`: Chạy toàn bộ test suites (Contracts 15/15 passing, Backend 10/10 passing).
4. `npm run test:arc-smoke`: Kết nối RPC live của Arc Testnet, kiểm tra chain ID, predeploy code, và probe hành vi EVM.
5. `npm run backend:build`: Build TypeScript backend sang dist.
6. `npm run build:sdk`: Build TypeScript SDK.
7. `npm run frontend:build`: Build bundle Vite React frontend.
8. `npm run typecheck`: Kiểm tra type toàn diện backend và frontend (`tsc --noEmit`), 0 lỗi.
9. `git diff --check`: Kiểm tra hygiene mã nguồn Git.

**Kết luận:** Gate G0 chính thức **ĐẠT (PASS)**. Đủ điều kiện chuyển sang Giai đoạn G1.
