# GroupDealHub V2 đã finalized trên Mainnet

Owner đã tự ký trong OKX sau khi chốt ngân sách 0,25 USDC và duyệt đúng một deployment V2. [Hub thật](https://explorer.arc.io/address/0x52A893b45C1BeaBdCe04f58705D7812eA2519Ff8) đã finalized, runtime/constructor/token/roles/Safe khớp trên hai RPC. `config/mainnet-hub-budget.json` nay đóng scope, signing/broadcast false, authorizationConsumed true. Production plan `FINALIZED_VERIFIED`; không có quyền deploy lại hoặc activation VPS.

## Giao dịch đã xác minh

| Mục | Giá trị |
|---|---|
| Chain | Arc Mainnet 5042 (`0x13b2`) |
| Owner/deployer | `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead` |
| USDC | `0x3600000000000000000000000000000000000000` |
| Authorized signer | `0xc9691f85f149e71C4e1C14c6E6204128546Eef17` |
| Operator | `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c` |
| Security authority | Safe 2/2 `0x1d4a6c23d9FC7A1Ca05Ecdf4efD0dF750D804B99` |
| Native value / recipient | 0 / không có `to`, tạo contract mới |
| Nonce đã review | 1 |
| Địa chỉ Hub thật | `0x52A893b45C1BeaBdCe04f58705D7812eA2519Ff8` |
| Creation data hash | `0xc8c2573541c11638eb5ebe08c9829767d9f18700ae3032a9a077699a8f02739e` |
| Transaction | `0xa227e5a1ffde4639b867e61716f562a8525ef52f0fb5752219a0669b1133f050` |
| Deployment block | 29.264.761 |
| Actual runtime hash | `0x2e2ff00c522d47f7fc8e78e6d6f66a0cdec52286ac175be0e2bc64734a458352` |
| Gas used / effective gas price | 4.612.656 / 20.001.438.937 |
| Chi thực / trần giao dịch của ví | 0,092259757321386672 / 0,150682043015268303 USDC; đều trong cap 0,25 |

Compiler/source đã đối chiếu trong `prepare:mainnet`: Solidity 0.8.24, Cancun, viaIR, optimizer 200. Bytecode V2 và constructor được ghim, V1 không chọn, plan all-one-wallet cũ vẫn SUPERSEDED. Owner cần review độc lập code/bytecode và ngoại lệ theo M05; build/fixture không thay thế audit độc lập hoặc nghiệm thu toàn ứng dụng.

## Kiểm lại chỉ đọc

```text
node scripts/verify_mainnet_hub.cjs 0xa227e5a1ffde4639b867e61716f562a8525ef52f0fb5752219a0669b1133f050
```

Verifier chỉ đọc trên `rpc.mainnet.arc.io` và `rpc.blockdaemon.mainnet.arc.io`, không có signer/broadcast. Đối chiếu creation data/nonce/receipt/OwnershipTransferred, mô phỏng constructor tại parent block và so runtime ở deployment block + snapshot finalized cố định; đọc protocol 2, token decimals 6, bốn role, pending authority rỗng, counters khởi đầu 1. EIP-712 domain kế thừa version 1, chain 5042, verifyingContract đúng Hub. Kiểm lại toàn bộ Safe tại cùng snapshot; hai RPC phải đồng ý. Proof đầu tiên từ source `17b7bdb`: `.cache/mainnet-hub-verification/1e39606a-47aa-463f-850a-2f9a8d9740a2/VERIFIED.json`, result `PASS_FINALIZED_MAINNET_HUB_V2`.

Manifest `VERIFIED` chỉ ghi bằng chứng contract. Source verification trên explorer, review độc lập, nghiệm thu ứng dụng và activation VPS vẫn chưa hoàn tất. Testnet không đổi.

## Lịch sử trang review local trước khi ký

Phần dưới mô tả thao tác đã hoàn tất. Helper cũ đã dừng, journal giữ nguyên; chạy lại helper/quote hiện tại sẽ bị từ chối với `MAINNET_HUB_ALREADY_DEPLOYED_NO_NEW_QUOTE`.

```text
node scripts/serve_mainnet_hub_review.cjs --port=60286
```

Port có thể bỏ qua để cấp tự động; chỉ bind `127.0.0.1`. URL và inventory tại `.cache/mainnet-hub-review/<run>/SERVE.json`. Trang có tiêu đề **Deploy GroupDealHub V2**, không dùng lại trang tạo Safe. Chọn OKX, chuyển Arc bằng nút riêng nếu cần, kết nối ví deploy. Sau khi có quyền, owner mới tự tích xác nhận và bấm xin giao dịch trong ví; không nhập seed/private key vào GroupDeal.

Khi chỉ chốt ngân sách, signing/broadcast đều false và nút ký vẫn khóa. Trước khi bật cần owner duyệt riêng **deploy đúng V2/constructor/nonce/data hash trong gói này từ ví đã chọn trên Arc, native value 0, phí không quá 0,25 USDC**. Sau đó phải ghi quyền, commit/push và chạy helper mới. Không suy quyền từ việc mở trang, kết nối ví, chốt ngân sách hoặc quyền tạo Safe trước đó.

Quote hết hạn sau 5 phút và được đọc lại trước wallet prompt, có kiểm nonce pending, Safe code/owners/threshold/version/nonce/modules và tổng phí. Nonce/địa chỉ dự kiến thay đổi, dữ liệu khác hoặc vượt cap phải dừng và review lại. Khi ví mở, owner kiểm loại **contract creation**, value 0 và gas không vượt 0,25 USDC; chỉnh phí trong ví không được vượt phạm vi đã duyệt.

Journal fsync trước wallet call, một attempt riêng theo data hash; hủy/không rõ kết quả không tự retry. Hash trả về không chứng minh deployment. Owner gửi hash công khai để đối chiếu receipt/finalized/runtime bytecode/token/owner/signer/operator/securityAuthority trước khi cập nhật Hub thật. Manifest vẫn UNDEPLOYED đến khi đọc lại đầy đủ; VPS và hành trình tiền thật có phạm vi riêng.

Các test `serve_mainnet_hub_review.test.cjs`, `quote_mainnet_hub.test.cjs`, `mainnet_safe_review.test.cjs` dùng fixture biệt lập, ví/RPC mock và Chrome profile riêng. Không sử dụng key/DB/tài khoản người dùng hoặc Testnet, không phát giao dịch thật.
