# Tạo Safe Mainnet theo hạn mức đã duyệt

Ngày 03/11/2026, chủ ví duyệt **ngân sách tối đa 0,02 USDC cho riêng một giao dịch tạo Safe 2/2**, sau đó duyệt riêng tạo đúng Safe trong gói đã review và tự phê duyệt bằng OKX/Rabby. Hai cờ ký/gửi đã được bật trong scope công khai `config/mainnet-safe-budget.json`; vẫn chờ thao tác trực tiếp của chủ ví, chưa có bằng chứng deployment. Không có private key, API key hoặc tài khoản Testnet trong công cụ này.

## Gói giao dịch

- Chain Arc Mainnet `5042`; Safe L2 `1.5.0`.
- Ví trả gas: `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead`.
- Owners: ví trả gas và `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c`; threshold 2/2.
- Factory: `0x14F2982D601c9458F93bd70B218933A6f8165e7b`.
- Địa chỉ dự kiến: `0x1d4a6c23d9FC7A1Ca05Ecdf4efD0dF750D804B99`. Chưa phải địa chỉ đã deploy.
- Factory calldata hash: `0x49dd9cf067bf65658a2c225cf05f3f67a3926a15936dacfddf152ea035a70ee4`.
- Native value, setup payment và delegatecall đều bằng 0/rỗng. Hạn mức chỉ trả gas; không nạp tiền vào Safe hoặc deploy Hub V2.

Theo [SafeProxyFactory](https://docs.safe.global/reference-smart-account/deployment/SafeProxyFactory), `createProxyWithNonce` vừa tạo proxy vừa thực hiện initializer; gói đã encode `setup` với owners/threshold và canonical fallback, không để proxy chưa khởi tạo. Registry ABI/địa chỉ/code hashes lấy từ lockfile Safe deployments, đối chiếu finalized RPC trước quote.

## Trang local cho OKX/Rabby

```text
node scripts/quote_mainnet_safe.cjs
node scripts/serve_mainnet_safe_review.cjs
```

Có thể dùng `--port=60286` để giữ nguyên origin localhost qua lần khởi động lại. Port chỉ nhận số 1024–65535 và vẫn bind `127.0.0.1`; không nhận địa chỉ RPC, wallet hoặc transaction từ CLI.

Hai lệnh chỉ chạy nguồn đã commit/push trên `codex/mainnet`, từ chối working tree chưa sạch. Trang chỉ bind `127.0.0.1` tại port được cấp khi chạy; URL và inventory nằm tại `.cache/mainnet-safe-review/<run>/SERVE.json`. Mở URL bằng trình duyệt có OKX/Rabby. Công cụ không chạy backend GroupDeal, đọc kho secret, mở DB hoặc deploy VPS.

Trang hiển thị đủ owners, địa chỉ dự kiến, factory, sender, dữ liệu giao dịch, nonce, phí và hạn quote 5 phút. Có thể chọn tiện ích và tự kết nối ví trả gas; ví phải đang ở Arc Mainnet. Không tự đổi mạng hoặc yêu cầu nhập seed/private key. Source/fingerprint thay đổi sẽ chặn packet cũ.

Nếu OKX báo mạng không khớp, chọn đúng **OKX Wallet** trên trang rồi bấm **Chuyển ví sang Arc Mainnet**. Đây là thao tác riêng của owner, dùng `wallet_switchEthereumChain` theo [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326); chỉ khi ví trả lỗi 4902 mới xin thêm mạng qua `wallet_addEthereumChain`, sau đó xin chuyển và đọc lại chain ID. Thông số được ghim theo [Arc Mainnet chính thức](https://docs.arc.io/arc/references/connect-to-arc): 5042/`0x13b2`, `https://rpc.mainnet.arc.io`, native USDC 18 decimals, explorer `https://explorer.arc.io`. Không thay mạng hoặc thêm mạng lúc tải trang/kết nối.

Trang hiện tên provider và chain ID thực do ví trả về; đọc chain trước `eth_requestAccounts`. Khi đúng 5042 mới xin kết nối tài khoản, rồi vẫn kiểm lại account/chain trước gửi. Sau chuyển, bấm **Kết nối ví đã chọn**, kiểm owner và tích ô xác nhận. Hủy chuyển, mạng chưa đổi, sai ví hoặc sai quote đều giữ nút gửi khóa, không tạo attempt. Đổi mạng trong một tiện ích không được dùng làm bằng chứng cho tiện ích khác.

Khi chỉ duyệt ngân sách, `signingAuthorized` và `broadcastAuthorized` đều **false**: nút ký bị khóa, server từ chối ghi attempt. Trước khi bật hai cờ này, cần người giữ ví duyệt riêng **tạo đúng Safe trên Arc từ sender/factory/owners/calldata ở trên, phí không vượt 0,02 USDC**. Không suy sự đồng ý từ việc mở trang, kết nối ví hoặc duyệt ngân sách. Sau khi ghi quyền tương ứng vào cấu hình, phải commit/push và khởi chạy lại helper với artifact mới.

Sau khi có quyền, chỉ thao tác trực tiếp của người giữ ví mới gọi `eth_sendTransaction`. Trang làm mới quote, kiểm lại account/chain và giới hạn phí; không `personal_sign`, approve token, dùng signer backend hoặc ký tự động. Người giữ ví phải kiểm phí cuối trong OKX/Rabby không vượt 0,02 USDC; thay đổi phí trong ví không được tự nới ngân sách.

Trước wallet prompt, server lưu và fsync journal `ATTEMPTING` vào `.cache/mainnet-safe-attempts/<dataHash>/ATTEMPT.json`. Một request chỉ cho phép một attempt; hủy hoặc trạng thái không rõ vẫn giữ khóa qua reload/restart. Không tự xóa journal hoặc thử gửi lại; phải đối chiếu nonce/tx/receipt và phạm vi còn lại trước bước tiếp theo. Hash ví trả về chỉ là `HASH_RETURNED`, không phải chứng minh finalized deployment.

## Sau giao dịch

Chủ ví gửi **tx hash công khai** trong chat. Cần xác minh transaction đúng chain/sender/factory/calldata/value/nonce/phí, finalized receipt/sự kiện ProxyCreation, proxy/singleton/fallback/version/owners/threshold, modules/guards/nonce trước khi ghi Safe thật vào manifest. Hub V2 và activation VPS có phạm vi, quote và quyết định riêng. Chưa có tx thì vẫn `UNDEPLOYED`; không tạo link explorer giả từ địa chỉ dự kiến.

## Kiểm tra giới hạn

```text
node --test scripts/quote_mainnet_safe.test.cjs
node scripts/mainnet_safe_review.test.cjs
```

Fixtures dùng địa chỉ ngẫu nhiên, mock RPC/ví, Chrome headless với profile riêng và chặn kết nối ngoài loopback. Không truy cập ví người dùng, secret, DB hoặc ký/gửi giao dịch thật. Kiểm cả budget-only không thể yêu cầu ký, sai ví/mạng/data/phí bị chặn, journal ghi trước wallet call và kết quả không rõ không tự gửi lại. Không phải full CI hoặc audit độc lập contract GroupDeal.
