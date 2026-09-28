# GroupDeal — Nền tảng Mua Chung Sản Phẩm Số trên Arc Testnet

GroupDeal là nền tảng mua chung sản phẩm số hoàn chỉnh, phi tập trung và minh bạch, xây dựng trực tiếp trên mạng **Arc Testnet (Circle Layer-1 EVM)** với đồng thanh toán và phí gas bằng **USDC**.

---

## 🌟 Tính năng Cốt lõi & Kiến trúc Hệ thống

### 1. Nguồn sự thật tài chính (Arc Smart Contract)
- **Hợp đồng `GroupDealHub.sol`**: Là nguồn sự thật tối thượng cho toàn bộ điều khoản tài chính, cam kết USDC, tính toán tier, giá chốt cuối (final clearing price), phân bổ hoàn tiền (rebate/refund), giải quyết tranh chấp (dispute) và cơ chế rút tiền pull-claim.
- **Mạng Arc Testnet**:
  - **Chain ID**: `5042002`
  - **RPC URL**: `https://rpc.testnet.arc.io`
  - **Native Token / Gas**: `USDC` (6 decimals)
  - **System USDC ERC-20 Address**: `0x3600000000000000000000000000000000000000`
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
- **SLA Giao hàng**: 24 giờ hoặc 48 giờ sau khi chốt chiến dịch. Quá hạn không có bằng chứng giao -> 100% tiền được tự động phân bổ hoàn trả cho người mua.
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
│   │   └── db/              # Transactional ACID JSON store
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

## 🧪 Chạy Kiểm Thử (Unit, Fuzzing, Invariants, E2E)

Hệ thống đi kèm bộ test toàn diện 10/10 test suites mô phỏng toàn bộ chu trình sống và chứng minh tính bảo toàn tiền:

```bash
# Chạy toàn bộ test suites (Smart Contracts + Reference Accounting Model)
npm run test

# Chạy riêng Smart Contracts tests
npm run test:contracts

# Chạy riêng Reference Accounting Model tests
npm run test:accounting
```

Kết quả:
- **Core & Conservation**: 7 suites kiểm tra tier validation, locking immutability, principal pinning, early slot race condition, clearing price, direct onchain dispute fallback, SLA breach refund.
- **Fuzzing & Invariants**: Kiểm tra định luật bảo toàn tài chính ngẫu nhiên trên nhiều người mua, kiểm tra chống replay attack.
- **Full E2E Simulation**: Mô phỏng toàn bộ hành trình từ lúc seller tạo chiến dịch -> buyer mua -> tier mở khóa -> giao hàng số -> tranh chấp -> claim pull tiền -> hợp đồng về đúng 0 USDC.

---

## 🛠️ Hướng dẫn Khởi chạy Ứng dụng

### 1. Khởi động Backend API (Port 4000)
```bash
npm run backend:dev
```
Backend sẽ khởi chạy tại `http://localhost:4000`, tự động khởi tạo indexer sự kiện onchain và nạp sẵn 3 chiến dịch mẫu thực tế.

### 2. Khởi động Frontend Web (Port 5173)
```bash
npm run frontend:dev
```
Truy cập giao diện tại `http://localhost:5173`.

### 3. Sử dụng thử trên Arc Testnet:
1. Nhấn nút **"Nhận 500 Test USDC"** trên thanh header để nhận 500 USDC testnet vào ví.
2. Đăng nhập bằng Email OTP (mã hiển thị trực tiếp cho quá trình test).
3. Duyệt chiến dịch, chọn số lượng, kiểm tra bảng giá & gas fee trong Pre-Tx Modal và cam kết mua.
4. Xem đơn hàng trong **"Đơn mua của tôi"**, giải mã mã bản quyền số AES-256, xác nhận hoặc mở tranh chấp.
5. Truy cập **"Kênh Người Bán"** để tạo chiến dịch mới, thực hiện dry-run test giao hàng và cấu hình webhook.
6. Truy cập **"Quản trị Hệ thống"** để xem báo cáo đối soát tự động Smart Contract và phân bổ tranh chấp.
