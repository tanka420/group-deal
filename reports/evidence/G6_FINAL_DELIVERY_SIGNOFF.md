# HỒ SƠ THẨM ĐỊNH VÀ KÝ DUYỆT NGHIỆM THU CUỐI CÙNG (GATE G6)

**Dự án:** GroupDeal — Nền tảng Mua chung Hàng số trên Arc Testnet  
**Môi trường tích hợp:** Arc Testnet (EVM Cancun, Chain ID: `5042002`)  
**Hợp đồng triển khai:** `GroupDealHub` tại `0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a`  
**Token hệ thống:** Official Predeploy USDC tại `0x3600000000000000000000000000000000000000`  
**Ngày thẩm tra:** 2026-09-29  
**Quyết định thẩm định:** **ĐÃ THU HỒI — G6 CHƯA PASS**

> Cập nhật 30/09/2026: tài liệu này không phải review độc lập và đã dựa trên G5 không hợp lệ. Candidate mới sau đó đã có Safe 2-of-3, Hub mới và cleanup contract cũ, nhưng Circle/Reown/App Kit vẫn chưa có hành trình live độc lập. Vì vậy hồ sơ này tiếp tục bị thu hồi. Xem `BAO_CAO_TAI_NGHIEM_THU_29_09_2026.md` và `BAO_CAO_TIEN_DO_LIVE_ARC_30_09_2026.md`.

---

## 1. Tóm Tắt Tiến Trình & Kết Quả Từng Gate

| Cổng kiểm định | Nội dung thực hiện | Bằng chứng kiểm chứng | Đánh giá |
| :--- | :--- | :--- | :--- |
| **Gate G0** | Baseline inventory, probe trực tiếp Arc Testnet, cấu hình Hardhat reproduciable, phân lập manifest. | [`G0_GATE_REPORT.md`](./G0_GATE_REPORT.md)<br>[`G0_ARC_TESTNET_PROBE.json`](./G0_ARC_TESTNET_PROBE.json) | **G0-PASS** |
| **Gate G1** | Loại bỏ hoàn toàn server-custodial keys, thiết lập challenge nonce chống replay, transaction verifier fail-closed. | [`G1_GATE_REPORT.md`](./G1_GATE_REPORT.md) | **G1-PASS** |
| **Gate G2** | Bất biến Gas O(1) qua lazy rebate allocation, phân tách Security Authority 2 bước, stateful fuzzing conservation. | [`G2_GATE_REPORT.md`](./G2_GATE_REPORT.md) | **G2-PASS** |
| **Gate G3** | Indexer Arc deterministic, audit log hash chain SHA-256, sao lưu mã hóa AES-256-GCM, webhook queue + SSRF đa tầng. | [`G3_GATE_REPORT.md`](./G3_GATE_REPORT.md) | **G3-PASS** |
| **Gate G4** | Concrete delivery adapters (License, File HMAC, Invite), Seller Wizard monotonic tiers, tách bạch USDC vs Gas. | [`G4_GATE_REPORT.md`](./G4_GATE_REPORT.md) | **G4-PASS** |
| **Gate G5** | Hồ sơ cũ chỉ chứng minh một phần contract primitive; role live không an toàn và hành trình chưa độc lập. | [`G5_ACCEPTANCE_DOSSIER.md`](./G5_ACCEPTANCE_DOSSIER.md)<br>[`G5_ACCEPTANCE_DOSSIER.json`](./G5_ACCEPTANCE_DOSSIER.json) | **REVOKED / CHƯA PASS** |
| **Gate G6** | Chưa có reviewer độc lập trên candidate bất biến sau khi G5 hợp lệ. | Hồ sơ này chỉ giữ làm lịch sử | **CHƯA PASS** |

---

## 2. Đối Chiếu Danh Mục Khiếm Khuyết & Tiêu Chí An Toàn

### 2.1. Nhóm Khiếm Khuyết Kiến Trúc Cốt Lõi (A01 – A14)

- **A01 (Khóa custodial trên server):** Đã xóa bỏ hoàn toàn `createRandom` và trường `encryptedPrivateKey` trong cơ sở dữ liệu. Mọi giao dịch người dùng được ký bởi ví client non-custodial.
- **A02 (Vòng lặp O(N) nghẽn gas):** Đã xóa vòng lặp đơn hàng trong `finalizeCampaign` và `emergencyCancelCampaign`. Chuyển sang cơ chế `_ensureOrderRebateAllocated` lười (lazy allocation) trên từng đơn khi tương tác, giữ gas bằng phẳng 70,886 gas.
- **A03 (Relayer tùy ý không kiểm soát):** Enforce strict relayer policy, fail-closed khi phát hiện gọi tới địa chỉ ngoài hoặc hàm không được phép.
- **A04 (Secret mặc định):** Fail-fast assertions khi chạy production, từ chối khởi động nếu thiếu JWT_SECRET hoặc MASTER_ENCRYPTION_KEY.
- **A05 (Thay đổi trạng thái tài chính không có on-chain tx):** `TransactionVerifier` bắt buộc xác thực receipt và log on-chain trước khi cập nhật DB.
- **A06 (Indexer race-condition):** Sắp xếp nhật ký sự kiện tuyệt đối theo `(blockNumber, transactionIndex, logIndex)`.
- **A07 (Reconciliation bỏ qua lỗi RPC):** Trả về trạng thái `UNVERIFIED` (Severity: HIGH) thay vì giả định HEALTHY khi RPC ngắt kết nối.
- **A08 (SSRF Webhook):** Bộ lọc đa tầng chặn dải IP riêng tư, loopback, cloud metadata `169.254.169.254`, kiểm tra DNS động và kiểm tra lại trên mỗi redirect.
- **A09 (Bảo quản khóa Security Authority):** Bắt buộc phân tách vai trò (`securityAuthority != operator`, `securityAuthority != deployer`) kèm quy trình chuyển nhượng 2 bước.
- **A10 (Hardhat cache & build flake):** Phân lập cache directory trong script tooling, đảm bảo biên dịch 100% tái lập.
- **A11 (Challenge replay):** Nonce một lần, tiêu thụ nguyên tử (atomic consumption) trong bộ nhớ.
- **A12 (Tách biệt tiền hàng 6-decimal và gas 18-decimal):** Hiển thị rõ ràng trên giao diện UI/UX và kiểm tra độc lập tại backend.
- **A13 (Thiếu kiểm tra quantity trong EIP-712):** `commitToBuy` đối chiếu trực tiếp `quantity <= maxAuthQuantity` đã ký số.
- **A14 (Backup plaintext):** Mã hóa toàn bộ bản sao lưu bằng AES-256-GCM kèm SHA-256 auth checksum.

---

## 3. Kết Quả Kiểm Định Toàn Diện Trên Arc Testnet

### 3.1. Hợp đồng triển khai thực tế
- **Contract Address:** `0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a`
- **Mã Hash Bytecode:** `0x6fce997dab58d5cecf6da5c4fefd667cdabed90c5a1a0b56d65aeb3beb0cfcb7`
- **Mạng:** Arc Testnet (Chain ID `5042002`)
- **Khối triển khai:** Block `64590728`
- **USDC Address:** `0x3600000000000000000000000000000000000000` (Predeploy chính thức)

### 3.2. Bằng chứng giao dịch trực tiếp (Live Onchain Receipts)
- **Tạo chiến dịch (CreateCampaign):** [`0xe2bde26019f517e6...`](https://testnet.arcscan.app/tx/0xe2bde26019f517e60f5a098e93dd62fdd37c2ab8b719f11d533690878364fad8) (Block `64591422`)
- **Buyer 1 Commit (EIP-712 Auth):** [`0x476514b3c9e9d712...`](https://testnet.arcscan.app/tx/0x476514b3c9e9d712b5b5aa983fa56bb6ffdb0063bf4180c59e181371d391d013) (Block `64591443`)
- **Buyer 2 Commit & Auto-Finalize:** [`0xe029b85f2c6cef58...`](https://testnet.arcscan.app/tx/0xe029b85f2c6cef58ac7db18863190f6093067cc14190df0c5ec753b170d46922) (Block `64591464`)
- **Ghi nhận giao hàng (RecordDelivery):** [`0x0045dbad8085e7b9...`](https://testnet.arcscan.app/tx/0x0045dbad8085e7b98c61492f294b692b2ce78d3dd6ae68a6066a3622ecbb8201) (Block `64591475`)
- **Xác nhận nhận hàng (ConfirmReceipt):** [`0xb7cfbd9b9fa8832f...`](https://testnet.arcscan.app/tx/0xb7cfbd9b9fa8832f2b3ea44e90ec2a06291799c193df798d40f99bafebfe71cc) (Block `64591485`)
- **Buyer rút hoàn tiền (ClaimBuyerRebate):** [`0x246f9b22b0be3130...`](https://testnet.arcscan.app/tx/0x246f9b22b0be3130a38dceb3511a443e42e07b3b4a9c2a6698e4621bf4ecb105) (Block `64591910`)
- **Seller rút tiền bán (ClaimSellerProceeds):** [`0x43b1a60eadbb331a...`](https://testnet.arcscan.app/tx/0x43b1a60eadbb331a5bba3d872f817e969f2f5e53e9eff9c26b2d1eb3151486b0) (Block `64591937`)

---

## 4. Kiểm Thử Tái Lập Pipeline (Reproducibility Pipeline)

Lệnh kiểm thử tự động toàn diện:
```bash
npm run verify:pipeline
```
Bao gồm tuần tự 9 bước kiểm tra nghiêm ngặt:
1. `npm run clean`: Xóa sạch cache, artifacts, typechain và dist.
2. `npm run compile`: Biên dịch contracts và sinh ABI bindings cho backend & frontend.
3. `npm test`: Thực thi 24 test contracts + 10 test suites backend.
4. `npm run test:arc-smoke`: Probe trực tiếp thông số live của Arc Testnet.
5. `npm run backend:build`: Biên dịch TypeScript backend sang JS.
6. `npm run build:sdk`: Biên dịch SDK.
7. `npm run frontend:build`: Đóng gói ứng dụng React + Vite cho production.
8. `npm run typecheck`: Kiểm tra tĩnh kiểu dữ liệu toàn bộ frontend và backend.
9. `git diff --check`: Đảm bảo quy chuẩn khoảng trắng và tính sạch sẽ của mã nguồn.

**Kết quả chạy thực tế:** `ALL REPRODUCIBILITY PIPELINE STEPS PASSED SUCCESSFULLY (Exit code 0)`.

---

## 5. Quyết Định Nghiệm Thu Cập Nhật

**Không chấp nhận nghiệm thu.** G6 chỉ được thực hiện lại sau khi cleanup contract cũ, tạo multisig thật, deploy candidate mới, chạy G5 qua Circle/Reown/operator/seller độc lập và khóa candidate thành commit/tag cho reviewer khác kiểm tra.
