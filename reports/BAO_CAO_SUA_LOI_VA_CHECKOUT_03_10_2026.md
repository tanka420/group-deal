# Báo cáo sửa lỗi Circle và checkout GroupDeal

Ngày cập nhật: 03/10/2026. Báo cáo dành cho chủ dự án, ghi lại phần đã triển khai sau yêu cầu sửa lỗi OTP, bridge và số dư, cùng phần còn cần nghiệm thu. Mã đang nằm trong working tree có nhiều thay đổi trước đó; chưa đóng thành release hoặc được review độc lập.

Kết luận: đã sửa nguyên nhân định danh Circle, bổ sung RPC dự phòng và nối funding USDC vào checkout trên Arc Testnet. Backend test, build và 15 ca kiểm thử frontend đã qua. Chưa thể tuyên bố hoàn thành production: chưa có OTP/chữ ký/receipt live mới của người dùng, chưa triển khai GroupDealHub mainnet, và chưa thực thi Swap cho token khác.

## Lỗi Circle và cách bảo vệ tài khoản

Device token của luồng email chứa định danh thiết bị. Cách cũ lấy `sub` của token đó rồi so với ID người dùng từ `getUserStatus`, khiến OTP đúng vẫn bị từ chối. Cách mới dùng ID người dùng do Circle API xác thực với chính user token đã nhận sau xác thực SDK.

Ứng dụng không ghép tài khoản chỉ bằng email gửi trong request. Token của tài khoản Circle khác không được nhận tài khoản, vai trò hoặc ví của email bị mạo danh. Lượt đăng nhập có TTL, chỉ consume một lần và từ chối replay đồng thời; lượt tạo bằng cơ chế cũ phải yêu cầu OTP mới.

Nếu token đã được Circle API chấp nhận không chứa `email` cùng `email_verified=true`, ứng dụng vẫn đăng nhập vào đúng tài khoản Circle theo ID, nhưng không công nhận email yêu cầu là địa chỉ liên hệ đã xác minh. DTO trả email `null`, không gửi email thông báo tới địa chỉ chưa xác minh và không tự merge tài khoản cũ. Xác minh email liên hệ hoặc liên kết tài khoản cũ vẫn là việc cần thiết trước production. Đây là giới hạn chủ động để không sửa lỗi đăng nhập bằng cách mở lỗ hổng chiếm tài khoản.

Mã liên quan: `backend/src/services/circleWalletService.ts`, `authService.ts`, `notificationService.ts`, `backend/src/db/store.ts` và `backend/test/circle_identity.test.ts`.

## Số dư và RPC

Frontend dùng client đọc chung, gom các yêu cầu trùng nhau, timeout từng RPC sau 3 giây và chuyển qua các endpoint Testnet chính thức. Mỗi phản hồi phải khớp chain ID 5042002; endpoint 429, sai chain hoặc thiếu dữ liệu không được dùng. Chỉ cho phép phương thức đọc, không retry/broadcast giao dịch qua client này.

Khi RPC lỗi, UI giữ số dư đúng gần nhất và đánh dấu chưa cập nhật, không đổi thành 0. Số dư native 18 decimals và giao diện ERC-20 6 decimals vẫn là cùng USDC, không cộng hai số dư. Phép tính mua dùng bigint, không dùng số thực để tính tổng.

Buy authorization ở backend cũng đọc principal và nonce qua RPC dự phòng có kiểm chain; nếu không xác minh được thì từ chối ký authorization. Đã sửa thêm kiểm tra số lượng nguyên dương và giới hạn authorization theo tổng số lượng đã mua, đúng cách contract kiểm tra cumulative units.

Failover mới này không phải bản nâng cấp toàn bộ indexer/reconciliation/receipt verifier backend. Cần kiểm tra khả năng chịu lỗi của các dịch vụ đó trong diễn tập vận hành; UI sẽ giữ trạng thái chờ kiểm tra nếu backend chưa ghi nhận đơn.

## Bridge và checkout đã triển khai

Luồng hiện tại có hai lựa chọn tại bước xác nhận mua:

1. USDC sẵn có trên Arc Testnet: kiểm tiền hàng và ngân sách gas, xin authorization mới, approve khi cần, rồi buyer ký `commitToBuy`.
2. USDC trên Ethereum Sepolia, Base Sepolia hoặc Arbitrum Sepolia: mở funding trong checkout, xem báo giá CCTP, người dùng xác nhận bridge, kiểm số dư nhận và kiểm tra lại chiến dịch trước khi mua.

Bridge kiểm đúng chain nguồn, USDC nguồn và ETH gas trước khi ước tính/ký. Báo giá thể hiện phí USDC, số nhận dự kiến và ngân sách gas thêm 20%, hiệu lực UI 60 giây. Trước thực thi sẽ ước tính lại; phí tăng hoặc số nhận giảm buộc xem báo giá mới. Thiếu phí ước tính thì dừng. Luồng hiện chọn CCTP `SLOW`, `maxFee=0`, không thêm custom fee và không batching. Finality standard có thể chờ lâu hơn fast; không có cam kết hoàn tất trong một khoảng thời gian cố định.

`User rejected`/`User denied request signature` được hiển thị thành thông báo ví từ chối, không được coi là giao dịch onchain đã revert và không hướng dẫn tắt cảnh báo. SDK vẫn quyết định approve/burn/mint; không thay spender wrapper thành TokenMessenger bằng phỏng đoán. Khi SDK có ước tính gas mint, ứng dụng kiểm USDC gas trên Arc của ví ký mint, có thể khác ví nhận.

Hồ sơ bridge công khai được lưu trong localStorage của cùng origin/profile, giữ source, sender, recipient, amount và kết quả SDK; không lưu key, Circle credentials hoặc OTP. Retry phải khớp hồ sơ cũ và dùng `retryBridge`, không gọi bridge mới khi burn/mint chưa rõ. Có Web Locks giữa các tab cùng origin; không xếp hàng một giao dịch mới để tự chạy sau giao dịch trước. Hồ sơ này chưa phải khôi phục phía server hay trên thiết bị khác. Nếu app tải lại trước khi SDK trả kết quả, người dùng phải kiểm tra lịch sử ví; chưa có cơ chế tự khôi phục mọi tình huống burn không nhận được hash.

Checkout đọc một số dư USDC, tính ngân sách trước approve và dùng `eth_estimateGas` kiểm lại từng call trước ký. Ngân sách trước approve là khoản dự phòng, không phải phí chính xác; phí ký thực tế do ví/SDK hiển thị. Hiện UI chưa hiển thị trước một báo giá gas approve và commit đầy đủ cho mọi loại ví.

Allowance mua được đưa về đúng tổng tiền của lượt mua, kể cả allowance cũ lớn hơn. Khóa thao tác theo ví nhận trong cùng origin, không chỉ theo campaign, để các tab/campaign trong app không đồng thời ghi đè allowance. Trước external commit, hệ thống kiểm signer và chuyển lại đúng Arc Testnet.

Sau funding, ứng dụng kiểm trạng thái/thời hạn, giá, điều khoản, ví và authorization của chiến dịch. Chiến dịch đóng hoặc điều khoản thay đổi thì không tự tạo đơn; USDC đã nạp vẫn ở ví. Nạp hoặc chuyển USDC trực tiếp vào Hub không thay thế `commitToBuy`.

Thông báo mua thành công không còn dựa vào chờ 1,5 giây. Phải có receipt thành công trên Arc, đúng Hub/ví và sự kiện `CommitmentMade` khớp campaign, identity, quantity và tiền đã đồng ý; sau đó backend phải có đơn đúng transaction hash/order ID/buyer. RPC/indexer lỗi giữ hồ sơ mua để kiểm tra lại, không tự mua lại sau reload. Receipt đã xác minh revert cho phép mở khóa lượt mua mà không giả có đơn thành công. Circle chưa trả transaction hash thì vẫn cần đối chiếu challenge/lịch sử, không tự gửi commit mới.

## Bằng chứng kiểm tra

Kết quả và SHA256 của các source chính được lưu tại [hồ sơ xác minh](./evidence/CHECKOUT_FIX_VERIFICATION_03_10_2026.json). Đây là fingerprint một phần working tree, không phải checksum đầy đủ của release đã đóng hoặc chữ ký nghiệm thu.

| Kiểm tra | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| Backend `npm test` | PASS toàn bộ 15 script test | SQLite test riêng; Circle/RPC giả lập ở ca mới; signer authorization trong ca mới dùng key fixture, không ký giao dịch live |
| Backend typecheck và build | PASS | Biên dịch mã hiện tại |
| Frontend typecheck và build | PASS | Còn cảnh báo eval trong dependency và chunk lớn |
| `npx playwright test --workers=1` | 15/15 PASS | Chrome với API/SDK/RPC và phương thức ký giả lập; có kiểm tra riêng receipt/event và RPC failover |
| Trang thật cổng 5173 và `/api/health` | HTTP 200, chain 5042002 | Browser mới, chỉ đọc, thấy giao diện bridge, không login hoặc ký |
| Client RPC mới gọi Arc Testnet trực tiếp | PASS, khoảng 1,1 giây | Chain 5042002; số dư native ví 0x7330…b6d là 64,21920865 USDC tại thời điểm probe; chỉ đọc |

Các ca frontend mới kiểm tra báo giá chưa ghi giao dịch; thiếu ETH nguồn; retry giữ recipient/amount, không burn mới; số dư giữ nguyên khi RPC lỗi; receipt/event đúng; chỉ xác nhận sau indexer; pending qua reload; campaign đóng sau funding; và chặn tab thứ hai mua đồng thời. Các ca đó không thay chứng cứ giao dịch thật.

Smoke trên trang thật không có JavaScript page exception. Có một console error tải font Google do môi trường chặn mạng (`ERR_NETWORK_ACCESS_DENIED`); Circle auth request bị abort khi đóng browser kiểm tra, không phải bằng chứng OTP thất bại. Ảnh kiểm tra nằm ở `frontend/test-results/live-bridge-smoke.png`, là artifact tạm. Không ghi private key, seed, OTP hoặc user token trong báo cáo.

## Việc người dùng cần làm để nghiệm thu live

1. Tải lại cùng địa chỉ `http://localhost:5173/` đang dùng. Yêu cầu OTP mới và nhập trong giao diện Circle; không dùng lượt OTP trước sửa. Thử email mới/cũ và tải lại để kiểm đúng tài khoản và ví.
2. Với Ethereum Sepolia, chuẩn bị ETH testnet ở ví nguồn ngoài USDC. Bấm lấy báo giá, xem mạng, spender, số nhận và gas rồi chỉ xác nhận nếu thông tin hợp lệ. Nếu ví còn cảnh báo không hiểu rõ, dừng và gửi ảnh đã che dữ liệu nhạy cảm hoặc tx hash công khai.
3. Nếu ví ký mint khác ví nhận Circle, chuẩn bị gas Arc cho ví ký khi báo giá yêu cầu. Chạy thử số tiền test nhỏ; kiểm burn, attestation, mint, số dư nhận và retry khi lỗi.
4. Chọn một campaign test đang mở, chạy purchase và đối chiếu receipt, event và đơn backend. Không gửi lại giao dịch đang pending chỉ vì UI chờ lâu. Giữ cùng origin/profile để đọc hồ sơ phục hồi.

Agent tiếp tục kiểm API, receipt, indexer và sửa lỗi trong phạm vi được giao; người dùng tự nhập OTP và duyệt trong ví. Không cần đưa key/OTP vào chat.

## Mục tiêu production và các phần còn mở

Arc vẫn là settlement/escrow và nguồn sự thật tài chính. Reown là kết nối ví; Circle User-Controlled là ví nhúng; App Kit Bridge là chuyển tài sản; Swap là đổi token. Những vai trò này không thay thế lẫn nhau.

Tài liệu chính thức hiện có Arc Mainnet chain 5042, khác Arc Testnet 5042002. Dự án vẫn đang cấu hình Testnet, chưa có deployment Mainnet trong đợt sửa này. Cần manifest/deployment, authority, secrets, RPC và acceptance riêng; không chỉ đổi chain ID của bản đang chạy. [Cấu hình Arc chính thức](https://docs.arc.io/arc/references/connect-to-arc).

Mục tiêu tiếp theo là checkout đổi token thuộc tuyến có thanh khoản và được hỗ trợ thành USDC Arc Mainnet, không cam kết mọi token trên mọi chain. Swap không hỗ trợ các mạng nguồn Sepolia hiện dùng; ngoại lệ testnet được tài liệu nêu là Arc Testnet. Phải giữ ranh giới testnet/mainnet và không thử bằng tiền mainnet để vượt hạn chế này. [Phạm vi App Kit](https://docs.arc.io/app-kit/references/supported-blockchains), [Swap](https://docs.arc.io/app-kit/swap).

Trước mở production còn cần: quote service không lộ API key; route/token allowlist; slippage/minimum received/deadline; custody và allowance review; recovery bền vững phía server; transaction replacement/drop; failover và diễn tập indexer/reconciliation; email liên hệ đã xác minh; audit dependency/CSP; kiểm thử responsive/a11y; hành trình seller/buyer/operator/Safe và review độc lập. Kế hoạch cụ thể được cập nhật trong `KE_HOACH_HOAN_TAT_DU_AN.md`; chưa đánh dấu G1/G4/G5/G6 PASS toàn bộ.

## Bổ sung: lỗi runtime Circle `Eoa` (03/10/2026)

Người dùng báo lỗi `Cannot read properties of undefined (reading 'Eoa')` sau đăng nhập email. Đã tái hiện bằng SDK `@circle-fin/user-controlled-wallets` 10.8.1 đang cài: khai báo TypeScript có `AccountType`, `FeeLevel`, `TestnetBlockchain`, nhưng module runtime không xuất ba đối tượng này. Vì vậy typecheck vẫn PASS trong khi bước `/api/circle/wallet/initialize` lỗi trước khi gửi yêu cầu tạo ví. Đây không phải lỗi OTP sai hoặc lỗi mạng Arc Testnet.

Đã chuyển ba điểm dùng runtime enum sang literal API được kiểm tra bằng kiểu SDK: `EOA`, `MEDIUM`, `ARC-TESTNET`. Không thay đổi chain, account custody, kiểm tra danh tính/quyền sở hữu, policy approve hoặc idempotency.

Thêm `backend/test/circle_sdk_runtime.test.ts` vào cả `test:wallet` và `test`. Test dùng SDK thật đang cài, chỉ giả lập phương thức API từ xa; SQLite test riêng. Test đã FAIL đúng lỗi `Eoa` trước sửa, PASS sau sửa. Bao phủ khởi tạo EOA, không tạo lại ví đã tồn tại, idempotency, faucet native USDC Arc Testnet, fee MEDIUM, từ chối danh tính khác và approval sai spender. Toàn bộ **16 script backend test**, typecheck và build đều PASS sau sửa. Trang, `/api/health`, `/api/circle/status` trả HTTP 200; health xác nhận Arc Testnet 5042002. Chưa thực hiện OTP live hoặc ký giao dịch thay người dùng.

Người dùng xác nhận cảnh báo ví xuất hiện ở Approve/Bridge. Ảnh chỉ thể hiện ví chặn loại chữ ký, chưa có RPC method, chain/contract/spender của yêu cầu hiện tại; chưa đủ bằng chứng kết luận nguyên nhân hoặc coi đó là cảnh báo vô hại do testnet. Luồng dự kiến dùng CCTP approve/burn/mint và không batching; không tắt cảnh báo, không đổi ví để né kiểm tra, không gửi lại burn khi trạng thái cũ chưa rõ. Cần ảnh chi tiết yêu cầu đã che thông tin nhạy cảm (mạng, contract, spender, số lượng và loại yêu cầu ký nếu ví hiển thị) để điều tra tiếp. [Hướng dẫn an toàn chữ ký của OKX](https://web3.okx.com/zh-hans/learn/preventing-phishing-attacks).

Các kiểm tra mới không thay thế nghiệm thu email/bridge/mua live và không đánh dấu dự án production-ready. Fingerprint trong evidence của đợt kiểm tra trước là snapshot trước thay đổi SDK runtime này, không phải hash của mã mới.
