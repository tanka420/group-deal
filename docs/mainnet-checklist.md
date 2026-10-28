# Chuẩn bị GroupDeal Mainnet

Ngày tạo: 28/10/2026, giờ Việt Nam.

## Trạng thái hiện tại

Đã tách mã nguồn để chuẩn bị chuyển đổi. Chưa thay đổi mã ứng dụng hoặc cấu hình mạng, chưa triển khai contract, chưa chạy kiểm thử Mainnet và chưa có kết luận sẵn sàng nhận tiền thật.

| Mục | Giá trị |
|---|---|
| Commit nguồn ban đầu | `50db65ce5e8dcbf70c14e3051d42b2a488d9c439` |
| Nhánh chuẩn bị | `codex/mainnet` |
| Checkout Mainnet | `E:/apps/group-deal-mainnet` |
| Checkout Testnet được giữ nguyên | `E:/apps/group-deal` |
| Cách tách | Git worktree: thư mục làm việc riêng, dùng chung lịch sử và refs Git |
| Mạng mục tiêu | Arc Mainnet; tham số phải được xác minh lại trước triển khai |
| Phạm vi bằng chứng | Chuẩn bị nguồn; không phải kết quả CI hoặc nghiệm thu live |

Worktree chỉ lấy nội dung đã commit. Báo cáo review chưa được track trong checkout gốc không được nhập; không sao chép dependency, build, `.env`, database, archive hoặc bằng chứng private. Bản baseline VPS 22/10 là hồ sơ lịch sử, không phải phiên bản của bản Mainnet tương lai.

Theo yêu cầu tiếp theo cùng ngày, nhánh `codex/mainnet` đã được chuyển sang checkout trên ổ E tại đường dẫn ghi trên. Mã ứng dụng giữ nguyên; vị trí này dùng chung Git với checkout Testnet.

## Những việc đã làm

- [x] Đọc nhánh, trạng thái working tree và baseline trước khi tạo bản sao.
- [x] Tạo worktree từ đúng commit nguồn và nhánh `codex/mainnet`.
- [x] Ghi lại các phần cần tự kiểm và các bước cần người có thẩm quyền.
- [ ] Chuyển mã ứng dụng sang hỗ trợ Mainnet.
- [ ] Chạy kiểm thử trên mã Mainnet sau chuyển đổi.

## Công việc có thể tự thực hiện trong môi trường riêng

- [ ] Rà các tham số Testnet nằm trong manifest, runtime security, frontend, Circle, schema, persistence, bridge, fallback và tooling. Thay bằng cấu hình mạng có kiểm chứng; không thay hàng loạt số chain ID rồi bỏ kiểm tra authority.
- [ ] Thêm manifest Mainnet và cấu hình mẫu không chứa secret. Contract chưa triển khai phải được đánh dấu rõ; không dùng địa chỉ Testnet làm địa chỉ Mainnet mặc định.
- [ ] Đồng bộ chain/token/contract/role/version giữa backend, frontend, SDK, provider và công cụ xác minh. Chặn startup hoặc giao dịch khi cấu hình chưa đủ hoặc sai mạng.
- [ ] Chuẩn bị môi trường, cổng, database và dependency riêng. Không dùng dependency hoặc dữ liệu của `.cache/ci/*` làm bản candidate mới.
- [ ] Kiểm thử contract và reference accounting: tier, quantity, early rebate, finalization/cancel, dispute, conservation và claim. Chốt version trước khi tạo artifact triển khai.
- [ ] Kiểm thử backend: authorization, ACL, principal, nonce/replay, idempotency, receipt/event, indexer, reconciliation và recovery.
- [ ] Kiểm thử browser bằng provider/wallet fixtures: kết nối và sai mạng, phí, approve/commit, timeout/replacement, refresh/đổi phiên, giao hàng, tranh chấp và claim.
- [ ] Kiểm thử Circle/Reown và bridge bằng adapter/contract fixtures theo đúng mạng; các ca phụ thuộc dịch vụ thật giữ NOT_RUN hoặc SKIP có lý do.
- [ ] Kiểm SDK, provider/webhook conformance, build frontend/backend và pipeline phù hợp trên commit cuối. Giữ bằng chứng theo phiên bản; không dùng CI Testnet cũ để ghi PASS cho Mainnet.
- [ ] Chuẩn bị artifact chưa ký, thông số constructor, runtime hash, manifest, deployment block dự kiến theo receipt thật và kế hoạch activation/recovery để review.
- [ ] Tổng hợp kết quả, lỗi còn mở và checklist can thiệp dưới đây; không ghi nhận đã nghiệm thu thay người review.

Các nhóm source đã xác định cần chuyển đổi gồm `shared/manifest.*`, `shared/arcWallet.*`, `backend/src/services/runtimeSecurity.ts`, Circle authentication/challenge/wallet services, wallet/bridge domain và persistence, frontend auth/Web3/Reown/bridge/fallback, cùng readiness/deployment tooling. Đây là inventory khởi đầu, chưa phải tuyên bố đã liệt kê đủ mọi file.

## Checklist quyết định và can thiệp

Mỗi mục chỉ đóng sau khi có kết quả hoặc quyết định cụ thể. Không đưa API key, seed phrase, private key, OTP, session hoặc nội dung entitlement vào tài liệu này.

| ID | Nội dung | Người/quyền cần có | Đầu ra cần ghi nhận | Trạng thái |
|---|---|---|---|---|
| M01 | Chốt contract V1/V2, cách tính rebate và phạm vi Mainnet đầu tiên; xác định giữ USDC trực tiếp hay mở bridge/swap ngay | Chủ sản phẩm, reviewer contract | Version và phạm vi được chọn, tiêu chí nghiệm thu | Chưa chốt |
| M02 | Chuẩn bị Circle production và xác minh cấu hình đăng nhập/SDK với tài khoản thực | Chủ Circle Console | Tham chiếu cấu hình không chứa secret; kết quả auth/challenge/transaction thực | Chưa thực hiện |
| M03 | Chuẩn bị và chứng minh quyền kiểm soát owner, authorization signer, operator và Security Safe trên Mainnet | Người giữ từng khóa; các owner Safe | Địa chỉ, threshold, policy, quyền kiểm soát và quy trình thay khóa/xử lý sự cố | Chưa thực hiện |
| M04 | Chốt ngân sách deploy, gas và giao dịch thử; nạp USDC thật | Chủ ngân sách và ví funding | Hạn mức, ví nhận và nguồn funding được xác minh | Chưa thực hiện |
| M05 | Review độc lập candidate, artifact và các quyền tài chính | Reviewer độc lập và chủ sản phẩm | Kết luận theo đúng commit/manifest, lỗi cần sửa hoặc ngoại lệ được chấp nhận | Chưa thực hiện |
| M06 | Ký deployment và các giao dịch cấu hình cần thiết; xác minh receipt/runtime/roles sau deploy | Deployer, owner, Safe theo từng thao tác | Hash giao dịch, deployment block, bytecode và role readback | Chưa thực hiện |
| M07 | Chạy hành trình Mainnet có giới hạn với buyer/seller/operator độc lập và đúng người duyệt ví | Chủ các tài khoản/ví và quyền operator | Mua, giao, xác nhận/tranh chấp, hoàn/rút; receipt và đối soát gắn đúng candidate | Chưa thực hiện |
| M08 | Nếu mở bridge/swap: duyệt tuyến, tài sản, phí và ngân sách; chạy nguồn ví thật | Chủ sản phẩm, ví nguồn/đích | Quote/allowance, burn/mint hoặc swap receipt, recovery và balance đúng | Có điều kiện; chưa thực hiện |
| M09 | Cấu hình hạ tầng production riêng và chốt activation từ commit/artifact đã review | Chủ VPS/domain/dịch vụ theo quyền cần thiết | Cấu hình, backup/monitoring và receipt activation/postcheck | Chưa thực hiện |
| M10 | Ký nhận phát hành và phạm vi ngoại lệ còn lại | Chủ sản phẩm và người nhận vận hành | Quyết định mở thử giới hạn hoặc mở công khai; giới hạn và trách nhiệm vận hành | Chưa thực hiện |

Những việc đã hoàn tất trên Testnet giữ nguyên phạm vi và thời điểm. Các quyết định hoãn retry/DLQ live, tích hợp X và miễn diễn tập restore thủ công/RPO-RTO không tự đổi thành PASS hoặc bị mở lại; nếu tác động đến quyết định Mainnet thì trình bày rõ phần rủi ro và quyết định cần chốt.

## Cách ghi kết quả kiểm

Mỗi lượt kiểm ghi commit/source fingerprint, môi trường, lệnh hoặc hành trình, kết quả PASS/FAIL/SKIP/NOT_RUN, phạm vi fixture/live và tham chiếu bằng chứng đã loại secret. Kiểm chưa chạy không được ghi PASS. Kiểm local hoặc fork không thay live Mainnet evidence.

Trước khi yêu cầu ký, funding hoặc activation, phải có nội dung cụ thể để review: mạng, ví, contract, calldata/constructor, nonce, phí, số tiền/hạn mức và tác động dự kiến nếu áp dụng. Một yêu cầu chuyển đổi mã nguồn không tự cung cấp quyền ký thay người giữ khóa.
