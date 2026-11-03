# Chuẩn bị GroupDeal Arc Mainnet

Cập nhật: 03/11/2026, giờ Việt Nam.

## Trình tự đang áp dụng

Người dùng đã dừng hướng deploy contract/Studio trước và yêu cầu hoàn thiện Mainnet theo thứ tự. Các quyết định, quote và hướng dẫn Studio ở phần lịch sử bên dưới không phải phạm vi phát hành hiện hành. Giữ nguyên mã và các địa chỉ đã nhận; không xóa Testnet hoặc hồ sơ cũ.

| Bước | Đầu ra cần hoàn tất | Trạng thái hiện tại |
|---|---|---|
| 1. Chốt phạm vi, ví và quyền | V2/USDC; owner, signer riêng, operator, Safe owners/threshold và cách giữ khóa | **ĐÃ CHỐT PHÂN VAI**: đủ ba địa chỉ riêng và Safe 2/2. Người dùng xác nhận giữ quyền ký hai owners (USER_REPORTED, chưa phải chữ ký chứng minh quyền). Deployment/readback Safe thực hiện ở bước 4, chưa đánh dấu đã tạo. |
| 2. Hoàn thiện mã và cấu hình | Frontend/backend đúng Mainnet, production config/secret tách riêng, nguồn token và các lỗi còn lại được xử lý hoặc ghi ngoại lệ | **LOCAL CONFIG VERIFIED**: signer, Circle LIVE GET/App ID, SMTP TLS/login và Blockscout token GET thành công. Ba vault mã hóa riêng, verify không đổi. Reown origin USER_REPORTED. Runtime VPS, OTP/login thật, email giao nhận và đối soát token nhiều trang vẫn chờ các bước tương ứng; chưa phải nghiệm thu ứng dụng. |
| 3. Kiểm và đóng bản phát hành | Kiểm tra đúng scope, build exact commit đã push, inventory riêng frontend/backend; ghi rõ FAIL/SKIP/NOT_RUN còn lại | **PASS BUILD CHUẨN BỊ** từ commit đã push `2cdf858`; inventory và hash frontend/backend đã kiểm. Không phải full CI hoặc approval release; manifest vẫn UNDEPLOYED. |
| 4. Deploy và xác minh contract | Safe phù hợp, constructor cuối cùng, quote mới/hạn mức cụ thể, chủ ví ký; finalized receipt/code/roles và link explorer thật | **CHỜ OWNER TỰ KÝ**: đã duyệt riêng tạo đúng Safe 2/2, từ owner trên Arc 5042, native value 0, gas tối đa 0,02 USDC. Helper được bật cho một lần bấm trực tiếp trong OKX/Rabby; chưa có tx/receipt. Sau Safe finalized mới hoàn thiện constructor/quote Hub V2. Plan contract-only cũ vẫn SUPERSEDED. |
| 5. Triển khai ứng dụng | Manifest theo deployment thật; backend/DB/secret/backup/monitoring riêng, frontend/backend commit riêng; triển khai trên VPS theo phạm vi được duyệt | **NOT_RUN** cho bản Mainnet. Giữ Testnet và dữ liệu của nó riêng. |
| 6. Xác nhận trước mở công khai | Login/OTP/ví thật, hành trình tài chính giới hạn có phạm vi/ngân sách, đối soát và xử lý lỗi; chuyển `groupdeal.tech` và hậu kiểm | **NOT_RUN**. Hoàn thành trước khi công bố nhận tiền thật; Studio/share không thay cho các bước này. |

Role trong manifest chuẩn bị: `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead` làm owner/deployer; `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c` làm operator; `0xc9691f85f149e71C4e1C14c6E6204128546Eef17` làm signer riêng cho backend; securityAuthority sẽ là địa chỉ Safe chưa deploy. Người dùng đã chọn **Safe 2/2** với hai ví đầu làm owners. Đã ghi đủ ba role EOA, danh sách owners và threshold vào manifest; giữ địa chỉ/version/hash Safe trống, trạng thái `UNDEPLOYED`. Safe 2/2 cần cả hai khóa ký. [Khái niệm owners/threshold của Safe](https://docs.safe.global/advanced/smart-account-concepts).

Đã nhận địa chỉ signer, kiểm tra khác owner/operator và xác minh khóa trong kho local khớp signer ngày 03/11. Giá trị khóa không đi qua chat hoặc Git. Signer ký giấy phép mua EIP-712 off-chain, không cần nạp gas để thực hiện chữ ký đó. Còn cấu hình credential vào runtime production ở bước phù hợp; chưa xin funding/chữ ký deployment ở bước này.

Người dùng đã xác nhận có Circle Mainnet API key và khóa signer. Công cụ và hướng dẫn nhập trực tiếp trên máy: `docs/mainnet-secret-setup.md`. Chỉ đọc STATUS metadata để cập nhật tiến độ; không đọc/in secret hoặc plaintext vault vào tool output/chat. Việc người dùng nói có key không được ghi thành credential đã được cấu hình/xác thực.

## Trạng thái

Đã chuyển mã nguồn sang chọn mạng thống nhất và thêm bản chuẩn bị Arc Mainnet. Người dùng đã chọn **V2** ngày 02/11/2026. **Chưa sẵn sàng nhận tiền thật.** Manifest Mainnet vẫn `UNDEPLOYED`, `protocolVersion: 2`; đã ghi owner/deployer, signer, operator và owners/threshold Safe 2/2. Hub và địa chỉ/version/hash Safe còn thiếu. Startup và các đường gửi giao dịch từ frontend từ chối cấu hình này trước khi mở dịch vụ hoặc yêu cầu ví ký.

| Mục | Giá trị |
|---|---|
| Commit nguồn ban đầu | `50db65ce5e8dcbf70c14e3051d42b2a488d9c439` |
| Commit trước lượt chuyển mã | `2b75e7de0e0e9f6d14bbc6482a97c383772efb90` |
| Nhánh / checkout Mainnet | `codex/mainnet` / `E:/apps/group-deal-mainnet` |
| Testnet được giữ nguyên | `E:/apps/group-deal`, nhánh `codex/arc-candidate` khi kiểm lại |
| Mainnet chain / RPC / explorer | `5042` (`0x13b2`) / `https://rpc.mainnet.arc.io` / `https://explorer.arc.io` |
| USDC ERC-20 / gas | `0x3600000000000000000000000000000000000000`, 6 / 18 số thập phân |
| Circle chain code | `ARC`; bản Testnet tiếp tục dùng `ARC-TESTNET` |
| Phạm vi đề xuất để review | Thanh toán USDC; nhận qua địa chỉ/QR; bridge mở website Circle; faucet và swap tích hợp bị khóa trên Mainnet |
| Phạm vi bằng chứng | Local compiler, fixture, browser giả lập; không phải nghiệm thu live |

Thông số đã đối chiếu tài liệu chính thức ngày 28/10/2026: [mạng Arc](https://docs.arc.io/arc/references/connect-to-arc), [contract và quy đổi USDC](https://docs.arc.io/arc/references/contract-addresses), [Circle Wallets](https://developers.circle.com/wallets/supported-blockchains). Chưa kiểm RPC/credential/receipt Mainnet thật. Không suy từ tài liệu thành quyền triển khai.

Worktree dùng chung lịch sử Git với Testnet, không sao chép `.env`, database, private evidence, archive hoặc signing material. Manifest/contract Solidity Testnet và `shared/contracts.json` không bị sửa. Báo cáo review chưa track trong checkout Testnet vẫn được giữ nguyên. Baseline VPS 22/10 là hồ sơ lịch sử; không phục hồi stash/UI archive hoặc sửa `.cache/ci/*`.

## Phần nguồn đã thực hiện

- [x] Đọc AGENTS, checklist, nhánh, working tree và baseline trước khi sửa.
- [x] Thêm `shared/manifests/arc-mainnet.json`, dùng chung lựa chọn mạng qua `shared/network.mjs`, hỗ trợ TS/CJS manifest. Mặc định checkout này là Mainnet; fixture/launcher Testnet chọn môi trường tường minh.
- [x] Chuyển chain, Circle wallet/challenge/status, provider scope, quote MAC, receipt, nonce reservation và SQL persistence sang mạng đã chọn. Không nới schema thành chấp nhận đồng thời mọi chain cho một runtime.
- [x] Chuyển Web3/Reown, đọc RPC, admin login, wallet binding, UI, explorer và fallback sang cấu hình chung. Mainnet không đưa Sepolia vào danh sách Reown.
- [x] Khóa faucet, bridge, swap và token ngoài USDC trên Mainnet ở API/adaptor/UI. Mở chúng cần một phạm vi, mã tích hợp và kiểm thử riêng; sửa cờ manifest chưa đủ để bật.
- [x] Chặn Mainnet khi thiếu deployment/version/receipt/hash/role/Safe. Khi đủ cấu hình, kiểm chain, runtime bytecode, token decimals, owner/signer/operator/security authority, Safe code hash/version/owners/threshold và block finalized mới. Cấm role/owner Safe dùng các địa chỉ Hardhat công khai.
- [x] Tách database mặc định `backend/data/arc-mainnet`, cổng API `4100`, frontend dev `5174`; đồng bộ đường nguồn của công cụ recovery/backup. Chưa tạo hoặc kích hoạt database production. Fixture tiếp tục dùng thư mục SQLite riêng.
- [x] Tách token đăng nhập, checkout lock, intent/hash và join draft của Mainnet trong browser; giữ tên khóa Testnet để không tiêu thụ công việc đang giữ của Testnet.
- [x] Thêm mẫu không chứa secret `config/mainnet.env.example` và các lệnh kiểm/build/chuẩn bị offline. Hardhat Mainnet có `accounts: []`; đường deploy cũ vẫn bị chặn trên mạng live.
- [x] Biên dịch cả V1/V2, chuẩn bị gói bytecode/ABI/constructor và ghi các đầu vào còn thiếu trước khi xin chữ ký hoặc funding.

## Cách chạy lại trong checkout này

Dependency phải cài từ lockfile vào từng thư mục `backend`, `frontend`, `contracts`, `sdk`; không dùng dependency từ Testnet hay CI clone.

```text
node scripts/run_contract_checks.cjs compile
node scripts/run_contract_checks.cjs all
npm run check:mainnet
npm run test:mainnet-browser
npm run build:mainnet
npm run prepare:mainnet
node scripts/prepare_mainnet_safe.cjs
```

`build:mainnet` dùng môi trường được lọc, build production frontend với `VITE_APP_ENV=arc-mainnet`, lấy hai ID công khai từ `shared/mainnet-public.json` và ghi inventory hash riêng cho frontend/backend trong `.cache/mainnet-build/<run>/BUILD.json`. Kiểm tra artifact chứa đúng ID và không chứa ID fixture, `.env` hay source map. Đây là build chuẩn bị, chưa phải artifact được phép activation. `prepare:mainnet` không có provider, ví, ký hoặc broadcast; kiểm compiler/source còn khớp trước khi xuất `.cache/mainnet-preparation/<sourceFingerprint>/UNSIGNED_REVIEW.json`. Các output này không đưa vào Git.

Gói giữ cả hai artifact để đối chiếu lịch sử; **GroupDealHubV2 được chọn cho Mainnet**. V1 không được chọn cho đợt phát hành này và Testnet tiếp tục giữ deployment V1:

| Contract | Creation bytecode keccak256 |
|---|---|
| GroupDealHub V1 | `0x3a1582e949fb7f89c882c24f25d8b0a44f4be01311529ddf5f9cde0a5e1e7d69` |
| GroupDealHubV2 | `0xbd48ca6dae806508c5afcc426bf802f100a1f7409ae167029578dd777da6bdd5` |

Compiler `0.8.24`, Cancun, viaIR, optimizer 200. Runtime trong gói là **template có immutable**, không phải runtime hash đã deploy. Constructor là `(USDC, authorizedSigner, operator, securityAuthority)`, owner là `msg.sender`. Plan hai ví trong `config/mainnet-contract-deployment.json` đã được đánh dấu `SUPERSEDED`. Gói offline ghi constructor theo role hiện hành trong manifest, dùng `null` khi chưa có địa chỉ Safe và không encode creation data; assignment cũ chỉ giữ trong trường lịch sử `deploymentPlan`. V2 có trạng thái `NOT_CONSTRUCTED_AWAITING_PRODUCTION_ROLE_PLAN`. Quote wrapper từ chối plan cũ trước khi gọi RPC.

## Kiểm chứng ngày 28/10/2026

Mọi fixture dùng credential ngẫu nhiên riêng, RPC/API/ví giả lập hoặc loopback; không dùng dữ liệu hay tài khoản live. Log và báo cáo chi tiết nằm trong `.cache`, không đưa private evidence vào Git.

| Kiểm | Kết quả / giới hạn |
|---|---|
| Baseline trước khi sửa: `node scripts/verify_vps_baseline.cjs` | **FAIL có sẵn** ở scope frontend/backend so với hồ sơ VPS 22/10. Không dùng baseline này để kết luận bản Mainnet sai/đúng hoặc ghi full CI PASS. |
| Solidity compile và `run_contract_checks.cjs all` | **PASS, 68 tests**: V1/V2, quantity/tier/rebate, cancel/finalize/dispute/claim, conservation, gas/concurrency và stateful differential. Local EVM, không phải Arc live. Log `.cache/mainnet-contracts.log`. |
| `npm run check:mainnet` | **PASS**: default/unknown chain, startup bị chặn không tạo DB runtime, Circle `ARC` và từ chối `ARC-TESTNET`, provider scope, quote MAC, calldata/chain receipt, RPC chỉ đọc, đóng faucet/bridge/swap, finalized runtime/token/role/Safe. |
| Mainnet browser `mainnet.spec.ts` | **PASS, 6 tests**: nhãn tiền thật/mạng, direct receive, không dùng phiên Testnet, từ chối RPC Testnet/mutation, fallback sai mạng, chặn transfer trước khi mở ví khi chưa deploy. Log `.cache/mainnet-browser-final.log`. |
| Backend/frontend typecheck và build chuẩn bị Mainnet | **PASS** local; frontend có cảnh báo chunk lớn. Chưa có cấu hình Circle/Reown production hoặc activation. Inventory frontend/backend được ghi riêng. |
| SDK consumer/webhook/support download | **PASS** local conformance, package offline và HTTP loopback. Không phải provider production acceptance. |
| Workspace/indexer/wallet SQL và recovery types | **PASS** các lượt chọn scope: ACL/history, quote, SQL restart, signer race, startup binding, indexer evidence; recovery/backup/application/legacy typechecks và adapter native decimals. |
| Hồi quy backend rộng | Chạy theo đoạn, giữ kết quả thật trong `.cache/mainnet-regression-final.log`, `.cache/backend-tail.log`, `.cache/backend-tail2.log`. Các sai khác thông báo faucet, fallback fixture và thứ tự lỗi chain đã được sửa. Inventory recovery được bổ sung module mạng và đủ 3 manifest; kiểm freshness **15 PASS, 0 FAIL** tại `.cache/mainnet-recovery-dependencies.log`. Không tuyên bố một lượt full pipeline PASS. |
| Hồi quy browser Testnet | Checkout 10 ca, phí ngoài và nhiều wallet/recovery ca đã qua. Có lượt tổng hợp **FAIL do timeout** ở Circle fee/OTP; cả ba ca fee/OTP chạy riêng đã PASS. Link explorer Testnet cũ được giữ để tránh đổi hành vi ngoài phạm vi. Giữ log lỗi và lượt chạy lại; chưa coi toàn bộ browser suite ổn định. |
| Wrapper kiểm fingerprint | Các lượt chạy trong khi nguồn còn sửa báo **FAIL `SOURCE_CHANGED_DURING_CHECKS`** đúng thiết kế. Không nâng các lượt đó thành full-CI PASS. |
| Live Mainnet / Circle production / Reown cloud / bridge live | **NOT_RUN**, cần phạm vi, tài khoản và quyền tương ứng. |
| Independent review, financial journey, funding, deploy, activation | **NOT_RUN**. |

## Checklist quyết định và can thiệp

Không ghi API key, seed phrase, private key, OTP, session hoặc entitlement vào tài liệu này. Chỉ đóng mục sau khi có kết quả gắn với commit/manifest/artifact cụ thể.

| ID | Nội dung cần chốt/thực hiện | Người/quyền cần có | Đầu ra | Trạng thái |
|---|---|---|---|---|
| M01 | Chọn contract, rebate và phạm vi Mainnet đầu tiên | Chủ sản phẩm, reviewer contract | Version, phạm vi và tiêu chí nghiệm thu | **V2 đã chốt 02/11/2026**; thanh toán USDC, swap Mainnet để sau. Chưa tạo campaign hoặc tự bật early rebate. |
| M02 | Circle production, email, frontend app ID và Reown project/origin; chứng minh auth/challenge/transaction theo `ARC` | Chủ Circle/Reown/email | Tham chiếu cấu hình không secret, kết quả dịch vụ thật | **PARTIAL**: Circle LIVE GET/App ID và SMTP backend TLS/login PASS ngày 03/11. Reown origin `https://groupdeal.tech` và SMTP Circle USER_REPORTED. Chưa cấu hình credential trên VPS, chưa xác minh đăng nhập ví/OTP/transaction hoặc email giao nhận thật. |
| M03 | Owner/deployer, authorization signer, operator và Security Safe độc lập; xác minh quyền, Safe owners/threshold/version/runtime hash | Người giữ khóa, owners Safe | Địa chỉ công khai và chính sách; không gửi khóa cho agent | **PARTIAL**: đủ ba địa chỉ EOA riêng; secret signer đã xác minh local khớp địa chỉ. Safe owners/threshold 2/2 đã chốt, unsigned plan đã chuẩn bị; còn deployment/readback và bằng chứng quyền ký owners. Plan contract-only trước đó không phải cấu hình phát hành. |
| M04 | Ngân sách deploy/gas/giao dịch thử, ví funding và nguồn USDC thật | Chủ ngân sách, ví funding | Hạn mức, người nhận và nguồn đã xác minh | **SAFE SCOPE APPROVED** ngày 03/11: tối đa 0,02 USDC từ owner/deployer cho riêng một giao dịch tạo đúng Safe 2/2, native value 0; owner tự duyệt trong OKX/Rabby. Chưa có bằng chứng đã chi gas. V2/financial journey có ngân sách riêng; quote phải làm mới trước ký. |
| M05 | Review độc lập code, constructor/calldata, bytecode, signer/custody và các kết quả FAIL/SKIP còn lại | Reviewer độc lập, chủ sản phẩm | Kết luận theo exact commit/artifact và ngoại lệ | Chưa thực hiện; browser tổng hợp chưa ổn định |
| M06 | Sau M01/M03: chuẩn bị tx cụ thể với sender/nonce/phí/hạn mức, rồi xin ký deployment/configuration theo từng thao tác | Deployer, owner, Safe | Receipt finalized, deployment block, actual runtime hash, token/roles/Safe readback; cập nhật manifest | Chưa ký/broadcast/deploy |
| M07 | Hành trình Mainnet giới hạn với buyer/seller/operator độc lập: mua, giao, xác nhận/tranh chấp, hoàn/rút và đối soát | Chủ từng tài khoản/ví, operator | Receipt và accounting gắn đúng candidate | NOT_RUN |
| M08 | Nếu mở bridge/swap: duyệt mạng nguồn, route, contract, asset, fee, ngân sách và recovery; triển khai adapter/conformance trước live | Chủ sản phẩm, ví nguồn/đích | Quote/allowance/burn/mint/swap và đối soát theo đúng Mainnet | Có điều kiện; đang khóa |
| M09 | Hạ tầng production riêng, URL/origin, secret mới, DB mới, backup/monitoring; duyệt activation exact commit hoặc artifact | Chủ VPS/domain/dịch vụ | Frontend/backend version riêng, activation và postcheck | Chưa cấu hình/chưa kích hoạt |
| M10 | Ký nhận phát hành thử giới hạn hoặc công khai | Chủ sản phẩm, người nhận vận hành | Giới hạn, ngoại lệ và trách nhiệm vận hành | Chưa thực hiện |
| M11 | Cấp nguồn indexer token Arc dùng được từ server và nghiệm thu số dư/danh sách nhiều trang | Chủ hạ tầng/API | Nguồn đọc đáng tin, quyền truy cập nếu cần; so với ví thật | **CREDENTIAL/GET PASS**: key nhập ẩn được API chain 5042 chấp nhận; lưu DPAPI riêng, ba vault verify không đổi. Người dùng xác nhận đã thu hồi key gửi chat và nhập key mới. Fixture phân trang/số dư PASS; nghiệm thu danh sách ví thật nhiều trang và đối soát RPC vẫn NOT_RUN. |

Trước khi xin chữ ký/funding/activation phải có mạng, địa chỉ, contract, calldata/constructor, nonce, phí, số tiền/hạn mức và tác động cụ thể. Yêu cầu chuyển mã không cấp quyền ký thay người giữ khóa.

Các hành trình Testnet đã hoàn tất và các quyết định giữ retry/DLQ live, tích hợp X, miễn diễn tập restore thủ công/RPO-RTO vẫn giữ phạm vi/thời điểm cũ; không tự biến thành PASS Mainnet hoặc tự mở lại. Các kiểm chưa chạy luôn giữ NOT_RUN/SKIP có lý do.

Ngày 28/10, người dùng tiếp tục cho phép deploy và bỏ các test bổ sung. Đã chốt `testnet.groupdeal.tech` cho Testnet và `groupdeal.tech` cho Mainnet; DNS Testnet đã được người dùng thêm. Phạm vi domain/service activation này không tự cung cấp địa chỉ Safe Mainnet, funding hoặc chữ ký cho một giao dịch chưa có constructor/nonce/phí cụ thể. Xem `docs/domain-migration.md` và `config/domain-split-2026-10-28.json`. Test ứng dụng của lượt domain được ghi `SKIP_USER_REQUEST`; kiểm Nginx/TLS/health là xác nhận triển khai, không phải nghiệm thu tài chính.

Subdomain Testnet đã deploy thành công bằng commit vận hành `31ae9920dbde2e8490b8f524ffafede07dbc622d`, giữ backend Testnet `8c32212`, database và 95 held. Apex vẫn phục vụ Testnet trong lúc chờ Mainnet đủ contract/role/provider; chưa activation backend Mainnet hoặc phát giao dịch. Xem `docs/domain-split-2026-10-28.md`.

## Phạm vi giao diện chốt ngày 29/10/2026

- Người dùng đồng ý làm tiếp tại chat/checkout Mainnet và chuyển riêng thay đổi chung sang Testnet. Popup giữ nguyên nhắc OTP/chữ ký và seed/private key. Ba trang cá nhân chỉ hiện tiêu đề, ghi chú và đăng nhập khi chưa có phiên. Nền sáng lưới mờ, banner minh họa riêng cho trang chủ. Xem `docs/shared-ui-2026-10-29.md`.
- Commit chung `bc10239aa8830c91b5572071af24b98cb7b247ef`; backport Testnet `25101fd077616473681ba006c61be26bd82769fc`, chuẩn hóa xuống dòng `207f468`, cập nhật selector `478a91f06127eb25cabefc66a1d873ec2aa31144`. Testnet vẫn dùng manifest, contract, faucet và swap Testnet; báo cáo chưa track của người dùng được giữ.
- Mainnet bỏ nút/mục Nạp USDC, lựa chọn thanh toán bằng token Testnet và hướng dẫn EURC/cirBTC. Giữ Nhận/Gửi USDC; QR/địa chỉ nhận và nút bridge dẫn chính xác `https://bridge.usdc.com/`. Không tự gọi bridge nội bộ trên Mainnet.
- Hoán đổi Mainnet được người dùng cho phép phát triển sau nếu phức tạp. Giữ chặn ở API/adapter/UI; chưa cấu hình route/liquidity/slippage/approval cho tiền thật. Swap Testnet tiếp tục giữ nguyên.
- Thêm đường đọc holdings ERC-20 Mainnet, phân trang địa chỉ từ explorer, đọc số dư/decimals tại cùng block qua RPC đúng chain; token tự thêm lưu theo chain/tài khoản/ví. Không dùng token đọc được để tự mở quyền gửi/swap. Endpoint explorer thật hiện trả HTTP 403/trang xác minh; giao diện báo danh sách chưa đầy đủ và cho nhập địa chỉ contract. Không ghi live token discovery PASS.
- Backend/frontend TypeScript PASS; sáu fixture đọc token biệt lập PASS (đúng/sai chain, cursor khác ví, indexer lỗi, token đọc lỗi, đầu vào sai). Xem Chrome local desktop/mobile: số dư token khác USDC, bridge/QR và trạng thái chưa đăng nhập đúng; không tràn ngang. Chưa chạy toàn bộ test ứng dụng theo yêu cầu trước đó; production auth, holdings, swap và financial journey vẫn NOT_RUN.
- Chưa deploy các thay đổi ngày 29/10 lên VPS. Chưa ký, funding, tạo Safe hoặc thay Mainnet manifest. Giải thích Circle/billing, ngân sách gas và các role ở `docs/mainnet-owner-guide.md`.

### Kết quả theo commit sau khi sửa

| Bản | Commit nguồn | Kết quả |
|---|---|---|
| Mainnet frontend + backend | `46f99632f5a2047a647aba3e71aacf394bad09d0` | `build:mainnet` PASS. Fingerprint `5e462279ac81e5221e05fa3609fabfc7fd61ba236d3ecf350eb0a397595bf3c4`. Inventory riêng frontend/backend tại `.cache/mainnet-build/e6260b41-9a3b-4ad7-b40b-a712d1b76583/BUILD.json`. Cấu hình Circle/Reown production để trống; không có quyền activation. |
| Testnet frontend | `478a91f06127eb25cabefc66a1d873ec2aa31144` | TypeScript/Vite build PASS; `.cache/testnet-build/83becf53-1cec-433d-a8b6-655d14a1fd9f/BUILD.json`. Build chuẩn bị có public provider ID để trống; không dùng để thay release đang chạy. Backend Testnet không build/sửa. |
| Xem hai artifact trong Chrome với API/session giả lập và chặn kết nối ngoài local | Hai commit ở trên | PASS: ba trang chưa đăng nhập chỉ có section đăng nhập; câu bảo mật cuối popup giữ nguyên; mobile 390px không tràn ngang; cả hai có nền lưới. Testnet vẫn có nút Hoán đổi và EURC/cirBTC; Mainnet không có nút Hoán đổi hay nội dung Testnet. |

Đã push cả `codex/mainnet` và `codex/arc-candidate` lên origin. Không chạy full CI hoặc live acceptance. Các cảnh báo chunk/bundler trong build được giữ trong log local. Hai lượt xem artifact ban đầu gặp lỗi selector và dữ liệu fixture trình duyệt còn lại; đã sửa script xem và xác nhận lại bằng phiên Chrome mới, không sửa dữ liệu hay tài khoản live.

## Quyết định ngày 02/11/2026

- Người dùng chọn V2 và đồng ý trình tự chuẩn bị estimate, ký deployment, triển khai VPS và xác nhận sau deploy khi đủ đầu vào. Manifest đã chọn `protocolVersion: 2`, giữ nguyên `UNDEPLOYED`, Hub/receipt/hash/role/Safe còn trống.
- Gói offline đánh dấu riêng GroupDealHubV2 là `selectedForRelease`; V1 vẫn giữ để đối chiếu, không chọn cho Mainnet. Không sửa contract hoặc deployment Testnet.
- Chưa có địa chỉ owner/deployer, signer, operator, Safe owners/threshold và secret production cho backend. Chưa thể encode giao dịch cụ thể hoặc lấy estimate đúng sender/constructor. Chưa ký, funding, tạo Safe, broadcast hay activation VPS.
- Các build/preview ngày 29/10 là artifact lịch sử trước quyết định V2; không gán chúng thành bản release sau khi sửa manifest. Cần build lại exact commit khi đã đủ cấu hình production.
- Người dùng xác nhận Circle Mainnet đã bật, SMTP Email OTP đã cấu hình và cung cấp hai ID công khai. API key Mainnet vẫn cần nhập bảo mật ở backend; hướng dẫn trong `docs/mainnet-owner-guide.md`.
- Kiểm tra thay đổi chọn V2: cú pháp script offline PASS; fixture Mainnet PASS, gồm từ chối startup khi `UNDEPLOYED` và không tạo database runtime; frontend TypeScript PASS. Không chạy lại full CI hoặc giao dịch live.

### Circle/Reown công khai đã nhận

- **USER_REPORTED**: Circle Mainnet đã bật, SMTP Email OTP đã cấu hình.
- App ID `2ee19943-ce4c-59a0-958b-3814cfdeb215` và Project ID `b40cf0b4a742fcc69708d59a34765a50` được lưu trong `shared/mainnet-public.json` và mẫu env Mainnet. Đây là ID công khai, không phải API key hoặc khóa ký.
- Frontend Mainnet dùng hai ID này khi môi trường build không truyền giá trị khác; cấu hình fixture tường minh vẫn được ưu tiên. Testnet không kế thừa các giá trị mặc định Mainnet, không thay đổi checkout/nhánh Testnet trong lượt này.
- `build:mainnet` kiểm tra ID đầu vào, ghim cấu hình vào fingerprint qua file shared, kiểm tra ID trong JavaScript cuối và không phát hành `.env`/source map/ID fixture. Trạng thái live auth, origin allowlist, SMTP và Circle API key backend còn tách riêng với kết quả build.
- Manifest vẫn V2/`UNDEPLOYED`, chưa có địa chỉ quản trị/Safe/Hub; chưa cấu hình API key server, xin OTP, ký/broadcast hoặc deploy VPS.
- Reown: đọc endpoint cấu hình công khai với origin `https://groupdeal.tech` trả HTTP 200; SDK 1.8.24 diễn giải `email=false`, không có social và `reownAuthentication=false`, kết quả **COMPATIBLE** với luồng Circle riêng. Đây không phải xác minh allowlist origin hoặc đăng nhập ví. Không thay đổi remote settings. Frontend TypeScript PASS.
- Build cấu hình công khai từ commit `f2ddc2b35443d532ccecb08445921fabc9ebfa14`: **PASS**, artifact `.cache/mainnet-build/80f1ff66-a5fd-4555-81e4-de009d31a72e/BUILD.json`; fingerprint `fc66cc6908105f5f0a061c138a92a086726c8569815023fab916a09c6b5f31bb`. Đã xác minh hash của file public JSON có trong inventory nguồn và fingerprint khớp build, hai ID hiện diện trong JS, không có `.env`/source map/ID fixture. Backend credentials và live authentication vẫn chưa cấu hình/xác minh. 13 kiểm tra local wallet runtime PASS; không chạy full CI.

### Địa chỉ quản trị đã nhận và yêu cầu dùng chung một ví

- Ngày 02/11 người dùng gửi `0xe48b30ea70f77e5fa6311471c2e9687f8a701ead`, muốn dùng cho mọi role và thay sau. Đã kiểm tra định dạng và ghi owner/deployer dạng checksum `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead` vào manifest. Chưa có bằng chứng người dùng ký bằng địa chỉ này hoặc xác minh loại tài khoản trên chain.
- **INCOMPATIBLE_WITH_CURRENT_V2**: constructor của `GroupDealHub.sol`, được V2 kế thừa, yêu cầu securityAuthority khác operator. Gán cả hai cùng địa chỉ sẽ revert `Security authority must be distinct from operator`. Guard ứng dụng còn yêu cầu bốn role khác nhau và Security Safe có ít nhất hai owners/threshold hai. Chưa sửa Solidity hoặc nới guard theo yêu cầu gộp role.
- Backend hiện tạo `ethers.Wallet` từ `AUTHORIZED_SIGNER_PRIVATE_KEY` để ký giấy phép mua EIP-712. Dùng cùng ví owner làm signer sẽ yêu cầu khóa có quyền quản trị nằm trong cơ chế ký của server hiện tại; địa chỉ công khai hoặc kết nối ví trình duyệt không đủ để backend tự ký. Không yêu cầu người dùng gửi khóa trong chat.
- Đổi signer/operator thực hiện qua owner; ownership có `transferOwnership` kế thừa OpenZeppelin. Chuyển securityAuthority cần authority cũ gọi `transferSecurityAuthority`, rồi authority mới gọi `acceptSecurityAuthority`. Sau thay đổi phải cập nhật manifest và xác minh quyền runtime; không tự diễn ra chỉ bằng sửa địa chỉ cấu hình.
- Gói offline điền `from` của owner đã chọn, giữ các tham số còn thiếu và calldata/phí/nonce rỗng. Chưa chuẩn bị giao dịch có thể ký, funding, broadcast, deploy hay activation. Testnet giữ nguyên. Không chạy full CI hoặc live financial test trong lượt ghi nhận này.
- Kiểm tra giới hạn: **PASS** định dạng/checksum địa chỉ, cú pháp script, đầu ra offline ghi đúng owner/from, các trường chưa đủ vẫn `null`, mọi quyền ký/broadcast/activation vẫn `false` và guard từ chối manifest chưa deploy. Kết luận constructor dựa trên mã nguồn đã đối chiếu, không phải giao dịch thử live. Build mới **NOT_RUN** vì chưa có cấu hình role hợp lệ; artifact `f2ddc2b` ở trên vẫn là bằng chứng lịch sử trước thay đổi owner. Testnet kiểm lại vẫn ở `478a91f`, giữ nguyên báo cáo chưa track của người dùng.

### Lịch sử: deploy contract và preview Studio trước (đã thay thế)

- Người dùng làm rõ mục tiêu: deploy V2, đưa GitHub cho Arc Studio build để có link chia sẻ; xử lý backend/VPS/Circle secret/role production sau. Không dùng các mục activation ứng dụng để chặn việc nhập repo hoặc chuẩn bị contract-only deployment.
- Người dùng cung cấp thêm securityAuthority `0x7477f3fd762e4db846d5b17c656395b09fb0f27c` (checksum `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c`). Owner/deployer/signer/operator tạm dùng `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead`. Đây là hai địa chỉ khác nhau, đáp ứng điều kiện constructor V2; không cần sửa Solidity. Chưa xác minh ví thứ hai là Safe.
- `config/mainnet-contract-deployment.json` ghi riêng các role ban đầu và scope `CONTRACT_DEPLOYMENT_ONLY`. `prepare:mainnet` ghim plan vào fingerprint, encode constructor và creation data cho đúng V2 đã chọn. V1 không có creation data được chọn. Không đưa khóa quản trị lên backend để chuẩn bị hoặc deploy contract.
- Manifest runtime vẫn `UNDEPLOYED`, các guard bốn role độc lập và Safe không đổi. Sau deploy contract vẫn chưa activation backend/thanh toán thật; phải đổi signer/operator và chuyển securityAuthority sang Safe phù hợp rồi xác minh manifest trước khi mở dịch vụ.
- `node scripts/quote_mainnet_deployment.cjs` chỉ cho phép các RPC đọc/estimate/simulate tại RPC Mainnet chính thức. Kiểm chain, nonce chưa có giao dịch pending, code, block mới; tính gas có dự phòng 20%, đề xuất trần phí, ghi balance, calldata hash và predicted CREATE address. `eth_call` là mô phỏng, không phải receipt/runtime triển khai thật. Quote hết hạn sau 5 phút, budget/signing/broadcast/activation luôn `false`; owner tự duyệt và ký sau quote mới.
- Hướng dẫn repo/branch, build/preview, backend còn thiếu và prompt giới hạn cho Studio: `docs/arc-studio-handoff.md`. Arc Studio hỗ trợ import GitHub và live preview; theo tài liệu chính thức, không cung cấp hosting production hoặc phát giao dịch Mainnet thay người dùng. Phải xác minh link share và quyền truy cập thực tế, không trình link project/preview thành deployment Mainnet.
- Kiểm giới hạn **PASS**: cú pháp hai script, giải mã constructor từ creation data khớp đủ bốn địa chỉ, V2 được chọn/V1 không có creation data, plan có trong fingerprint, các cờ quyền vẫn `false`, guard runtime vẫn chặn. RPC wrapper từ chối `eth_sendRawTransaction` trước network và quote từ chối chain Testnet. Không chạy lại full CI hoặc test tài chính theo phạm vi người dùng ưu tiên.

Quote chỉ đọc từ commit `48499b3` trước khi đổi trình tự: chain 5042, estimate 4.650.432 gas; gas limit dự phòng 5.580.519; trần phí lúc đọc khoảng 0,2232281402363775 USDC, số dư native lúc đọc 1 USDC. Báo cáo `.cache/mainnet-preparation/a0969702931f0e2c8a09ea40ac903fe4e70d099d75c464b4de101f603895090b/QUOTE-c96f42d8-dd28-4675-9e8c-dbe51b82c325.json`. **HISTORICAL / NOT_APPROVED_FOR_SPEND**; không sử dụng lại cho constructor/candidate mới, không phải chi phí cố định hay receipt deployment. Chưa ký/gửi giao dịch, chưa có link contract đã deploy được xác minh.

Kiểm giới hạn khi đổi trình tự: cú pháp hai script **PASS**; V2 vẫn được chọn, creation data/hash mới đều `null`, trạng thái `NOT_CONSTRUCTED_AWAITING_PRODUCTION_ROLE_PLAN`; quote từ chối plan SUPERSEDED trước RPC (**0 network calls**); các cờ ký/broadcast/activation vẫn `false`, runtime UNDEPLOYED vẫn bị chặn. Không chạy full CI, build mới hoặc live test cho thay đổi plan này. Testnet kiểm lại giữ `478a91f` và báo cáo chưa track của người dùng.

### Signer và unsigned Safe plan đã chuẩn bị

- Người dùng cung cấp signer `0xc9691f85f149e71c4e1c14c6e6204128546eef17`; dạng checksum `0xc9691f85f149e71C4e1C14c6E6204128546Eef17` đã ghi vào manifest. Ba địa chỉ owner/signer/operator khác nhau; không nhận hoặc đưa khóa signer vào Git. Mẫu env đã điền operator và origin `https://groupdeal.tech`, các secret vẫn trống.
- `scripts/prepare_mainnet_safe.cjs` dùng ABI/địa chỉ/code hash từ `@safe-global/safe-deployments` 1.37.63 đã khóa, chọn canonical SafeL2 1.5.0 trên chain 5042. Không chạy script multisig Testnet cũ, không sửa các trang/challenge owner Testnet, không dùng Safe/keys Testnet.
- Unsigned call `createProxyWithNonce` chỉ setup hai owners đã chốt và threshold 2; delegatecall target/data rỗng, payment/token/receiver bằng zero, fallback đúng bản đã pin. Lệnh kiểm tra finalized chain/block, EOA, code hash/version singleton/factory/fallback; tính CREATE2 và so với kết quả `eth_call`. Không có provider ký hoặc API gửi giao dịch.
- Kiểm local **PASS**: giải mã setup/factory calldata khớp owners/threshold, không delegatecall/payment; từ chối chain Testnet, threshold sai, owners trùng, signer trùng owner, finalized block cũ và code hash sai trước mô phỏng; constructor Hub dùng signer/operator hiện hành, Safe còn `null`; startup manifest vẫn bị chặn. Kiểm RPC chỉ đọc/mô phỏng **PASS**: ba code hash canonical và VERSION khớp, địa chỉ dự kiến chưa có code, mô phỏng factory trả đúng CREATE2. Đây không phải nghiệm thu live deployment hoặc bằng chứng quyền ký.
- Safe dự kiến `0x1d4a6c23d9FC7A1Ca05Ecdf4efD0dF750D804B99`, factory calldata hash `0x49dd9cf067bf65658a2c225cf05f3f67a3926a15936dacfddf152ea035a70ee4`. **Chưa deploy**; không điền địa chỉ dự kiến vào manifest như một Safe đã được xác minh. Gói `.cache/mainnet-preparation/<sourceFingerprint>/UNSIGNED_SAFE_REVIEW.json` ghi source commit/fingerprint, block, code pins và calldata; nonce/gas/fee còn `null`, các quyền budget/signing/broadcast/activation đều `false`.
- Nguồn chuẩn bị Safe và mẫu env Mainnet được đưa vào inventory fingerprint; constructor Hub bản chuẩn bị lấy signer/operator hiện hành thay vì assignment cũ đã SUPERSEDED. Chưa chạy full CI/build mới hoặc giao dịch live trong lượt này. Tài liệu đối chiếu: [Safe deployment](https://docs.safe.global/sdk/protocol-kit/guides/safe-deployment).

### Công cụ nhập secret local cho bước 2

- `initialize_mainnet_secrets.ps1` nhận hai key qua input ẩn ở tài khoản Windows của người giữ khóa; kiểm signer bằng validator stdin local, tạo riêng ba app secrets 256 bit và lưu DPAPI CurrentUser ngoài Git với ACL riêng. Kho có sẵn chỉ xác minh, không tự xoay/ghi đè khóa. Không gọi API/RPC, ký, truyền dữ liệu ra ngoài, tạo DB hoặc kích hoạt dịch vụ.
- `validate_mainnet_secret_input.cjs` chỉ trả metadata/kết quả, không đưa private key/API key vào argv/env/log/file plaintext, không echo exception. Circle chỉ kiểm đầu vào local; quyền/API thực tế vẫn **NOT_RUN**.
- **PASS**: 3 nhóm kiểm Node với fixture mới; parser PowerShell; fixture Windows kiểm toàn đường lưu/đọc DPAPI, ACL riêng, app secrets khác nhau, metadata không chứa secret, verify không đổi vault và context signer đổi bị chặn. Fixture không dùng key thật hoặc Testnet, không phải cấu hình production đã hoàn tất.
- Trạng thái input thật được ghi sau khi người dùng nhập tại `.cache/mainnet-secret-input/<run>/STATUS.json`. Chưa có trạng thái `LOCAL_SECRETS_STAGED` thật tại thời điểm chuẩn bị công cụ; không nâng kết quả fixture thành PASS credential của người dùng. Chưa chạy build/full CI hoặc live auth trong lượt này.
- Lần mở đầu tiên **FAIL trước input** do khác môi trường PowerShell độc lập (tool/module lookup); không phải kết quả kiểm key. Đã sửa bằng đường dẫn công cụ dự phòng, hash .NET và cập nhật DACL mà không đổi owner NTFS; lỗi chỉ xuất mã/phase/type/số dòng, cửa sổ lỗi tự đóng. Fixture đầy đủ chạy lại bằng **Windows PowerShell 5.1 độc lập PASS**, gồm DPAPI/ACL và không ghi đè. Không đổi ExecutionPolicy hoặc nới quyền thư mục private.

### Xác minh local ngày 03/11 và cấu hình provider tiếp theo

- **PASS local thật**: người dùng đã nhập hai key; STATUS `LOCAL_SECRETS_STAGED` từ source `90d6d213ca949750baa9ed6c68f9a2ac105a88d6`. Chạy `-VerifyOnly` lại thành công, signer `0xc9691f85f149e71C4e1C14c6E6204128546Eef17` khớp manifest, ba app secrets có mặt và encrypted vault không đổi. Metadata tại `.cache/mainnet-secret-input/verify-9f2c32b4-2ead-4cab-b139-6d8cfff0c8a7/STATUS.json`; không đọc/in giá trị vào chat. Backend chưa cấu hình/kích hoạt; Circle live auth vẫn chưa được suy từ kết quả này.
- Người dùng chọn **dùng cùng tài khoản SMTP đã cấu hình Circle** cho thông báo backend. `configure_mainnet_smtp.ps1` nhập host/port/user/from/password (password ẩn), lưu SMTP ở kho DPAPI riêng `smtp.dpapi.json`; không đọc, xoay hoặc ghi đè kho Circle/signer/app secrets. Chỉ verify TLS/login; không gọi `sendMail`. Password không đưa vào argv/env/log/plaintext file.
- `check_mainnet_providers.cjs` giữ hai thao tác: SMTP verify và duy nhất `GET https://api.circle.com/v1/w3s/config/entity` với redirect bị chặn, deadline/bộ đệm hữu hạn. Route GET/data.appId đã đối chiếu SDK Circle user-controlled 10.8.1 đang khóa. Probe yêu cầu full `LIVE_API_KEY`, so appId với `shared/mainnet-public.json`; không tạo user/wallet/OTP hoặc gửi giao dịch. `initialize_mainnet_secrets.ps1 -VerifyOnly -CheckCircle` chỉ xuất kết quả đã lọc. [Circle API keys](https://developers.circle.com/api-reference/keys).
- **PASS fixture**: 4 nhóm Node kiểm strict TLS/no-send, lỗi chứa credential không bị echo, input sai bị chặn trước kết nối, fixed Circle GET/App ID, auth/transport/response lỗi. Fixture SMTP Windows PowerShell 5.1 độc lập kiểm nhập/mã hóa, không lộ password, main vault nguyên vẹn, verify-only không ghi đè; SMTP transport được mock, không phải auth thật. Kết quả SMTP/Circle thật chỉ ghi sau khi chạy tương ứng.
- **PASS Circle read-only thật**, source `4a866fa8d76d8aed8906d13cf32abab56e7c29f8`: full LIVE key được chấp nhận cho GET cấu hình (HTTP 200), `data.appId` khớp `2ee19943-ce4c-59a0-958b-3814cfdeb215`; signer vẫn khớp và core vault không đổi. Metadata `.cache/mainnet-secret-input/circle-read-6486a346-a8ec-4bba-9f98-9f8643711b00/STATUS.json`. Không tạo user/wallet/OTP, ký, gửi email/giao dịch hoặc kích hoạt backend. Login/OTP/Arc transaction chưa được xác minh.

### SMTP, Reown và nguồn token ngày 03/11

- **PASS SMTP thật**: TLS và đăng nhập được xác minh, cấu hình lưu vào kho DPAPI riêng; core vault không đổi. Metadata `.cache/mainnet-smtp-input/0363e095-3db5-4698-9f81-facd1677ec4a/STATUS.json`, source `e80456bd85ac91b450bec05db2daa47f176ca51d`. `emailsSent: 0`, `emailDeliveryVerified: false`, backend chưa kích hoạt. Verify-only tiếp theo tại `.cache/mainnet-smtp-input/verify-72d97899-2411-481d-af8e-771d576831a2/STATUS.json` chỉ kiểm local; hash hai vault trước/sau không đổi. Không suy từ TLS/login thành email đã giao thành công.
- **USER_REPORTED Reown**: chủ tài khoản xác nhận origin `https://groupdeal.tech` đã có hoặc đã thêm vào project `b40cf0b4a742fcc69708d59a34765a50`. Chưa có phiên ví ngoài thật hoặc bằng chứng dashboard độc lập; live login vẫn NOT_RUN.
- Blockscout công bố hỗ trợ [Pro API cho Arc chain 5042](https://mail.blockscout.com/p/news-exploring-arc). Đã chuyển discovery sang host cố định `api.blockscout.com/5042`, dùng key backend-only trong Authorization header, không đưa key vào URL/frontend/cursor. Theo [tài liệu authorization](https://docs.blockscout.com/devs/blockscout-api-responses-and-routes), API mới cần key cả ở gói Free. Cấu hình rỗng/sai hoặc API lỗi vẫn báo danh sách chưa đầy đủ, giữ nhập token thủ công.
- Pagination chỉ nhận bốn trường được đặc tả (`fiat_value`, `id`, `value`, `items_count`), hỗ trợ null; từ chối thay host/chain/type/credential qua cursor. Indexer chỉ cung cấp địa chỉ token; balance/decimals/name/symbol vẫn đọc cùng block Arc RPC, không dùng số dư indexer để tạo giao dịch hoặc tự mở swap.
- **PASS giới hạn**: 6 nhóm fixture holdings, 6 nhóm provider (SMTP/Circle/Blockscout), backend TypeScript và fixture nhập/mã hóa indexer bằng Windows PowerShell 5.1; secret scan không có findings. Fixture dùng key mới ngẫu nhiên và mock, không dùng key thật/Testnet. Công cụ `configure_mainnet_indexer.ps1` lưu DPAPI riêng và không đổi hai vault trước đó; verify-only không gọi mạng/ghi đè. Chưa chạy full CI, build mới, API Blockscout thật hoặc financial journey cho thay đổi này.
- Key Blockscout đã được gửi trong chat: không dùng để cấu hình production, không đưa giá trị vào tài liệu/Git/log. Chủ tài khoản cần thu hồi key đó và nhập key mới qua ô ẩn. Việc key cũ đã bị thu hồi cần người dùng xác nhận; không tự ghi PASS.

### Cập nhật sau khi nhập key mới và build exact commit

- Người dùng xác nhận **đã thu hồi key Blockscout cũ và nhập key mới** (USER_REPORTED về thu hồi). Ô nhập source `2cdf858a872776d3965d4e7ab09a170168eb8380` trả `INDEXER_LOCAL_STAGED`, `indexerReadVerified: true`; GET token cố định được chấp nhận. Metadata `.cache/mainnet-indexer-input/7346b7d8-3622-4514-9a8d-19c40451b3ee/STATUS.json`. Không ghi key hoặc danh sách token vào report.
- Verify-only tại `.cache/mainnet-indexer-input/verify-7095a858-6d79-42ce-8ef3-475bf51fd9c4/STATUS.json` PASS local, không gọi mạng. Hash của cả ba vault Circle/signer/app secrets, SMTP và indexer trước/sau không đổi. Không export credential sang Linux hoặc activation backend.
- **PASS build chuẩn bị** từ commit đã push `2cdf858a872776d3965d4e7ab09a170168eb8380`: `.cache/mainnet-build/85e01956-e8f6-42b3-88c9-dc3dad000092/BUILD.json`, fingerprint `b5a95c53a68f90b139c24f7d3c8d84713c379e1d4b58fba7a24c931fd92c1be7`. Đối chiếu lại fingerprint và từng hash của 187 file frontend, 192 file backend PASS; public provider IDs đúng. Cảnh báo bundler/chunk lớn giữ trong log. Build dùng fixture secrets đã lọc, không chứa credential production, manifest vẫn UNDEPLOYED; không phải full CI hoặc live acceptance.
- Safe 1.5.0/2-of-2 được đọc code pins và mô phỏng lại theo cùng source/fingerprint: `.cache/mainnet-preparation/b5a95c53a68f90b139c24f7d3c8d84713c379e1d4b58fba7a24c931fd92c1be7/UNSIGNED_SAFE_REVIEW.json`. Địa chỉ dự kiến/data hash giữ nguyên, chưa có code triển khai và chưa điền vào manifest.
- Quote tạo Safe **chỉ đọc, chưa duyệt** lúc `2026-11-03T01:59:13.080Z`, hết hạn `02:04:13.080Z`: `.cache/mainnet-preparation/b5a95c53a68f90b139c24f7d3c8d84713c379e1d4b58fba7a24c931fd92c1be7/SAFE_QUOTE-c3e07c3b-9849-4dd6-a5af-867231e4d92a.json`. Sender owner `0xe48B…1Ead`, to factory canonical `0x14F2982D601c9458F93bd70B218933A6f8165e7b`, native value 0, nonce lúc đọc 0; estimate 279.502 gas, limit 335.403, trần phí theo quote 0,013751523 USDC; số dư lúc đọc 1 USDC. Factory calldata hash `0x49dd9cf067bf65658a2c225cf05f3f67a3926a15936dacfddf152ea035a70ee4` đã đối chiếu. Chỉ quote Safe; Hub V2 cần bước riêng sau Safe finalized/readback. Đề xuất hạn mức 0,02 USDC cho Safe chưa được duyệt; phải refresh trước ký, không tự tăng trần.
- Testnet đối chiếu lại vẫn ở `478a91f06127eb25cabefc66a1d873ec2aa31144`, giữ nguyên báo cáo chưa track của người dùng. Chưa deploy contract/VPS, ký message/giao dịch, funding hoặc chi gas.

### Ngân sách Safe đã được duyệt, quyền giao dịch vẫn tắt

- Người dùng chốt **tối đa 0,02 USDC cho tạo Safe**, xác nhận dùng OKX hoặc Rabby trong trình duyệt. `config/mainnet-safe-budget.json` ghim chain, from/factory, owners/threshold/version, predicted address và calldata hash; chỉ `budgetApproved: true`. `signingAuthorized`, `broadcastAuthorized`, `hubDeploymentAuthorized`, `activationAuthorized` đều **false**. Không nâng ngân sách thành quyền gửi giao dịch.
- `quote_mainnet_safe.cjs` kiểm lại canonical finalized code pins/setup, nonce pending/latest, block mới/canonical, số dư, gas dự phòng 20% và phí tổng không vượt 0,02 USDC; quote 5 phút. CLI từ chối nhánh khác, source chưa commit hoặc HEAD chưa push. Một quote thử trước commit chỉ là draft, không dùng làm artifact exact commit.
- `serve_mainnet_safe_review.cjs` build trang thao tác riêng, chỉ bind loopback. Chọn OKX/Rabby qua EIP-6963/injected provider, tự kết nối đúng owner ở Arc; không tự đổi mạng, đọc secret/DB hoặc gửi giao dịch khi chỉ có ngân sách. Server chống cross-origin/Host lạ, không có RPC proxy hoặc signing key. Gói thay source sẽ bị chặn.
- Luồng ký đã được chuẩn bị nhưng khóa: sau khi có quyền riêng, chỉ một lần bấm của owner mới xin `eth_sendTransaction`; journal fsync ghi trước wallet call. Hủy hoặc trạng thái không rõ giữ khóa qua reload/restart; không tự gửi lại. Hash chỉ là kết quả ví, chưa phải finalized deployment. Hướng dẫn: `docs/mainnet-safe-creation.md`.
- **PASS fixture**: 3 nhóm kiểm quote/cap/scope/nonce/block/simulation; 5 nhóm kiểm HTTP và browser riêng (budget-only không yêu cầu ký, sai account/chain/data/phí bị chặn, attempt ghi trước wallet call, single-flight, reject/unknown không retry). RPC và ví đều mock, profile Chrome riêng, không truy cập ví thật hoặc ký/gửi giao dịch. Layout mobile 390px không tràn ngang; đã xem ảnh render. Test Host ban đầu FAIL do Node fetch không gửi Host override; đổi sang HTTP client có header thật và chạy lại PASS. Đây không phải full CI/audit độc lập hoặc deployment acceptance.
- Công cụ trình duyệt/Windows trong phiên báo lỗi khởi tạo `failed to write kernel assets` nên chưa thao tác UI ví người dùng. Không thay bằng Playwright để điều khiển ví thật; chỉ dùng headless profile riêng cho fixture.
- Source ứng dụng/frontend/backend không thay trong lượt chuẩn bị Safe này; bản build ứng dụng vẫn là artifact `2cdf858` ghi phía trên. Trang thao tác Safe có source/inventory riêng, không gán build ứng dụng cũ thành build của các script mới. Testnet, manifest runtime UNDEPLOYED, dữ liệu/secrets và dịch vụ live được giữ nguyên.
- **PASS helper/quote thật từ commit đã push `8279fa5fbfaad5e338a2f3d56be05b01fc618297`**: fingerprint `f1e5a80228dd50694b138424de80995ddddb956de60e7a371cadb85939c8eb34`. Trang chỉ xem local đã build/chạy; inventory ba file phục vụ được đối chiếu hash đúng. Metadata `.cache/mainnet-safe-review/3552cdd5-a2aa-4a74-b9f5-22f1e58385bf/SERVE.json` và `VERIFIED.json`. Không kết nối ví người dùng hoặc ghi attempt.
- Quote chỉ đọc lúc `2026-11-03T02:27:42Z` (09:27 giờ Việt Nam), hết hạn sau 5 phút, nonce 0, gas limit 335.403, trần phí 0,013751523 USDC, số dư 1 USDC; không vượt cap đã duyệt. Artifact `.cache/mainnet-preparation/f1e5a80228dd50694b138424de80995ddddb956de60e7a371cadb85939c8eb34/SAFE_QUOTE-7800136f-e0e1-4c64-a9a6-f8858b3361bd.json`. Budget true, signing/broadcast false, không có attempt hoặc deployment. Trang lấy quote mới khi người dùng cập nhật; không dùng quote hết hạn để xin ký.

### Owner đã duyệt riêng giao dịch tạo Safe

- Người dùng trả lời **“Cho phép tạo Safe trong phạm vi trên”** sau khi đã có trang/gói review: chain 5042; sender `0xe48B…1Ead`; owners `0xe48B…1Ead` và `0x7477…f27c`; threshold 2; native value 0; gas tối đa 0,02 USDC; tự phê duyệt bằng OKX/Rabby. Quyền này chỉ áp dụng setup/factory/calldata hash đã ghim, không mở rộng sang Hub V2 hoặc VPS.
- Đã bật `signingAuthorized`/`broadcastAuthorized` riêng trong `config/mainnet-safe-budget.json`, giữ cap/from/owners/factory/data hash nguyên vẹn và hai cờ Hub/activation false. Helper chỉ xin transaction sau thao tác trực tiếp của chủ ví; agent không kết nối, ký hoặc tự bấm gửi thay chủ ví. Helper budget-only cũ đã dừng, journal chưa có attempt khi chuyển bước.
- Chưa có receipt/finalized/code hoặc link contract đã deploy. Manifest vẫn UNDEPLOYED; không đưa địa chỉ dự kiến vào Safe runtime. Bản frontend/backend, Testnet, vault/DB và VPS giữ nguyên. Sau owner ký phải đọc và đối chiếu giao dịch thật trước khi đóng bước Safe.
