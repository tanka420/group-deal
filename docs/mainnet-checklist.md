# Chuẩn bị GroupDeal Arc Mainnet

Cập nhật: 28/10/2026, giờ Việt Nam.

## Trạng thái

Đã chuyển mã nguồn sang chọn mạng thống nhất và thêm bản chuẩn bị Arc Mainnet. **Chưa sẵn sàng nhận tiền thật.** Manifest Mainnet vẫn `UNDEPLOYED`, `protocolVersion: null`, Hub và các role để trống. Startup và các đường gửi giao dịch từ frontend từ chối cấu hình này trước khi mở dịch vụ hoặc yêu cầu ví ký.

| Mục | Giá trị |
|---|---|
| Commit nguồn ban đầu | `50db65ce5e8dcbf70c14e3051d42b2a488d9c439` |
| Commit trước lượt chuyển mã | `2b75e7de0e0e9f6d14bbc6482a97c383772efb90` |
| Nhánh / checkout Mainnet | `codex/mainnet` / `E:/apps/group-deal-mainnet` |
| Testnet được giữ nguyên | `E:/apps/group-deal`, nhánh `codex/arc-candidate` khi kiểm lại |
| Mainnet chain / RPC / explorer | `5042` (`0x13b2`) / `https://rpc.mainnet.arc.io` / `https://explorer.arc.io` |
| USDC ERC-20 / gas | `0x3600000000000000000000000000000000000000`, 6 / 18 số thập phân |
| Circle chain code | `ARC`; bản Testnet tiếp tục dùng `ARC-TESTNET` |
| Phạm vi đề xuất để review | USDC trực tiếp; faucet, bridge và swap bị khóa trên Mainnet |
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
```

`build:mainnet` dùng môi trường được lọc, build production frontend với `VITE_APP_ENV=arc-mainnet`, để trống Circle/Reown và ghi inventory hash riêng cho frontend/backend trong `.cache/mainnet-build/<run>/BUILD.json`. Đây là build chuẩn bị, chưa phải artifact được phép activation. `prepare:mainnet` không có provider, ví, ký hoặc broadcast; kiểm compiler/source còn khớp trước khi xuất `.cache/mainnet-preparation/<sourceFingerprint>/UNSIGNED_REVIEW.json`. Các output này không đưa vào Git.

Gói hiện gồm hai **đề xuất**, chưa chọn một bản để phát hành:

| Contract | Creation bytecode keccak256 |
|---|---|
| GroupDealHub V1 | `0x3a1582e949fb7f89c882c24f25d8b0a44f4be01311529ddf5f9cde0a5e1e7d69` |
| GroupDealHubV2 | `0xbd48ca6dae806508c5afcc426bf802f100a1f7409ae167029578dd777da6bdd5` |

Compiler `0.8.24`, Cancun, viaIR, optimizer 200. Runtime trong gói là **template có immutable**, không phải runtime hash đã deploy. Constructor là `(USDC, authorizedSigner, operator, securityAuthority)`, owner là `msg.sender`. Chưa có địa chỉ được chốt nên `from/data/nonce/gas/fee` còn `null`, trạng thái `NOT_CONSTRUCTED_AWAITING_VERSION_AND_AUTHORITY_ADDRESSES`. Không trình template này như một giao dịch đã sẵn sàng ký. Sau M01/M03 phải encode transaction cụ thể và lấy nonce/phí mới trước khi xin M04/M06.

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
| M01 | Chọn contract V1/V2, rebate và phạm vi Mainnet đầu tiên; duyệt đề xuất USDC trực tiếp | Chủ sản phẩm, reviewer contract | Version, phạm vi và tiêu chí nghiệm thu | **Cần chốt**; chưa tự chọn V2 |
| M02 | Circle production, email, frontend app ID và Reown project/origin; chứng minh auth/challenge/transaction theo `ARC` | Chủ Circle/Reown/email | Tham chiếu cấu hình không secret, kết quả dịch vụ thật | Chưa thực hiện |
| M03 | Owner/deployer, authorization signer, operator và Security Safe độc lập; xác minh quyền, Safe owners/threshold/version/runtime hash | Người giữ khóa, owners Safe | Địa chỉ công khai và chính sách; không gửi khóa cho agent | **Cần địa chỉ/chính sách**; không kế thừa role Testnet |
| M04 | Ngân sách deploy/gas/giao dịch thử, ví funding và nguồn USDC thật | Chủ ngân sách, ví funding | Hạn mức, người nhận và nguồn đã xác minh | Chưa xin chi tiền |
| M05 | Review độc lập code, constructor/calldata, bytecode, signer/custody và các kết quả FAIL/SKIP còn lại | Reviewer độc lập, chủ sản phẩm | Kết luận theo exact commit/artifact và ngoại lệ | Chưa thực hiện; browser tổng hợp chưa ổn định |
| M06 | Sau M01/M03: chuẩn bị tx cụ thể với sender/nonce/phí/hạn mức, rồi xin ký deployment/configuration theo từng thao tác | Deployer, owner, Safe | Receipt finalized, deployment block, actual runtime hash, token/roles/Safe readback; cập nhật manifest | Chưa ký/broadcast/deploy |
| M07 | Hành trình Mainnet giới hạn với buyer/seller/operator độc lập: mua, giao, xác nhận/tranh chấp, hoàn/rút và đối soát | Chủ từng tài khoản/ví, operator | Receipt và accounting gắn đúng candidate | NOT_RUN |
| M08 | Nếu mở bridge/swap: duyệt mạng nguồn, route, contract, asset, fee, ngân sách và recovery; triển khai adapter/conformance trước live | Chủ sản phẩm, ví nguồn/đích | Quote/allowance/burn/mint/swap và đối soát theo đúng Mainnet | Có điều kiện; đang khóa |
| M09 | Hạ tầng production riêng, URL/origin, secret mới, DB mới, backup/monitoring; duyệt activation exact commit hoặc artifact | Chủ VPS/domain/dịch vụ | Frontend/backend version riêng, activation và postcheck | Chưa cấu hình/chưa kích hoạt |
| M10 | Ký nhận phát hành thử giới hạn hoặc công khai | Chủ sản phẩm, người nhận vận hành | Giới hạn, ngoại lệ và trách nhiệm vận hành | Chưa thực hiện |

Trước khi xin chữ ký/funding/activation phải có mạng, địa chỉ, contract, calldata/constructor, nonce, phí, số tiền/hạn mức và tác động cụ thể. Yêu cầu chuyển mã không cấp quyền ký thay người giữ khóa.

Các hành trình Testnet đã hoàn tất và các quyết định giữ retry/DLQ live, tích hợp X, miễn diễn tập restore thủ công/RPO-RTO vẫn giữ phạm vi/thời điểm cũ; không tự biến thành PASS Mainnet hoặc tự mở lại. Các kiểm chưa chạy luôn giữ NOT_RUN/SKIP có lý do.

Ngày 28/10, người dùng tiếp tục cho phép deploy và bỏ các test bổ sung. Đã chốt `testnet.groupdeal.tech` cho Testnet và `groupdeal.tech` cho Mainnet; DNS Testnet đã được người dùng thêm. Phạm vi domain/service activation này không tự cung cấp địa chỉ Safe Mainnet, funding hoặc chữ ký cho một giao dịch chưa có constructor/nonce/phí cụ thể. Xem `docs/domain-migration.md` và `config/domain-split-2026-10-28.json`. Test ứng dụng của lượt domain được ghi `SKIP_USER_REQUEST`; kiểm Nginx/TLS/health là xác nhận triển khai, không phải nghiệm thu tài chính.

Subdomain Testnet đã deploy thành công bằng commit vận hành `31ae9920dbde2e8490b8f524ffafede07dbc622d`, giữ backend Testnet `8c32212`, database và 95 held. Apex vẫn phục vụ Testnet trong lúc chờ Mainnet đủ contract/role/provider; chưa activation backend Mainnet hoặc phát giao dịch. Xem `docs/domain-split-2026-10-28.md`.
