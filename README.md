# GroupDeal — Nền tảng Mua Chung Sản Phẩm Số trên Arc Testnet

Tên miền chính thức: [groupdeal.tech](https://groupdeal.tech). `www.groupdeal.tech` và hostname cũ chuyển hướng về domain chính. Xem [cấu hình domain và quy trình chuyển đổi](docs/domain-migration.md).

## Cập nhật21/10/2026

GitHub và Discord đã được liên kết thật trong GroupDeal; X tạm hoãn theo yêu cầu người dùng vì chi phí. [OneDrive backup](docs/onedrive-backup.md) đã có consent, tải lên/tải ngược kiểm hash và lịch giám sát. Bản Circle email wallet đã đăng nhập và hoán đổi trên Arc Testnet. Luồng Webhook UAT đơn #7 đã hoàn tất từ mua, cấp quyền, tải và dùng CSV Studio đến xác nhận và rút tiền của buyer/seller. Xem [trạng thái hoàn thiện hiện tại](reports/HOAN_THIEN_DU_AN_HIEN_TAI_2026-10-21.md).

Theo quyết định mới nhất, **kiểm thử retry/DLQ trên hệ thống thật sẽ làm sau**; chưa tính là đạt. Tiếp tục hoàn thiện tích hợp, pipeline và tài liệu của bản Arc Testnet. [Hướng dẫn nghiệm thu](reports/HUONG_DAN_NGHIEM_THU_2026-10-21.md) và [prompt bàn giao](reports/PROMPT_CHAT_MOI_2026-10-21.md) lưu bằng chứng và giới hạn hiện hành. G5/G6 vẫn mở; source/build đạt chưa đồng nghĩa dự án đã nghiệm thu hoặc được phát hành Mainnet.

GroupDeal hiện là **release candidate trên Arc Testnet**, chưa hoàn tất nghiệm thu sản phẩm. Arc là lớp settlement và nguồn sự thật tài chính; ứng dụng hỗ trợ Circle User-Controlled Wallet, ví ngoài qua Reown AppKit và nạp USDC qua Circle Arc App Kit Bridge. Candidate mới là `GroupDealHub` tại `0x2A7a...0574`, dùng Safe 2-of-3 đã xác minh tại `0xdDB2...72e6`; deployment cũ `0x7d4b...9F9a` đã được dọn hết escrow và loại khỏi nghiệm thu. Xem [báo cáo tiến độ live](./reports/BAO_CAO_TIEN_DO_LIVE_ARC_30_09_2026.md) và [báo cáo checkout mới hơn](./reports/BAO_CAO_SUA_LOI_VA_CHECKOUT_03_10_2026.md). Credential/readiness đã có bằng chứng cấu hình; nghiệm thu cuối cần xác minh lại hiệu lực, quyền kiểm soát các principal độc lập, hành trình sản phẩm live G5 và rà soát độc lập G6.

**Đầu mối thực thi duy nhất:** [Kế hoạch thống nhất hoàn thiện GroupDeal v2.0](./reports/KE_HOACH_HOAN_TAT_DU_AN.md). Kế hoạch hợp nhất báo cáo lỗi, thẩm tra, định hướng sản phẩm và ảnh thiết kế; xác định công việc, phụ thuộc và bằng chứng hoàn tất cho backend, contract, dữ liệu, frontend và vận hành. Các báo cáo/checklist cũ được giữ làm lịch sử theo phạm vi bằng chứng đã ghi.

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
- **Campaign Identity**: Sinh bằng hàm băm từ account, campaign và secret theo mục đích; không đưa email hay PII lên chuỗi. Cùng địa chỉ ví vẫn có thể được liên kết công khai giữa các campaign. Mapping và version phải được giữ nguyên khi vận hành và xoay secret.
- **Principal Pinning**: Cam kết nạp tiền đầu tiên ghim vĩnh viễn địa chỉ ví của người mua làm *Buyer Principal* duy nhất. Mọi khoản rebate, refund hay claim chỉ có thể được rút về ví này.
- **Ràng buộc Ví Nguyên tử (1-to-1 Atomic Binding)**: Một ví EVM chỉ có thể liên kết chủ động với một tài khoản GroupDeal tại một thời điểm.

### 4. Chứng thực Mua hàng Chống Replay (EIP-712 Buy Authorization)
- Cam kết mua phải đi kèm chữ ký cấu trúc EIP-712 từ backend authority ràng buộc: `chainId`, `hubContract`, `campaignId`, `termsHash`, `campaignIdentity`, `buyerWallet`, `nonce`, `maxQuantity`, `deadline`.
- Chống tấn công phát lại (replay attack) bằng nonce tăng tuần tự trên hợp đồng.

### 5. Giao Hàng Số Bí Mật & Fallback Tranh Chấp Onchain
- **Bảo mật Entitlement**: Mã license key, link tải riêng hay token kích hoạt được mã hóa **AES-256-GCM** offchain và kiểm quyền truy cập theo đơn hàng. Backend hiện có khả năng giải mã; chưa phải mã hóa đầu cuối chỉ buyer giải mã được. Đã có giao hàng LICENSE_KEY, FILE_LINK và provider Webhook; quyền tải riêng của provider được giao trong nội dung mã hóa sau receipt onchain đã xác minh.
- **SLA Giao hàng**: 24 giờ hoặc 48 giờ sau khi chốt chiến dịch. Quá hạn không có bằng chứng giao cho phép buyer gửi `claimDeliveryBreach` lên Arc; indexer chỉ cập nhật projection sau event onchain, không có worker DB tự hoàn tiền.
- **Cửa sổ Tranh chấp 48h**: Sau khi nhận, người mua có 48h để xác nhận sớm hoặc mở tranh chấp.
- **Direct Onchain Dispute Fallback**: Contract có hàm `openDispute(campaignId, orderId, reasonHash)` để buyer gọi trực tiếp. Công cụ riêng tại `/fallback.html` hỗ trợ kiểm tra và chuẩn bị thao tác dự phòng; khả năng dùng khi app/backend/provider gián đoạn vẫn cần bằng chứng theo từng ví và tình huống.
- **Trọng tài Operator**: Chỉ có quyền phân bổ chính xác khoản đang tranh chấp giữa buyer principal và seller payout wallet (tuân thủ 100% định luật bảo toàn).

### 6. Tích hợp & Mở rộng (Signed Webhooks & SDK)
- **Webhook có chữ ký HMAC-SHA256**: Gửi thông báo kèm header `X-GroupDeal-Signature` và `X-GroupDeal-Timestamp`, kiểm cửa sổ thời gian 300 giây. Receiver D1 lưu và khử trùng theo subscription/event ID; backend có retry, DLQ và replay. Provider Cloudflare đã cấp quyền tải thật cho đơn #7. Kiểm thử lỗi/retry/DLQ trên hệ thống thật được người dùng hoãn; các kiểm tra mã nguồn cô lập vẫn được giữ trong pipeline.
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
│   └── test/                # Contract regression/invariants và local E2E simulation
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

Pipeline local compile/typecheck contract, chạy reference model và contract → indexer → đối soát, backend, SDK packed consumer, Worker/provider conformance, build frontend và browser fixtures. Nó dùng credential tạm trong child process; không xóa build/cache, sinh lại ABI nguồn, reset/seed DB hoặc chạy Arc probe/deploy/live journey. Node fixture chặn cả RPC Arc fallback; browser vẫn dùng các RPC/wallet/provider fixtures đã khai báo, chưa phải hành trình live.

```bash
# Xem các bước; chưa chạy kiểm tra
npm run verify:pipeline -- --list

# Toàn bộ local suite; cần cổng 4173, 4175 và 4180 đang trống
npm run verify:pipeline

# Chạy lớp bị tác động; kết quả ghi rõ scope chưa đầy đủ
npm run verify:pipeline -- --only=backend,sdk

# Giữ server đang có; tạo server riêng cho lượt browser này
npm run test:browser -- --port=4178 -- transaction_history_locale.spec.ts

# Kiểm các chunks đã build, navigation/loading/error và font self-host
npm run verify:pipeline -- --only=frontend-build,browser-built

# Các lớp kiểm thử riêng
npm run test:contracts
npm run test:backend
npm run test:browser
npm run test:arc-smoke
```

`test:arc-smoke` chỉ đọc Arc Testnet và kiểm tra chain/predeploy/system behavior. `test:arc-live` chỉ là hành trình **contract primitive**, không phải G5 product acceptance; lệnh fail-closed nếu thiếu acknowledgment riêng, deployer key đúng owner và private key của authorized signer đúng manifest. G5 vẫn phải chạy qua browser/API/Circle/Reown/operator/Safe bằng các principal độc lập.

Runner chỉ dùng server nó tạo, đóng sau khi kiểm tra và từ chối cổng đang có process khác. Static fallback được kiểm riêng trên bytes đã package, SHA256 qua HTTP và app/API404/POST405/HEAD empty. Kết quả local có scope, source fingerprint, runtime và exit code trong `.cache/local-pipeline-*.json`; thay source trong lúc chạy sẽ FAIL. Secret scan literal xuất rule/file/line và hash exception cho fixture public, không in giá trị; chưa thay audit đầy đủ cho Git history, ignored config hoặc secret bị ghép/obfuscate.

Frontend tải riêng các trang deal/buyer/seller/operator/docs, giữ auth và checkpoint khi chuyển trang. Lỗi tải trang có trạng thái Việt/Anh và nút reload chủ động. Plus Jakarta Sans/JetBrains Mono được self-host bằng hai package variable pin5.3.0; OFL licenses nằm trong frontend/public/fonts. Không tải Google Fonts. `GROUPDEAL_BUNDLE_REPORT=label` khi build ghi emitted module graph/JS byte counts vào `.cache/bundle-label.json`, không source map/content hoặc báo đạt Core Web Vitals. Các phụ thuộc SDK có eval và chunk lớn vẫn cần kiểm CSP/provider thật; hai overrides gRPC/Undici cùng major không là kết luận audit đã sạch.

Workflow `.github/workflows/local-candidate.yml` chuẩn bị clean checkout trên Ubuntu/Node24.21.0, cài bốn workspace chính cùng workspace receiver Cloudflare theo lockfile và Chromium, ghim Actions bằng commit SHA, dùng quyền contents:read và không giữ checkout credential. Artifact chỉ gồm JSON đã redacted, không upload DB, `.env`, entitlement hoặc browser traces. Hồ sơ CI ở các commit trước giữ nguyên phạm vi; candidate cuối vẫn cần CI riêng và G5/G6.

---

## 🛠️ Hướng dẫn Khởi chạy Ứng dụng

### Website đang vận hành

Truy cập [groupdeal.tech](https://groupdeal.tech). Dịch vụ trên VPS là bản dữ liệu live hiện hành; xem [runbook Arc](reports/RUNBOOK_VAN_HAN_ARC.md) để vận hành. Các ca nghiệm thu đã hoàn tất và quyết định hoãn nằm trong [trạng thái hiện tại](reports/HOAN_THIEN_DU_AN_HIEN_TAI_2026-10-21.md).

### Bản Testnet trong môi trường local riêng

Lệnh sau dành cho môi trường local có dữ liệu và admission riêng, với Node.js 24; nó không phải cách khởi động lại bản live trên VPS:

```bash
npm run start:testnet
```

Mở `http://127.0.0.1:5173`. Lệnh phục vụ frontend đã đóng gói với Circle/Reown được cấu hình và khởi động backend production trên bản dữ liệu phục hồi đã được admission; các hash source/package/runtime được kiểm trước khi mở cổng. Dừng bằng `Ctrl+C` để đóng API, indexer, worker và lease của lượt chạy.

Đây là ứng dụng local kết nối Arc Testnet. Hướng dẫn cài đặt/development bên dưới dành cho checkout mới; dữ liệu và secret của VPS không được sao chép vào môi trường kiểm tra. Các bằng chứng live đã có không thay nghiệm thu G5/G6 toàn bộ.

### 0. Cài đặt sau khi clone
Yêu cầu Node.js 24 LTS và npm. Backend sử dụng `node:sqlite`; CI ghim Node.js `24.21.0` và npm `11.6.2`.

Chạy từ thư mục gốc để cài dependency theo các lockfile đã commit:

```bash
npm ci --prefix contracts
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix sdk
npm ci --prefix integrations/cloudflare-receiver
```

SDK được build bằng `npm run build:sdk` từ thư mục gốc và kiểm packed consumer bằng `npm --prefix sdk test`. Các tệp `.env` thật, dữ liệu runtime, dependency và build artifact được loại khỏi Git; cấu hình riêng trên máy theo các bước bên dưới.

### 1. Cấu hình tích hợp
Sao chép `backend/.env.example` thành `backend/.env` và `frontend/.env.example` thành `frontend/.env`. Circle yêu cầu API key/App ID và Gmail SMTP được cấu hình trong Circle Console; backend cũng hỗ trợ Gmail SMTP bằng Google App Password cho email thông báo. Reown yêu cầu Project ID. Không đưa `CIRCLE_API_KEY`, Gmail App Password hoặc private key vào frontend.

### 2. Khởi động Backend API (Port 4000)
```bash
npm run backend:dev
```
Backend kiểm runtime security, manifest/deployment và projection scope trước khi mở `http://localhost:4000` hoặc khởi tạo worker. Fixture demo chỉ được tạo khi không phải production, chain31337 và có cờ `GROUPDEAL_ENABLE_LOCAL_FIXTURES=1`; không bật trên môi trường nghiệm thu Arc.

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

Chuẩn bị contract V2: `npm run prepare:arc-candidate` tại root tạo payload chưa ký từ compiler/source hiện tại và read-only deployment reference đã ghim. Lệnh chạy Hardhat offline, không gửi transaction hay thay active manifest/DB. `ARC_CANDIDATE_PREPARATION_LATEST.json` có trạng thái PREPARED, `broadcastReady=false`; source review/freeze, principal/nonce/fee reads, initialized runtime/receipt và staged rollout vẫn cần thực hiện. `deploy:arc` cũ bị chặn vì triển khai V1 và ghi đè cấu hình đang dùng; local development command vẫn giữ. Xem runbook §41–42 cho `verify:live-readiness`, `verify:arc-deployment` và giới hạn bằng chứng.
