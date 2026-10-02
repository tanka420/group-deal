# GroupDeal — Nền tảng Mua Chung Sản Phẩm Số trên Arc Testnet

GroupDeal hiện là **release candidate trên Arc Testnet**, chưa phải bản đã nghiệm thu production. Arc là lớp settlement và nguồn sự thật tài chính; ứng dụng hỗ trợ Circle User-Controlled Wallet, ví ngoài qua Reown AppKit và nạp USDC qua Circle Arc App Kit Bridge. Candidate mới là `GroupDealHub` tại `0x2A7a...0574`, dùng Safe 2-of-3 đã xác minh tại `0xdDB2...72e6`; deployment cũ `0x7d4b...9F9a` đã được dọn hết escrow và loại khỏi nghiệm thu. Xem [báo cáo tiến độ live](./reports/BAO_CAO_TIEN_DO_LIVE_ARC_30_09_2026.md). Việc nghiệm thu cuối vẫn cần credential, quyền kiểm soát các principal độc lập, hành trình sản phẩm live G5 và reviewer độc lập G6.

---

## 🌟 Tính năng Cốt lõi & Kiến trúc Hệ thống

### 1. Nguồn sự thật tài chính (Arc Smart Contract)
- **Hợp đồng `GroupDealHub.sol`**: Là nguồn sự thật tối thượng cho toàn bộ điều khoản tài chính, cam kết USDC, tính toán tier, giá chốt cuối (final clearing price), phân bổ hoàn tiền (rebate/refund), giải quyết tranh chấp (dispute) và cơ chế rút tiền pull-claim.
- **Mạng Arc Testnet**:
  - **Chain ID**: `5042002`
  - **RPC URL**: `https://rpc.testnet.arc.io`
  - **Native Token / Gas**: `USDC` (native view 18 decimals)
  - **System USDC ERC-20 Address**: `0x3600000000000000000000000000000000000000`
  - Hai cách hiển thị trên dùng cùng một nguồn giá trị USDC; ứng dụng dùng ERC-20 6 decimals cho nghiệp vụ và không cộng native balance với ERC-20 balance.
  - **Explorer**: `https://testnet.arcscan.app`

### 2. Định luật Bảo toàn Tài chính Bất biến (Strict Conservation Law)
Tại mọi thời điểm, với mọi đơn hàng và trên toàn chiến dịch:
$$\text{buyerAllocation} + \text{sellerGrossAllocation} + \text{stillUnallocated} = \text{committedGross}$$
- Toàn bộ phép tính tài chính sử dụng số nguyên `BigInt` (USDC base units: 6 chữ số thập phân). Không sử dụng floating point.
- Không thể phân bổ hay rút vượt quá số tiền đã cam kết trên chuỗi.

### 3. Bảo vệ Danh tính & Quyền Tài chính Bất biến (Buyer Principal Pinning)
- **Campaign Identity ẩn danh**: Sinh tự động bằng hàm băm mật mã `keccak256(accountId, campaignId, salt)`. Tuyệt đối không đưa email hay thông tin cá nhân lên chuỗi, ngăn chặn liên kết chéo giữa các chiến dịch.
- **Principal Pinning**: Cam kết nạp tiền đầu tiên ghim vĩnh viễn địa chỉ ví của người mua làm *Buyer Principal* duy nhất. Mọi khoản rebate, refund hay claim chỉ có thể được rút về ví này.
- **Ràng buộc Ví Nguyên tử (1-to-1 Atomic Binding)**: Một ví EVM chỉ có thể liên kết chủ động với một tài khoản GroupDeal tại một thời điểm.

### 4. Chứng thực Mua hàng Chống Replay (EIP-712 Buy Authorization)
- Cam kết mua phải đi kèm chữ ký cấu trúc EIP-712 từ backend authority ràng buộc: `chainId`, `hubContract`, `campaignId`, `termsHash`, `campaignIdentity`, `buyerWallet`, `nonce`, `maxQuantity`, `deadline`.
- Chống tấn công phát lại (replay attack) bằng nonce tăng tuần tự trên hợp đồng.

### 5. Giao Hàng Số Bí Mật & Fallback Tranh Chấp Onchain
- **Bảo mật Entitlement**: Mã license key, link tải riêng hay token kích hoạt được mã hóa **AES-256-GCM** offchain và chỉ buyer sở hữu đơn hàng mới có thể giải mã.
- **SLA Giao hàng**: 24 giờ hoặc 48 giờ sau khi chốt chiến dịch. Quá hạn không có bằng chứng giao cho phép buyer gửi `claimDeliveryBreach` lên Arc; indexer chỉ cập nhật projection sau event onchain, không có worker DB tự hoàn tiền.
- **Cửa sổ Tranh chấp 48h**: Sau khi nhận, người mua có 48h để xác nhận sớm hoặc mở tranh chấp.
- **Direct Onchain Dispute Fallback**: Nếu ứng dụng web hay máy chủ backend ngừng hoạt động, người mua vẫn có thể gọi trực tiếp hàm `openDispute(campaignId, orderId, reasonHash)` trên Arc Smart Contract để phong tỏa tiền!
- **Trọng tài Operator**: Chỉ có quyền phân bổ chính xác khoản đang tranh chấp giữa buyer principal và seller payout wallet (tuân thủ 100% định luật bảo toàn).

### 6. Tích hợp & Mở rộng (Signed Webhooks & SDK)
- **Webhook có chữ ký HMAC-SHA256**: Gửi thông báo kèm header `X-GroupDeal-Signature` và `X-GroupDeal-Timestamp` với cơ chế chống replay (cửa sổ 300 giây).
- **Public Read API**: `/api/v1/campaigns` và `/api/v1/campaigns/:id` cho các nền tảng đối tác.
- **Embed Widget**: Iframe chỉ đọc cho người bán nhúng trực tiếp vào website bán hàng / landing page.

---

## 🚀 Cấu trúc Codebase

```
group-deal/
├── contracts/               # Solidity Smart Contracts (Solc 0.8.24, Cancun, via-ir)
│   ├── contracts/
│   │   ├── GroupDealHub.sol # Hợp đồng chính xử lý toàn bộ logic tài chính & escrow
│   │   ├── interfaces/      # Interface IGroupDealHub, IERC20
│   │   └── mocks/           # MockUSDC với faucet 500 USDC
│   ├── scripts/             # deploy.ts & seed_demo.ts
│   └── test/                # Unit test, Fuzzing, Invariants, E2E Simulation
├── backend/                 # Node.js TypeScript API, Indexer & Reconciler
│   ├── src/
│   │   ├── accounting/      # Reference Accounting Model độc lập
│   │   ├── services/        # Auth, Delivery (AES-256), Dispute, Indexer, Webhook, Reconciler
│   │   ├── routes/          # REST API (auth, campaigns, orders, seller, operator, public, faucet)
│   │   └── db/              # SQLite WAL + transaction + UNIQUE constraints
│   └── test/                # Reference accounting tests
├── frontend/                # React 18 + Vite + TypeScript + Custom Design System
│   ├── src/
│   │   ├── context/         # AuthContext, Web3Context (Arc Testnet), LanguageContext
│   │   ├── components/      # Header, PreTxModal, TxTrackerModal, ShareModal, AuthModal
│   │   └── pages/           # ExplorePage, CampaignDetailPage, BuyerDashboard, SellerDashboard, OperatorPortal, DeveloperDocs
├── sdk/                     # TypeScript SDK cho người bán
└── shared/                  # contracts.json (ABI & địa chỉ triển khai)
```

---

## 🧪 Chạy kiểm thử và candidate pipeline

Pipeline chuẩn compile lại artifact, chạy contract/backend/browser test, Arc smoke probe, build/typecheck và kiểm tra working tree:

```bash
# Candidate pipeline (không gửi giao dịch tài chính live)
npm run verify:pipeline

# Các lớp kiểm thử riêng
npm run test:contracts
npm run test:backend
npm run test:browser
npm run test:arc-smoke
```

`test:arc-smoke` chỉ đọc Arc Testnet và kiểm tra chain/predeploy/system behavior. `test:arc-live` chỉ là hành trình **contract primitive**, không phải G5 product acceptance; lệnh fail-closed nếu thiếu acknowledgment riêng, deployer key đúng owner và private key của authorized signer đúng manifest. G5 vẫn phải chạy qua browser/API/Circle/Reown/operator/Safe bằng các principal độc lập.

---

## 🛠️ Hướng dẫn Khởi chạy Ứng dụng

### 0. Cài đặt sau khi clone
Yêu cầu Node.js 24 LTS và npm. Backend sử dụng `node:sqlite`; đợt kiểm tra gần nhất chạy trên Node.js `24.11.1` và npm `11.6.2`.

Chạy từ thư mục gốc để cài dependency theo các lockfile đã commit:

```bash
npm ci --prefix contracts
npm ci --prefix backend
npm ci --prefix frontend
```

SDK được build bằng `npm run build:sdk` từ thư mục gốc. Các tệp `.env` thật, dữ liệu runtime, dependency và build artifact được loại khỏi Git; cấu hình riêng trên máy theo các bước bên dưới.

### 1. Cấu hình tích hợp
Sao chép `backend/.env.example` thành `backend/.env` và `frontend/.env.example` thành `frontend/.env`. Circle yêu cầu API key/App ID và Gmail SMTP được cấu hình trong Circle Console; backend cũng hỗ trợ Gmail SMTP bằng Google App Password cho email thông báo. Reown yêu cầu Project ID. Không đưa `CIRCLE_API_KEY`, Gmail App Password hoặc private key vào frontend.

### 2. Khởi động Backend API (Port 4000)
```bash
npm run backend:dev
```
Backend sẽ khởi chạy tại `http://localhost:4000` và tự động khởi tạo indexer sự kiện onchain. Dữ liệu demo chỉ được tạo ở môi trường không phải production.

### 3. Khởi động Frontend Web (Port 5173)
```bash
npm run frontend:dev
```
Truy cập giao diện tại `http://localhost:5173`.

### 4. Sử dụng thử trên Arc Testnet:
1. Nạp test USDC bằng faucet được cấu hình hoặc mở **CCTP Bridge** trong funding panel.
2. Chọn một trong hai cách đăng nhập: **ví EVM qua Reown** (ký challenge một lần, không gửi giao dịch) hoặc **Gmail OTP qua Circle** để tạo/khôi phục Circle User-Controlled EOA trên Arc Testnet. Lần tạo ví Circle đầu tiên có thể cần tới 90 giây sau khi user hoàn tất challenge.
3. Duyệt chiến dịch, chọn số lượng, kiểm tra bảng giá & gas fee trong Pre-Tx Modal và cam kết mua.
4. Xem đơn hàng trong **"Đơn mua của tôi"**, giải mã mã bản quyền số AES-256, xác nhận hoặc mở tranh chấp.
5. Truy cập **"Kênh Người Bán"** để tạo chiến dịch mới, thực hiện dry-run test giao hàng và cấu hình webhook.
6. Truy cập **"Quản trị Hệ thống"** để xem báo cáo đối soát tự động Smart Contract và phân bổ tranh chấp.

Xem [kế hoạch hoàn tất](./reports/KE_HOACH_HOAN_TAT_DU_AN.md), [runbook vận hành](./reports/RUNBOOK_VAN_HAN_ARC.md) và báo cáo tái nghiệm thu mới nhất trong thư mục `reports/` trước khi tuyên bố hoàn thành.
