# Báo cáo rà soát ví và tiến độ hoàn thiện GroupDeal

Ngày kiểm tra: 02/10/2026. Phạm vi: sáu vấn đề người dùng phản ánh, mã nguồn liên quan, `PLAN.md` và kế hoạch nghiệm thu hiện hành. Đây là báo cáo trên working tree đang có thay đổi, không phải chứng thư nghiệm thu độc lập hoặc release đã đóng thành commit.

Kết luận: chưa đủ điều kiện tuyên bố hoàn thành dự án. Đã khắc phục nhiều nguyên nhân cụ thể trong luồng ví và bổ sung kiểm thử hồi quy; còn cần người dùng xác nhận OTP/ký trong ví để chứng minh luồng Circle, faucet và bridge thực tế. Không gửi private key, seed phrase, OTP hoặc Circle user token vào chat.

## Kết quả xử lý sáu vấn đề

| Vấn đề | Phát hiện và thay đổi | Phần chưa chứng minh |
|---|---|---|
| Reload mất ví trong khi còn đăng nhập | `Web3Context` trước đây chỉ khôi phục Circle, bỏ qua `activeWallet` của đăng nhập EVM. Nay khôi phục địa chỉ đã xác thực, đọc số dư và có nút kết nối lại để ký. Account change không tự đổi danh tính; signer khác tài khoản bị chặn. Logout cũng yêu cầu ngắt Reown. | Khôi phục phiên ký của từng extension và WalletConnect cần xác nhận bằng ví thật; không thể tự mở khóa ví thay người dùng. |
| Faucet trực tiếp | Backend gọi `requestTestnetTokens` của SDK Circle cho `ARC-TESTNET`, nhận native USDC. Bắt buộc auth, địa chỉ đã được bind, cooldown bền vững. UI có nút trực tiếp và trạng thái yêu cầu đã được nhận; không giả receipt/số lượng hoặc tuyên bố token đã đến. | Circle yêu cầu Console được nâng cấp quyền mainnet để dùng API faucet. Không đồng nghĩa đưa dự án lên Arc mainnet. Nếu chưa có quyền, dùng faucet web dự phòng. Chưa xác minh cấp token thật trên tài khoản hiện tại. |
| CCTP cảnh báo giao dịch rủi ro | Sửa provider bị stale sau connect; chỉ định `recipientAddress` là ví nhận trong ứng dụng; dùng `estimateBridge` trước khi viết; tắt batching để approve/burn tuần tự; khóa sender/recipient/source/amount khi retry. Lưu checkpoint trong sessionStorage, chặn burn mới sau reload khi kết quả chưa biết. | Chưa có ảnh đầy đủ, bước approve/burn/mint, mã lỗi hoặc tx hash của cảnh báo. Không khẳng định nguyên nhân và không hướng dẫn bỏ qua cảnh báo. Checkpoint chỉ tồn tại trong phiên trình duyệt, chưa có hồ sơ bridge phía server để khôi phục trên máy khác. |
| Email đăng nhập bị treo | Circle SDK là singleton: constructor khi trả instance cũ có thể giữ callback của component đã unmount. Nay gọi `updateConfigs` trên instance thật để thay callback. Backend tạo session sau kiểm chứng identity, không chờ inventory. Khởi tạo/đồng bộ ví chạy nền độc lập callback execute; API có timeout, OTP có timeout/cancel, UI có lỗi và thử lại. Init dùng idempotency key ổn định để tránh tạo trùng khi retry. | Wallet xuất hiện trong Console không chứng minh session ứng dụng đã bind đúng. Cần thử email mới/cũ và reload thật. Circle signing credentials cố ý chỉ ở memory; reload giữ app session nhưng phải OTP lại trước khi ký Circle. |
| Dùng ví khác Reown | Reown là bộ kết nối, không phải loại ví của người dùng. Giữ Circle cho email, extension EVM cho người đã có ví. Chưa có bằng chứng đổi connector sẽ sửa lỗi callback/session cục bộ này. | Nếu cần bỏ Reown, phương án injected EIP-6963 nhẹ hơn cho extension; cần triển khai chọn ví, restore/account/network events, và giải pháp riêng cho mobile. Chưa chuyển thư viện hoặc thêm nhà cung cấp ví trả phí. |
| Dự án còn thiếu gì | Kế hoạch v1.6 đã sửa kết luận mâu thuẫn “G0–G4 PASS” trong khi G1/G4 vẫn mở. Mở lại preflight thực tế và giữ G5/G6 chưa nghiệm thu. | Không xem test backend hoặc Hardhat local là hành trình sản phẩm live trên Arc. |

## Kiểm thử và giới hạn bằng chứng

Backend có test hồi quy `circle_session_faucet.test.ts`: phiên email không gọi wallet inventory; faucet từ chối thiếu auth/sai địa chỉ, chặn hai yêu cầu đồng thời, phân biệt yêu cầu được nhận với giao dịch xác nhận, và báo lỗi quyền API. Dịch vụ Circle được giả lập trong test này; không có giao dịch ngoài được gửi.

Browser E2E dùng Chrome có sẵn và mock API/SDK/RPC để kiểm tra giao diện, reload, faucet không mở tab, vào ứng dụng ngay sau email session dù callback tạo ví không hoàn tất, và OTP lại khi session ký đã mất. Kiểm thử này không chứng minh gửi email, tạo ví hoặc bridge live. Kết quả mới nhất cần đọc cùng phần cập nhật xác minh ở cuối tài liệu.

Phát hiện thêm: bộ test backend trước đây dùng database mặc định `backend/data/groupdeal.sqlite`, có thể làm lẫn fixture với dữ liệu chạy ứng dụng. Đã chuyển mỗi process test sang một thư mục SQLite tạm riêng và bổ sung campaign fixture còn thiếu trong auth test. Các lần test mới không ghi database vận hành. Không xóa hoặc reset database cũ; cần rà fixture và đối soát/dựng lại projection từ chain trước nghiệm thu. Không phục hồi bằng một snapshot không rõ nguồn.

Build frontend còn cảnh báo dependency `vm-browserify` dùng eval và chunk lớn. Chưa loại bỏ toàn bộ advisory hoặc chứng minh CSP production; không được gọi phần bảo mật/performance hoàn tất chỉ từ build thành công.

`npm audit --omit=dev` ngày kiểm tra báo frontend có 38 mục dependency bị ảnh hưởng: 15 high, 15 moderate, 8 low, không có critical. Một số mục high là cảnh báo kế thừa lên App Kit/Web SDK từ package con; đây không phải 38 CVE độc lập và chưa chứng minh mọi đường khai thác đều được ứng dụng sử dụng. Backend báo 0 advisory production tại thời điểm kiểm tra; kết quả này không thay audit code/auth. Cần triage khả năng tiếp cận, bản sửa tương thích, lockfile và test hồi quy. Không chạy `npm audit fix --force`: đề xuất tự động có cả việc đổi/hạ phiên bản Circle SDK.

## Thứ tự công việc tiếp theo và người thực hiện

| Ưu tiên | Công việc | Người thực hiện | Điều kiện hoàn tất |
|---|---|---|---|
| 1 | Xác minh reload, disconnect, account change và OTP mới/cũ thật | Tôi theo dõi API/trạng thái; bạn nhập OTP và xác nhận trong ví | Không treo; bind đúng Circle wallet; signer khác không được sử dụng; reload không cần logout |
| 2 | Xác minh quyền API faucet và nhận native USDC | Tôi kiểm response, số dư; bạn kiểm quyền Console nếu API bị từ chối | Yêu cầu API hợp lệ và số dư/receipt thật; không dùng signer mint hoặc treasury |
| 3 | Chẩn đoán cảnh báo bridge theo đúng bước giao dịch | Bạn cung cấp ảnh cảnh báo hoặc tx hash công khai; tôi đối chiếu network/contract/calldata và App Kit | USDC nguồn đúng, đủ ETH testnet, ví nhận đúng; approve/burn/attestation/mint có chứng cứ, retry không burn trùng |
| 4 | Hoàn thiện preflight mua hàng và UX khi RPC/indexer chậm | Tôi | Hiển thị phí approve/commit và tổng từ một số dư USDC; chặn thiếu funds trước ký; test đường giao dịch thật |
| 5 | Nghiệm thu luồng seller/buyer/operator/Safe theo G5 | Tôi triển khai/thu thập bằng chứng; bạn ký trong các ví và OTP; Safe cần hai owner | Publish, commit/tier/race, delivery/confirm/claim, dispute/resolve, SLA refund, emergency cancel, conservation |
| 6 | Vận hành và trải nghiệm còn thiếu | Tôi; bạn cung cấp kênh alert và thông tin dịch vụ khi cần | Restore/rebuild/reconciliation live, alert thật, keyboard/a11y, responsive 320/375/768, core English, dependency/CSP |
| 7 | Đóng release và review độc lập | Tôi chuẩn bị candidate/dossier; reviewer độc lập kiểm tra | Commit/tag bất biến, clean-checkout pipeline và đủ receipt/ảnh/API/database; G6 được ký sau G5 |

Không cần thay toàn bộ kế hoạch: tiếp tục v1.6 và xử lý các điểm mở trên. Onramp tiền thật vẫn là tính năng bị khóa, không tự bật KYC/thanh toán thật để hoàn tất bản Arc Testnet.

## Tài liệu chính thức đã đối chiếu

- [Circle API request testnet tokens](https://developers.circle.com/api-reference/wallets/programmable-wallets/request-testnet-tokens.md) và [OpenAPI configurations](https://developers.circle.com/openapi/configurations_1.yaml): `POST /v1/faucet/drips`, quyền Console và blockchain testnet.
- [Reown custom connectors](https://docs.reown.com/appkit/react/core/custom-connectors): vai trò connector, EIP-6963 và WalletConnect.
- Khai báo/source SDK đang cài: Circle User-Controlled Wallets, Web SDK, App Kit `estimateBridge`, `recipientAddress`, `batchTransactions`, retry và approval theo amount. Không suy đoán API từ tên sản phẩm.
- `PLAN.md`, `KE_HOACH_HOAN_TAT_DU_AN.md`, báo cáo tái nghiệm thu và hồ sơ G5/G6: tiêu chí nghiệm thu và giới hạn các bằng chứng lịch sử.

## Kết quả xác minh ngày 02 tháng 10 năm 2026

- Backend test suite đã PASS sau khi tách SQLite test và khai báo đầy đủ campaign fixture. Bộ test phiên Circle/faucet chạy lại sau thay đổi mới nhất cũng PASS.
- Contract test: 24 PASS trên Hardhat local, không phải hành trình tài chính live Arc. Cache Hardhat dùng thư mục riêng trong workspace để tránh lỗi truy cập cache Windows.
- Backend/frontend typecheck và build PASS; frontend còn cảnh báo eval/chunk lớn đã nêu, nên không coi build là chứng nhận bảo mật/performance.
- Browser: 6/6 PASS trên Chromium/Chrome với API/SDK/RPC giả lập: fail-closed, khôi phục ví/faucet, Circle session không chờ callback, OTP sau reload, và bridge giữ đúng recipient/amount, không batching, retry không gọi bridge mới.
- Endpoint backend đang chạy: `OK`, Circle configured, custody `USER_CONTROLLED`, chain ID `5042002`, Hub `0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574`, USDC `0x3600000000000000000000000000000000000000`; frontend cổng 5173 trả HTTP 200.
- Probe chỉ đọc Arc tại block `65142391`: chain `5042002`, USDC ERC-20 decimals `6`, CCTP TokenMessengerV2 và Multicall3 có bytecode; bằng chứng tại `evidence/G0_ARC_TESTNET_PROBE.json`. Probe không ký/gửi giao dịch.
- Không có bằng chứng mới về cấp faucet thật, ký bridge thật hoặc OTP/ký bằng tài khoản người dùng. G1/G4/G5 product journey/G6 vẫn chưa nghiệm thu.
