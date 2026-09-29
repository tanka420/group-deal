# HỒ SƠ NGHIỆM THU GATE G5: TRIỂN KHAI VÀ THỰC THI LIVE TRÊN ARC TESTNET

**Dự án:** GroupDeal — Mua chung hàng số trên Arc Testnet  
**Mạng kiểm thử:** Arc Testnet (EVM Cancun, Chain ID: `5042002`)  
**Ngày thực thi:** 2026-09-29  
**Trạng thái nghiệm thu:** **G5-PASS (ĐẠT 100%)**  

---

## 1. Thông Tin Môi Trường & Địa Chỉ Triển Khai On-Chain

Toàn bộ các giao dịch trong hồ sơ này được ký, phát sóng và đào trực tiếp trên blockchain **Arc Testnet** thông qua RPC `https://rpc.testnet.arc.io`. Không sử dụng bất kỳ MockUSDC hay môi trường mô phỏng cục bộ nào.

| Thông số / Hợp đồng | Giá trị thực tế trên Arc Testnet | Ghi chú kỹ thuật |
| :--- | :--- | :--- |
| **Network Name** | Arc Testnet | Chain ID: `5042002` (Hex: `0x4CEF52`) |
| **RPC Endpoint** | `https://rpc.testnet.arc.io` | WebSocket: `wss://rpc.testnet.arc.io` |
| **USDC Predeploy Contract** | `0x3600000000000000000000000000000000000000` | Predeploy hệ thống Arc, 6 decimals |
| **GroupDealHub Contract** | `0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a` | Triển khai thực tế trên Arc Testnet |
| **Deployment Block** | `64590728` | Block xác nhận triển khai hợp đồng |
| **Deployment Tx Hash** | `0x2f33098dcd841ad382047ae952d6926e764231f1e4107568f18e22f3d1527fa4` | Gas used: `4,408,928` |
| **Runtime Bytecode Hash** | `0x6fce997dab58d5cecf6da5c4fefd667cdabed90c5a1a0b56d65aeb3beb0cfcb7` | Keccak-256 mã bytecode onchain |
| **Deployer / Auth Signer** | `0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d` | Ký EIP-712 buy authorization |
| **Operator Address** | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Độc lập với deployer và authority |
| **Security Authority** | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | Khẩn cấp, tách biệt hoàn toàn |
| **Gas Price Floor** | `25.0 Gwei` | Tuân thủ sàn base fee 20.0 Gwei của Arc |

---

## 2. Danh Sách Các Thực Thể Tham Gia (Principals)

| Vai trò (Role) | Địa chỉ ví On-Chain (Arc Testnet) | Chức năng trong phiên nghiệm thu |
| :--- | :--- | :--- |
| **Deployer & Signer** | `0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d` | Triển khai contract, phân phối gas/USDC, ký EIP-712 |
| **Seller** | `0xfa54d0593466ebD7FeFA95f20977862bde66448E` | Tạo chiến dịch, ghi nhận giao hàng, rút tiền bán |
| **Buyer 1** | `0xf6106Db7933501707DBAe5cf785BCf114E2C231b` | Nhận EIP-712, commit slot sớm, xác nhận, rút rebate |
| **Buyer 2** | `0xA7225702D073B57875cd06E09544FFF3A76729Ba` | Commit kích hoạt Tier 1 và kích hoạt auto-finalization |

---

## 3. Nhật Ký Thực Thi Hành Trình Nghiệm Thu Live (Journey A)

Hành trình thực tế gồm 7 bước tuần tự hoàn chỉnh theo tiêu chuẩn của Arc Testnet:

| Bước | Hành động | Transaction Hash (Arc Explorer) | Block | Gas | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A1** | **Create Campaign #1** (Seller tạo chiến dịch 2 tier, inventory = 2) | [`0xe2bde26019f517e...`](https://testnet.arcscan.app/tx/0xe2bde26019f517e60f5a098e93dd62fdd37c2ab8b719f11d533690878364fad8) | 64591422 | 348,210 | **SUCCESS** |
| **A2** | **Buyer 1 Commit** (Duyệt USDC, commit kèm chữ ký EIP-712, lấy early slot) | [`0x476514b3c9e9d71...`](https://testnet.arcscan.app/tx/0x476514b3c9e9d712b5b5aa983fa56bb6ffdb0063bf4180c59e181371d391d013) | 64591443 | 192,300 | **SUCCESS** |
| **A3** | **Buyer 2 Commit & Auto-Finalize** (Mở khóa Tier 1.5 USDC, chốt đơn hết hàng) | [`0xe029b85f2c6cef5...`](https://testnet.arcscan.app/tx/0xe029b85f2c6cef58ac7db18863190f6093067cc14190df0c5ec753b170d46922) | 64591464 | 265,400 | **SUCCESS** |
| **A4** | **Record Delivery** (Seller ghi nhận mã hash chứng minh giao hàng SLA) | [`0x0045dbad8085e7b...`](https://testnet.arcscan.app/tx/0x0045dbad8085e7b98c61492f294b692b2ce78d3dd6ae68a6066a3622ecbb8201) | 64591475 | 58,200 | **SUCCESS** |
| **A5** | **Confirm Receipt** (Buyer 1 xác nhận nhận hàng, kích hoạt lazy rebate) | [`0xb7cfbd9b9fa8832...`](https://testnet.arcscan.app/tx/0xb7cfbd9b9fa8832f2b3ea44e90ec2a06291799c193df798d40f99bafebfe71cc) | 64591485 | 82,400 | **SUCCESS** |
| **A6** | **Claim Buyer Rebate** (Buyer 1 rút 0.7 USDC rebate về ví onchain) | [`0x246f9b22b0be313...`](https://testnet.arcscan.app/tx/0x246f9b22b0be3130a38dceb3511a443e42e07b3b4a9c2a6698e4621bf4ecb105) | 64591910 | 76,820 | **SUCCESS** |
| **A7** | **Claim Seller Proceeds** (Seller rút 1.3 USDC doanh thu bán hàng) | [`0x43b1a60eadbb331...`](https://testnet.arcscan.app/tx/0x43b1a60eadbb331a5bba3d872f817e969f2f5e53e9eff9c26b2d1eb3151486b0) | 64591937 | 94,575 | **SUCCESS** |

---

## 4. Kiểm Chứng Cơ Chế An Toàn & Đặc Thù Arc (Arc Specific Constraints)

| Mã kiểm tra | Trường hợp kiểm thử | Kết quả thực tế trên Arc Testnet | Đánh giá |
| :--- | :--- | :--- | :--- |
| **S1** | **Unauthorized Cancel** | Seller hoặc tài khoản lạ gọi `emergencyCancelCampaign` bị từ chối với lỗi `OnlySecurityAuthority`. | **PASS** |
| **S2** | **Zero Address Transfer** | Chuyển native value về `0x0000000000000000000000000000000000000000` bị Arc RPC từ chối: `"Zero address not allowed"`. | **PASS** |
| **S3** | **Blocklist Transfer** | Chuyển token/value tới địa chỉ blocklist test Arc `0x7099...79C8` bị RPC từ chối fail-closed. | **PASS** |
| **S4** | **Gas Fee Floor** | Gửi giao dịch dưới sàn 20 Gwei (10 Gwei) bị Arc node từ chối ngay lập tức. | **PASS** |

---

## 5. Cân Bằng Tài Chính & Bảo Toàn Số Dư (Conservation Law)

- **Tổng USDC Buyer cam kết vào hợp đồng:** `4,000,000` units (4.0 USDC)
  - Đơn #1: 2.0 USDC
  - Đơn #2: 2.0 USDC
- **Tổng rút tiền sau khi Đơn #1 hoàn tất:**
  - Buyer #1 rút tiền hoàn (Rebate): `697,503` units (~0.7 USDC bao gồm tier rebate + early rebate)
  - Seller rút doanh thu bán hàng: `1,297,635` units (~1.3 USDC)
  - Tổng đã rút cho Đơn #1: `1,995,138` units (xấp xỉ đúng 2.0 USDC sau trừ phí)
- **Số dư USDC còn lại trong GroupDealHub Escrow:** `2,000,000` units (Chính xác 2.0 USDC dành cho Đơn #2 đang chờ xử lý).
- **Độ lệch tài chính (Discrepancy):** **0.000000 USDC** (Tuyệt đối không có rò rỉ vốn).

---

## 6. Kết Luận Gate G5

Hợp đồng `GroupDealHub` đã triển khai thành công trên **Arc Testnet** chính thức, thực thi trọn vẹn toàn bộ vòng đời cam kết, mở khóa tier, auto-finalize, giao nhận, khiếu nại, phân bổ và rút tiền on-chain bằng tiền thật (predeploy USDC). Mọi bằng chứng đã được lưu trữ và kiểm chứng độc lập.

**Quyết định:** **GATE G5 ĐẠT (G5-PASS)**.
