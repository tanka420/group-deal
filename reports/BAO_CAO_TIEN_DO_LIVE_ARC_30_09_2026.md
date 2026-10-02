# BÁO CÁO TIẾN ĐỘ LIVE ARC VÀ KẾ HOẠCH ĐÓNG DỰ ÁN

**Ngày:** 30/09/2026
**Kết luận hiện tại:** **G5.1 PASS; DỰ ÁN CHƯA ĐỦ ĐIỀU KIỆN NGHIỆM THU CUỐI**

## 1. Những phần đã thực thi xong

### 1.1. Dọn deployment cũ

Hub cũ `0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a` đã được xử lý hết campaign escrow. Campaign `1`, order `2` được hoàn tất delivery/confirm, buyer và seller đã claim. Trạng thái cuối được xác minh là:

- campaign escrow: `0`;
- số dư USDC của Hub cũ: `0`;
- bốn transaction đều thành công tại block `64643699`–`64643731`.

Bằng chứng máy đọc được: [LEGACY_ARC_CLEANUP.json](./evidence/LEGACY_ARC_CLEANUP.json).

### 1.2. Tạo security multisig thật

Safe `0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6` đã được deploy trên Arc Testnet với:

- Safe version `1.5.0`;
- ba owners `0x7330...b6d`, `0xc289...d18B`, `0x7366...db22`;
- threshold `2-of-3`;
- deployment tx `0xd72126237eb222c3e4c65f7aeef4536a642a8d1330f192f09b73bd0fb2e20e41` tại block `64644253`;
- runtime bytecode hash `0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f`.

Bằng chứng: [ARC_SECURITY_MULTISIG.json](./evidence/ARC_SECURITY_MULTISIG.json).

### 1.3. Deploy candidate GroupDealHub mới

Hub mới `0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574` đã deploy tại block `64644317` bằng tx `0x0eae9276292bbd4cf415223d40b71b0910adbb3d30911291a4d7ebda348bf254`.

| Role | Địa chỉ đã đọc lại từ contract |
|---|---|
| Owner | `0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d` |
| Operator | `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead` |
| Authorized signer | `0xc9691f85f149e71C4e1C14c6E6204128546Eef17` |
| Security authority | `0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6` |
| USDC predeploy | `0x3600000000000000000000000000000000000000` |

Fixed-block verification mới nhất tại block `64660310` xác nhận bytecode, receipt, role, Safe, trạng thái Hub mới sạch và Hub cũ không còn tiền. Bằng chứng: [ARC_CANDIDATE_DEPLOYMENT_VERIFY.json](./evidence/ARC_CANDIDATE_DEPLOYMENT_VERIFY.json).

### 1.4. Kiểm thử candidate

Pipeline sau deployment đã PASS:

| Lớp kiểm tra | Kết quả |
|---|---|
| Clean/compile | PASS, 27 Solidity files |
| Contract | PASS `24/24` |
| Backend | PASS toàn bộ suites |
| Arc smoke | PASS trên chain `5042002` |
| Backend/SDK/frontend build | PASS |
| Typecheck | PASS |
| Browser E2E | PASS `2/2` |
| Diff hygiene | PASS |

## 2. Các công nghệ Arc đang thực sự được dùng

- Arc Testnet chain `5042002` là settlement layer cho escrow, campaign, order, delivery, dispute, allocation và claim.
- USDC predeploy `0x3600...0000` dùng 6 decimals cho nghiệp vụ; native gas view 18 decimals được xử lý riêng.
- Safe smart account trên Arc làm security authority 2-of-3 cho emergency action.
- Circle User-Controlled Wallet là luồng buyer không-custodial; backend không giữ khóa buyer.
- Reown AppKit kết nối ví EVM ngoài trên custom Arc network.
- Circle Arc App Kit/CCTP bridge nằm trong funding modal để nạp USDC vào Arc.
- Multicall3, explorer receipts, fixed-block reconciliation và indexer event projection được dùng để kiểm chứng trạng thái.

Ba AppKit/SDK trên đã tích hợp ở code và pipeline; credential live của Circle/Reown chưa có nên chưa thể ghi nhận product acceptance.

## 3. Phần chưa thể tự động hoàn tất

Môi trường hiện tại không có `backend/.env` và `frontend/.env`, đồng thời thiếu các giá trị vận hành sau:

- `AUTHORIZED_SIGNER_PRIVATE_KEY` của `0xc969...ef17`;
- quyền ký operator `0xe48...1ead`;
- `CIRCLE_API_KEY`, `VITE_CIRCLE_APP_ID` và cấu hình email Circle Console;
- `VITE_REOWN_PROJECT_ID`;
- Gmail SMTP App Password trong backend (adapter SMTP đã được tích hợp; Circle OTP SMTP đã được người quản lý cấu hình);
- `JWT_SECRET`, `CAMPAIGN_IDENTITY_SECRET`, `MASTER_ENCRYPTION_KEY`;
- quyền điều khiển seller payout `0x24f0...7580`, Reown buyer `0x580c...21ae` và ít nhất một Safe owner ngoài deployer.

Không được thay các actor trên bằng ví dẫn xuất từ deployer chỉ để làm test xanh. Không được ghi private key vào báo cáo, source code hoặc git.

## 4. Việc người quản lý cần chuẩn bị

1. Tạo `backend/.env` từ `backend/.env.example` và `frontend/.env` từ `frontend/.env.example`; chỉ lưu cục bộ hoặc trong secret manager.
2. Kiểm tra private key authorized signer dẫn xuất đúng `0xc969...ef17` trước khi bật backend.
3. Yêu cầu người giữ operator và seller payout sẵn sàng ký qua ví của họ; không gửi khóa cho người triển khai.
4. Hoàn tất Circle project/app, lấy API key phía backend và App ID công khai phía frontend. Gmail SMTP cho Circle OTP đã được cấu hình; cùng App Password có thể cấu hình cục bộ cho email thông báo GroupDeal qua adapter SMTP.
5. Tạo Reown Project ID, cho phép origin nghiệm thu, rồi kết nối ví `0x580c...21ae`.
6. Bảo đảm một trong hai Safe owner `0xc289...d18B` hoặc `0x7366...db22` có thể đồng ký cùng `0x7330...b6d`.
7. Nạp test USDC/gas có kiểm soát cho các ví thực thi; nếu kiểm CCTP, chuẩn bị cả source-chain USDC.
8. Đóng candidate thành commit/tag sạch và chạy lại pipeline từ clean checkout trước G5.

## 5. Kế hoạch thực thi còn lại

### G5.2 — Product journey

- Khởi động backend/frontend bằng credential thật.
- Seller tạo/publish campaign qua browser/API bằng payout wallet thật.
- Circle buyer và Reown buyer commit bằng hai principal độc lập.
- Hoàn tất các nhánh confirm, dispute, SLA breach, claim và kiểm conservation.
- Hai Safe owner ký emergency cancel; operator không được thay Security Safe.
- Thực hiện một funding flow qua Arc App Kit/CCTP và đối chiếu số dư.

### G5.3 — Failure/recovery

- Kiểm timeout trước/sau broadcast, process restart, indexer gap/rebuild, email/webhook retry/DLQ và database restore.
- Chạy reconciliation tại block cố định và yêu cầu `HEALTHY`, không còn escrow ngoài liability.

### G5.4/G6 — Hồ sơ và nghiệm thu độc lập

- Lưu operation ID, tx/receipt/block/hash, event, balance trước/sau, checkpoint, reconciliation và ảnh UI đã loại PII.
- Reviewer độc lập chạy lại clean checkout, lấy mẫu receipt/event, threat-model và ký quyết định cuối.

## 6. Quyết định

Hạ tầng on-chain của candidate đã được thiết lập đúng và có bằng chứng live. Tuy nhiên, “đã deploy contract” không đồng nghĩa “đã hoàn thành sản phẩm”. Chỉ được tuyên bố dự án hoàn tất sau khi G5.2–G5.4 và G6 đều PASS bằng các principal/credential thật.
