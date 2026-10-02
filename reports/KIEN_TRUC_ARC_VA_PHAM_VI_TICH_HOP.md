# KIẾN TRÚC ARC VÀ PHẠM VI TÍCH HỢP CHO GROUPDEAL

**Ngày lập:** 29/09/2026

**Trạng thái:** Đã triển khai ở mức release candidate; live acceptance còn mở
**Phạm vi đang chạy:** Arc Testnet. **Mục tiêu production cập nhật 03/10/2026:** Arc Mainnet và checkout token khác theo tuyến được hỗ trợ; chưa triển khai hoặc nghiệm thu Mainnet.

## 1. Arc có mặt trong GroupDeal để làm gì

Arc không chỉ là mạng dùng để deploy ở bước cuối. Trong GroupDeal, Arc là **lớp settlement và nguồn sự thật tài chính**:

1. Smart contract `GroupDealHub` giữ USDC đã cam kết của buyer.
2. Contract ghi nhận campaign, quantity, tier, giá cuối, rebate, refund, dispute, allocation và claim.
3. Buyer, seller, operator và Security Multisig gửi giao dịch thật lên Arc Testnet.
4. Backend chỉ tạo intent, kiểm policy và phục vụ dữ liệu; không tự quyết định kết quả tài chính.
5. Indexer dựng projection từ event Arc và có thể rebuild từ deployment block.
6. Reconciliation đọc state contract tại một block Arc cố định và đối chiếu với database.
7. Explorer, receipt, event và balance Arc là bằng chứng nghiệm thu cuối.

Luồng mục tiêu:

```text
Buyer funding
  ├─ Faucet/test USDC trên Arc Testnet
  ├─ Arc App Kit Bridge: USDC từ chain được hỗ trợ -> Arc
  └─ Onramp: chỉ bật sau khi qua gate khả dụng/khu vực/compliance
           |
           v
Circle User-Controlled Wallet hoặc external wallet qua Reown AppKit
           |
           v
GroupDealHub trên Arc: commit -> finalize/cancel -> delivery proof
                       -> confirm/dispute/timeout -> claim/refund
           |
           +--> Arc event indexer -> SQLite WAL transactional projection -> UI/operator
           |
           +--> fixed-block reconciliation -> alert/audit/acceptance dossier
```

## 2. Các công nghệ Arc/Circle được đưa vào

| Công nghệ | Công dụng chính | Vai trò trong GroupDeal | Quyết định |
|---|---|---|---|
| Arc EVM | Chạy Solidity và giao dịch tương thích EVM | Deploy `GroupDealHub`, dùng Hardhat/ethers/viem hiện có sau khi cấu hình chain đúng | **Bắt buộc v1** |
| USDC native gas | Gas của Arc được trả bằng USDC | Buyer chỉ cần USDC cho cả gas và commitment; UI phải tách rõ số tiền mua và gas dù cùng một asset | **Bắt buộc v1** |
| USDC ERC-20 predeploy | Approve/transfer/escrow bằng giao diện ERC-20 | Token settlement duy nhất của contract; không deploy `MockUSDC` trên Arc | **Bắt buộc v1** |
| Deterministic finality | Block đã final, không cần nhiều confirmation | Receipt verifier và indexer xác nhận nhanh; không dùng confirmation buffer/reorg rollback kiểu Ethereum | **Bắt buộc v1** |
| Arc Explorer + Faucet | Cấp test USDC và kiểm giao dịch | Funding test actors; lưu link/tx/block làm bằng chứng nghiệm thu | **Bắt buộc v1** |
| Circle User-Controlled Wallet | Ví non-custodial có PIN/email OTP/social và user approval | Luồng ví nhúng cho buyer; backend không giữ hoặc giải mã private key | **Bắt buộc v1** |
| Reown AppKit | Kết nối ví EVM/WalletConnect | Luồng external wallet: MetaMask, QR/mobile, reconnect, chain switch | **Bắt buộc v1** |
| Arc App Kit Bridge / CCTP V2 | Chuyển USDC cross-chain vào Arc | Nút “Đưa USDC vào Arc” trong funding UX; theo dõi quote, fee và tiến trình bridge | **Đưa vào v1** |
| Arc App Kit Onramp | Mua stablecoin trên Arc bằng fiat qua widget | Phương án nạp tiền cho người chưa có USDC | **Spike bắt buộc; chỉ bật nếu qua gate** |
| Unified Balance / Gateway | Hợp nhất USDC đa chain | Có thể giảm bước bridge thủ công ở phiên bản sau | **Hoãn sau v1** |
| App Kit Swap | Đổi token cùng/cross-chain | Quy đổi token có tuyến/thanh khoản được hỗ trợ thành USDC Arc cho checkout production; cần quote, phí, slippage và recovery | **Đưa vào kế hoạch production; chưa bật trên các mạng nguồn Sepolia** |
| App Kit Send | Chuyển wallet-to-wallet | Contract đã điều phối escrow/claim; dùng Send sẽ đi vòng ngoài nghiệp vụ | **Không đưa vào v1** |
| App Kit Earn | Gửi USDC vào vault sinh lợi | Không thuộc escrow marketplace và làm tăng rủi ro tài chính | **Loại khỏi phạm vi** |
| Opt-in privacy | Giao dịch bảo mật có chọn lọc | PII/entitlement đã phải để offchain; chưa có use case nghiệm thu | **Không dùng v1** |
| Smart Contract Platform | Deploy/interact/monitor contract qua Circle | Có thể bổ sung monitoring, nhưng không thay pipeline Hardhat và bytecode đã review | **Tùy chọn sau G0 probe** |
| Chạy Arc node riêng | Hạ tầng RPC/indexing tự quản | Chưa cần cho Testnet acceptance; dùng provider có failover trước | **Hoãn vận hành quy mô** |

### 2.1. Trạng thái triển khai tại candidate 29/09/2026

- Arc Testnet manifest, deployment, read-only smoke probe, receipt verifier, indexer/backfill và fixed-block reconciliation đã có code và test.
- Circle User-Controlled Wallet đã thay local/custodial wallet path; Circle Web SDK giữ token trong memory và người dùng tự duyệt challenge. Chưa có bằng chứng live vì workspace không có Circle API key/App ID.
- Reown AppKit đã cấu hình custom Arc Testnet và được tải động cho external wallet. Chưa có bằng chứng giao dịch live vì thiếu Project ID và ví test được nạp tiền.
- Circle Arc App Kit Bridge/CCTP đã nằm trong funding modal, không còn là external link. Chưa có bridge receipt live.
- SQLite dùng WAL, transaction và các bảng UNIQUE vật lý cho email, Circle identity, wallet, event identity và idempotency. Đây là lựa chọn persistence của testnet candidate; PostgreSQL chỉ cần khi đổi mục tiêu scale/HA.
- Native gas 18 decimals và USDC nghiệp vụ 6 decimals là hai giao diện của cùng một số dư; UI chỉ hiển thị một balance và lớp giao dịch quy đổi precision theo từng API.
- Các kết quả code/test trên không thay thế G5 live journey hoặc G6 review độc lập.

## 3. Ràng buộc kỹ thuật Arc phải được code hóa

### 3.1. Một USDC, hai cách biểu diễn

Trên Arc, USDC native dùng cho gas và USDC ERC-20 là **cùng một pool giá trị**, không phải hai tài sản để cộng lại:

- Giao diện native: 18 decimals, chỉ dùng cho gas và `msg.value`.
- Giao diện ERC-20: 6 decimals, dùng cho balance hiển thị, approve, transfer và mọi phép tính nghiệp vụ.
- Business amount luôn là integer theo 6 decimals.
- Không hiển thị hai số dư “USDC” và “native USDC”; không tạo route đổi qua lại giữa chúng.
- Fee estimator phải trả `commitmentUsdc`, `estimatedGasUsdc` và `totalRequiredUsdc` với type/unit tách biệt.

Manifest Arc Testnet phải ghi và được kiểm chứng runtime:

```text
chainId: 5042002
chainIdHex: 0x4CEF52
usdc: 0x3600000000000000000000000000000000000000
usdcBusinessDecimals: 6
nativeGasDecimals: 18
cctpDomain: 26
rpc/http + rpc/ws: lấy từ cấu hình đã kiểm chứng, không hardcode rải rác
```

Các giá trị trên là baseline từ tài liệu Arc/Circle hiện hành; G0 vẫn phải kiểm lại RPC, chain ID, bytecode token và contract addresses trước khi deploy vì endpoint/tài liệu Testnet có thể thay đổi.

### 3.2. Finality và state giao dịch

- Không chờ 6/12 confirmations như Ethereum; receipt thành công trên block final của Arc là bằng chứng settlement.
- Vẫn phải giữ state machine `PENDING_BROADCAST`, `PENDING_FINALITY`, `CONFIRMED`, `REVERTED`, `REPLACED`, `DROPPED`, `RECONCILING` để xử lý lỗi trước receipt, RPC outage và wallet replacement.
- Không được coi HTTP timeout là giao dịch thất bại; phải tra tx/receipt theo operation ID và nonce.
- Kiểm thử riêng các hành vi Arc như minimum fee, blocklist revert và gửi tới zero address.

### 3.3. Indexer đúng với Arc

- Kết hợp WebSocket để nhận block/event mới với HTTP backfill khi restart hoặc mất kết nối.
- Thứ tự canonical dùng `(blockNumber, transactionIndex, logIndex)`, không dùng timestamp vì Arc có block sub-second.
- Journal unique theo `(chainId, contract/emitter, transactionHash, logIndex)` và consumer phải idempotent.
- Arc deterministic finality nên **không triển khai reorg rollback** như Ethereum; thay vào đó bắt buộc checkpoint, gap detection, backfill, clean rebuild và fixed-block reconciliation.
- Event `GroupDealHub` là nguồn chính cho trạng thái escrow. USDC `Transfer`, blocklist và CCTP event chỉ là lớp đối soát/vận hành; emitter/address phải lấy từ canonical Arc reference và được chứng minh trong G0 smoke.
- Projection sau clean rebuild phải giống projection trước rebuild và khớp contract state tại block kiểm tra.

### 3.4. Ví và App Kit không được trộn vai trò

- **Circle User-Controlled Wallet:** tạo ví nhúng và yêu cầu chính user duyệt challenge; Circle API key chỉ ở backend.
- **Reown AppKit:** vừa là lựa chọn đăng nhập wallet-first vừa là connector giao dịch cho ví bên ngoài qua WalletConnect/EIP-6963; đăng nhập dùng challenge 5 phút, nonce một lần, bind origin/Arc chain/address và chống replay. Không được dùng như bằng chứng đã tích hợp Circle User-Controlled.
- **Arc App Kit:** payment/liquidity workflow; candidate Testnet dùng Bridge và đánh giá Onramp. Checkout production bổ sung Swap theo tuyến hỗ trợ, không mở Earn/Onramp hoặc giữ key người dùng để hoàn thành checkout.

**Cập nhật 03/10/2026:** Backend Circle dùng ID người dùng được API xác thực, không dùng device-token ID hoặc email request để merge tài khoản. Số dư và buy authorization có RPC đọc dự phòng kiểm chain. Checkout Testnet nối USDC funding, kiểm lại campaign rồi buyer approve/commit; chỉ xác nhận khi receipt/event và đơn indexer khớp. Chi tiết và giới hạn phục hồi tại [báo cáo checkout](./BAO_CAO_SUA_LOI_VA_CHECKOUT_03_10_2026.md).

Mainnet hiện có chain ID 5042; candidate vẫn dùng Testnet 5042002, không đổi cấu hình mạng trong đợt sửa này. Swap chỉ có trên mainnet và ngoại lệ Arc Testnet, không có trên các mạng nguồn Sepolia đang chọn. [Arc network](https://docs.arc.io/arc/references/connect-to-arc), [App Kit supported blockchains](https://docs.arc.io/app-kit/references/supported-blockchains). Kế hoạch triển khai Mainnet/Swap phải đi sau gate bảo mật và nghiệm thu, không bị loại khỏi mục tiêu production chỉ vì bản thử nghiệm hiện nhận USDC.
- Mọi connector phải bind đúng `chainId`, account, origin, intent, contract, selector, amount và nonce trước khi ký.
- Backend SQLite chỉ lưu Circle `walletId`, địa chỉ ví công khai, liên kết account và audit trail. Circle credentials/encryption key chỉ ở memory của phiên; private key Circle được bảo vệ theo mô hình user-controlled 2-of-2 MPC. Với Reown, private key/seed phrase luôn nằm trong ứng dụng hoặc extension ví của người dùng và không đi qua GroupDeal.

## 4. Funding UX sẽ dùng công nghệ Arc thế nào

Trước nút `Commit`, frontend chạy preflight:

1. Xác nhận wallet đang ở Arc Testnet và address đã bind đúng account.
2. Đọc một số dư USDC ERC-20 6 decimals duy nhất.
3. Ước lượng gas Arc bằng USDC và kiểm đủ `commitment + gas`.
4. Nếu thiếu USDC:
   - đề xuất Faucet trong môi trường test;
   - hoặc mở Arc App Kit Bridge từ chain được hỗ trợ;
   - hoặc hiện Onramp khi module đã qua gate và khả dụng cho khu vực/user.
5. Theo dõi bridge/onramp bằng operation ID; chỉ enable `Commit` sau khi balance Arc đã được index/refresh.
6. Hiển thị quote expiry, bridge fee, gas và rủi ro retry; không gộp bridge completion với purchase completion.

Onramp chỉ được bật khi có bằng chứng sandbox và production-like cho: quốc gia hỗ trợ, KYC/compliance, CSP/iframe, session minting phía server, webhook/lifecycle, fee disclosure, cancellation và support escalation. Nếu không đạt, sản phẩm vẫn hoàn tất với Faucet + Bridge + ví đã có USDC.

## 5. Những thay đổi bắt buộc trong code và kiểm thử

1. Thêm manifest `arc-testnet` bất biến; local manifest tiếp tục dùng Hardhat và `MockUSDC` nhưng không được ghi đè Arc artifact.
2. Thêm Arc chain config cho backend, frontend, deployer, Reown, Circle Wallet và indexer từ cùng một manifest.
3. Tạo thư viện amount/unit chung; cấm floating point và cấm cộng native balance với ERC-20 balance.
4. Deploy `GroupDealHub` bằng USDC predeploy đã kiểm chứng; verify source/bytecode trên explorer.
5. Thay ví server-custodial bằng Circle User-Controlled và thêm Reown AppKit cho ví ngoài.
6. Thêm funding panel dùng Arc App Kit Bridge; Onramp nằm sau feature flag/gate.
7. Viết lại indexer theo deterministic finality, WSS + HTTP backfill, block/log ordering và idempotent rebuild.
8. Bổ sung test Arc-specific: chain mismatch, unit mismatch 6/18, insufficient gas USDC, minimum fee, RPC timeout sau broadcast, blocklist/zero-address behavior, bridge retry và indexer gap recovery.
9. Chạy live journey đa ví trên Arc Testnet; lưu tx hash, receipt, event, block, balance và reconciliation result.

## 6. Tiêu chí Arc-PASS

Chỉ đánh dấu tích hợp Arc đạt khi cùng một release candidate chứng minh:

- Không còn dùng chain `31337` hoặc `MockUSDC` trong cấu hình/deployment Arc.
- `GroupDealHub` đã deploy và verify trên Arc Testnet với đúng USDC predeploy.
- Circle User-Controlled và ít nhất một external wallet qua Reown hoàn thành commit/claim thật.
- Bridge đưa USDC vào Arc và funding balance được nhận biết trước khi commit.
- Giá trị 6/18 decimals, gas và escrow không bị double-count hoặc sai đơn vị.
- Receipt verifier, indexer rebuild và reconciliation đều khớp state Arc.
- Toàn bộ create → commit → finalize → delivery → confirm/dispute/timeout → claim/refund có bằng chứng Explorer/receipt/event.
- Không còn P0/P1 mở liên quan custody, accounting, auth, receipt hoặc chain binding.

## 7. Nguồn kỹ thuật chuẩn

- [Arc documentation index](https://docs.arc.io/llms.txt)
- [Arc EVM differences](https://docs.arc.io/arc/references/evm-differences)
- [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc)
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Arc event indexing](https://docs.arc.io/integrate/infrastructure/indexing-events)
- [Arc App Kit](https://docs.arc.io/app-kit)
- [Circle Developer Platform documentation index](https://developers.circle.com/llms.txt)
- [Circle User-Controlled Wallets](https://developers.circle.com/wallets/user-controlled)
- [Reown AppKit overview](https://docs.reown.com/appkit/overview)

Khi tài liệu hoặc SDK mâu thuẫn về endpoint, address hay capability, implementation phải dừng ở G0 probe, lấy giá trị từ canonical reference hiện hành, kiểm tra trực tiếp trên chain và lưu manifest hash; không đoán hoặc copy cấu hình cũ.
