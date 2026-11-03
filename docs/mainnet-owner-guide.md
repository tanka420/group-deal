# Các quyết định chủ dự án cần chuẩn bị trước Mainnet

Cập nhật 03/11/2026. Người dùng đã chọn V2 và yêu cầu quay lại hoàn thiện Mainnet tuần tự. Trình tự hiện hành nằm ở đầu `docs/mainnet-checklist.md`; phương án deploy contract/Studio trước đã thành lịch sử. Tài liệu giải thích các mục trong checklist; không cấp quyền ký, nạp tiền, thêm thẻ hoặc deploy.

## Circle production và thanh toán

Circle production là môi trường Mainnet của dịch vụ Circle Wallets dùng cho đăng nhập email và ví trong ứng dụng. GroupDeal đang dùng ví user-controlled: người dùng tự phê duyệt xác thực/giao dịch. Việc bật production không thay đổi contract V1/V2 và không tự deploy GroupDeal. Ví ngoài kết nối qua Reown là một luồng khác.

Theo [FAQ Circle Wallets](https://help.circle.com/support/en/circle-wallets-faqs?id=kb_article_view&sysparm_article=KB0010611), chuyển từ Testnet sang Mainnet cần thông tin thanh toán và bước xét duyệt tuân thủ. Chủ tài khoản cần hoàn thành những bước Console đang yêu cầu, kiểm tra quyền sử dụng User-controlled Wallets trên Arc, thiết lập ứng dụng/đăng nhập email cho domain `groupdeal.tech`, rồi tạo cấu hình Mainnet tương ứng. Chỉ cung cấp App ID/tham chiếu công khai; API key được nhập qua cấu hình server bảo mật, không dán trong chat/Git. Không dùng key/phiên Testnet thay thế.

[Biểu phí Circle](https://help.circle.com/support/en/developer-services-product-fee-schedule?id=kb_article_view&sysparm_article=KB0010546) công bố 1.000 monthly active wallets đầu miễn phí mỗi tháng. Bậc 1.001–5.000 có giá $0,038/ví cho Signing API Only hoặc $0,050/ví cho All Included, theo gói/mạng thực tế được cấp cho tài khoản. MAW tính theo địa chỉ ví có hoạt động đủ điều kiện, gồm tạo ví, gửi/nhận hoặc ký; không đồng nghĩa số người mở trang. Tài khoản có điều khoản riêng có thể có mức khác.

Thẻ ở mục Billing dùng thanh toán dịch vụ phát sinh; không phải tự động mua USDC cho người dùng. Phí Circle Wallets được tính theo sử dụng và lập hóa đơn; không nên hiểu thêm thẻ là toàn bộ dịch vụ và gas sẽ miễn phí. Kiểm tra mức phí/điều khoản thể hiện trong Console trước khi lưu. Nếu bật Gas Station, đây là dịch vụ trả gas thay người dùng: biểu phí hiện công bố gas thực tế cộng 5% phí nền tảng và thuế áp dụng. Chưa có phạm vi bật tài trợ gas trong đợt này.

## Các bước cấu hình Circle Mainnet

1. Đăng nhập [Circle Console](https://console.circle.com/) bằng tài khoản Administrator. Yêu cầu mở Mainnet và hoàn thành Billing/xét duyệt đang hiển thị; chờ trạng thái được cấp Mainnet theo [FAQ Wallets](https://help.circle.com/support/en/circle-wallets-faqs?id=kb_article_view&sysparm_article=KB0010611).
2. Trong môi trường Mainnet: `Wallets → User Controlled → Configurator → Authentication Methods → Email`. Cấu hình địa chỉ gửi và SMTP production của anh; dùng thông tin gửi mail thật, rồi sao chép App ID tại Configurator. [Tài liệu cấu hình Email OTP](https://developers.circle.com/wallets/user-controlled/build-a-wallet-app).
3. Tạo API key khi đang ở Mainnet theo đường dẫn tài liệu: `Keys → Create a key → API key → Standard Key`. Key được giữ riêng để cấu hình backend Mainnet; App ID dùng cho frontend. Ứng dụng đã chọn mã mạng `ARC` theo manifest.
4. Gửi App ID công khai và trạng thái Mainnet/SMTP. Không gửi API key, mật khẩu SMTP, OTP hoặc thông tin thẻ trong chat. Những secret được nhập riêng vào cấu hình dịch vụ đúng môi trường.

Email OTP của Circle cần SMTP được cấu hình trong Circle; SMTP thông báo của backend GroupDeal là cấu hình riêng. [Mô tả cơ chế xác thực](https://developers.circle.com/wallets/user-controlled/authentication-methods).

## Cấu hình đã nhận ngày 02/11/2026

- Chủ tài khoản xác nhận Circle Mainnet đã bật và SMTP Email OTP đã cấu hình. Đây là trạng thái do người dùng cung cấp, chưa phải kết quả đăng nhập/OTP thật được xác minh.
- Circle App ID công khai: `2ee19943-ce4c-59a0-958b-3814cfdeb215`.
- Reown Project ID công khai: `b40cf0b4a742fcc69708d59a34765a50`.
- Hai ID được lưu tại `shared/mainnet-public.json`, dùng mặc định chỉ trong môi trường Mainnet khi build trực tiếp từ GitHub. Giá trị `VITE_CIRCLE_APP_ID`/`VITE_REOWN_PROJECT_ID` được truyền tường minh sẽ ghi đè, kể cả giá trị rỗng để fixture tắt provider. `build:mainnet` dùng ID công khai này và kiểm tra chúng có trong artifact.
- API key Circle Mainnet đã được lưu mã hóa local và GET cấu hình/App ID xác minh thành công ngày 03/11; chưa cấu hình runtime VPS. Chủ tài khoản xác nhận Reown đã cho phép origin `https://groupdeal.tech` (USER_REPORTED); đăng nhập ví thực tế vẫn cần xác minh.

Người dùng đã xác nhận có API key Mainnet và khóa signer riêng. Hướng dẫn nhập ẩn, lưu kho mã hóa local và kiểm tra không lộ giá trị ở `docs/mainnet-secret-setup.md`. Đây là staging local, chưa phải cấu hình backend trên VPS hoặc bằng chứng OTP/login thật.

Ngày 03/11 đã nhập và verify-only lại: signer khớp manifest, Circle key và app secrets được lưu trong kho mã hóa local; vault không đổi. Người dùng chọn cùng tài khoản SMTP của Circle cho thông báo backend. Cấu hình SMTP được nhập vào kho riêng bằng công cụ trong hướng dẫn trên; không tự sao chép credential Testnet hoặc đọc mật khẩu từ Circle Console.

Circle read-only probe đã thành công bằng LIVE key: API chấp nhận GET cấu hình và App ID khớp ứng dụng đã chốt. Đây chưa phải bằng chứng OTP/login hoặc giao dịch ví Arc đã hoạt động; các phần đó vẫn chờ nghiệm thu theo checklist.

SMTP backend đã qua kiểm tra TLS/login và lưu mã hóa riêng, không đổi core vault; chưa gửi email thật. Bước này không thay thế nghiệm thu OTP của Circle hoặc email thông báo đã đến người nhận.

Danh sách token Mainnet dùng Universal Blockscout API (backend-only key); số dư được đọc lại từ Arc RPC. [Gói Free hiện có 100K credits/ngày, 5 request/giây, không cần thẻ](https://docs.blockscout.com/devs/blockscout-api). Đây là credits, không phải 100K lượt gọi: theo [bảng credits](https://docs.blockscout.com/devs/blockscout-api-responses-and-routes), endpoint không liệt kê riêng mặc định tốn 20 credits/lượt, hết hạn mức Free sẽ từ chối request đến lần reset. Không tự nâng gói hoặc thanh toán. Ngày 03/11 người dùng xác nhận đã thu hồi key gửi chat và nhập key mới qua ô ẩn; GET token được chấp nhận và ba vault verify không đổi. Nghiệm thu danh sách nhiều trang/số dư ví thật chưa thực hiện.

## Hạn mức deploy/gas

Deploy là đưa bytecode contract lên Arc. Tạo Safe, deploy Hub và thay đổi cấu hình trên chain đều có thể phát sinh gas. [Arc dùng USDC để trả gas](https://docs.arc.io/arc/references/gas-and-fees), cùng tài sản USDC có giao diện ERC-20; không cộng hai cách biểu diễn thành hai số dư.

Phí thực tế = gas đã dùng × giá gas thực tế. Trần dự phòng của một giao dịch = gasLimit × maxFeePerGas. Hạn mức toàn đợt là tổng tiền chủ dự án cho phép chi, ngăn retry hoặc cấu hình phí tiêu vượt dự kiến. Nó không phải khoản phí cố định bị thu trọn.

Ví dụ minh họa: 4.000.000 gas × 25 Gwei = 0,1 USDC. Đây không phải estimate cho deployment GroupDeal. Sau khi chốt version/địa chỉ/constructor sẽ đọc RPC và estimate cho từng transaction cụ thể, thêm biên dự phòng rồi xin ký.

Hạn mức đã chốt ngày 03/11 là **0,02 USDC riêng cho một giao dịch tạo Safe**; Safe đã finalized với chi phí thực 0,00545701376025 USDC. Scope đã đóng, không chuyển phần dư sang Hub. Ngân sách deploy Hub V2 và các thao tác sau cần quote/phạm vi riêng; đề xuất tổng quát trước đây không phải quyền chi tiền. Phí bridge, Circle, tiền mua deal và vận hành dài hạn được chốt riêng. Vượt trần không tự retry hoặc tăng ngân sách.

## Các quyền trong GroupDeal

| Quyền | Công việc trong mã hiện tại | Cách chọn |
|---|---|---|
| Deployer | Ký giao dịch tạo Hub; constructor đặt owner ban đầu là địa chỉ deploy | Tài khoản riêng cho dự án, anh giữ quyền ký; chỉ nạp lượng USDC theo estimate |
| Owner của Hub | Đổi authorization signer/operator; cũng có một số quyền vận hành theo contract | Khóa quản trị được bảo vệ kỹ, không đưa lên VPS; ban đầu có thể là chính deployer |
| Authorization signer | Backend ký giấy phép mua EIP-712 để Hub kiểm tra người mua/giới hạn/nonce/hạn dùng | Khóa riêng cho backend, tách ví giữ tài sản; chữ ký này tự nó là off-chain |
| Operator | Vận hành các hành động được contract cho phép, như ghi nhận giao hàng và giải quyết tranh chấp | Ví vận hành riêng; giữ USDC đủ gas, giới hạn quyền truy cập |
| Security Safe | Địa chỉ multisig giữ securityAuthority, có quyền hủy chiến dịch khẩn cấp và chuyển quyền bảo mật theo quy trình | Safe thực sự trên Arc Mainnet, xác minh code/version/owners/threshold |
| Owners của Safe | Các ví thành viên phê duyệt hành động của Safe | Chọn khóa/người giữ độc lập, ví dụ 2 trong 3 chữ ký |

Owner của Hub và owners của Safe là hai khái niệm khác nhau. [Safe lưu danh sách owners và threshold](https://docs.safe.global/advanced/smart-account-concepts): 2/3 nghĩa là cần bất kỳ hai trong ba thành viên đồng ý. Một ví có thể vừa là ví quản trị của anh vừa là một thành viên Safe nếu chính sách cho phép; số role không bắt buộc bằng số người.

Bản chuẩn bị Mainnet hiện yêu cầu bốn địa chỉ role owner/signer/operator/securityAuthority khác nhau; securityAuthority là Safe có ít nhất hai owners và threshold ít nhất hai. Đây là cấu hình bảo vệ của bản GroupDeal hiện tại, không phải quy tắc bắt buộc chung của mọi blockchain. Gộp role sẽ cần xem xét lại kiến trúc và thay guard có chủ đích; không tự bỏ guard chỉ để deploy nhanh.

Ngày 02/11 anh cung cấp `0xe48b30ea70f77e5fa6311471c2e9687f8a701ead` và yêu cầu dùng chung cho mọi role. Địa chỉ này đã được ghi làm owner/deployer. Với V2 đã chọn, không thể điền cùng địa chỉ cho mọi role rồi deploy: constructor trực tiếp cấm securityAuthority trùng operator. Địa chỉ ví công khai cũng chưa chứng minh đó là Safe có owners/threshold cần thiết.

Signer hiện là khóa backend dùng để ký giấy phép mua tự động. Nếu dùng cùng ví quản trị, khóa có quyền quản trị cũng phải được cơ chế ký trên server sử dụng. Kết nối ví của anh ở trình duyệt không cung cấp khả năng tự ký này. Đề xuất giữ ví đã gửi để quản trị/deploy, chọn signer và operator riêng, cùng Safe cho quyền bảo mật; anh có thể quản lý các tài khoản này, không bắt buộc mỗi role là một người khác nhau. Phương án một địa chỉ cần một thay đổi contract và thiết kế ký riêng trước khi có thể chuẩn bị deployment hợp lệ.

Các quyền có thể chuyển sau triển khai: owner gọi `setAuthorizedSigner`, `setOperatorAddress` hoặc `transferOwnership`; securityAuthority cũ khởi tạo chuyển quyền, rồi authority mới chấp nhận. Việc chuyển cần giao dịch và cập nhật/xác minh cấu hình ứng dụng tương ứng, không phải chỉ sửa file env.

Sau đó anh chốt làm contract và preview Studio trước, cung cấp thêm ví bảo mật `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c`. Vì vậy có thể chuẩn bị deployment V2 nguyên bản với owner/signer/operator là ví đầu và securityAuthority là ví thứ hai. Chưa cần cấu hình khóa signer backend hoặc Safe để encode constructor này. Các yêu cầu bốn role độc lập và Safe vẫn áp dụng trước khi mở ứng dụng production, không phải điều kiện cú pháp của constructor. Plan ban đầu ở `config/mainnet-contract-deployment.json`; hướng dẫn Studio ở `docs/arc-studio-handoff.md`.

## Có dùng ví chính để deploy không?

Ví chính có thể ký deploy về mặt kỹ thuật. Đề xuất cho GroupDeal: tạo tài khoản quản trị/deploy riêng, ưu tiên ví cứng hoặc cách lưu khóa có bảo vệ; giữ tài sản cá nhân lớn trong ví chính. Chỉ nạp ví deploy theo ngân sách đã duyệt. Tách riêng khóa signer/operator dùng cho server, không đưa seed/private key của ví chính lên VPS.

Ví chính có thể làm nguồn cấp USDC hoặc một owner Safe do anh tự ký. Hai tài khoản sinh từ cùng seed vẫn có chung điểm rủi ro nếu seed lộ; multisig có ý nghĩa hơn khi các khóa được giữ độc lập. Chỉ cần gửi địa chỉ công khai để chuẩn bị constructor và giao dịch chưa ký.

## Đầu vào còn cần

- V2 đã được chọn. Chính sách early rebate được chốt khi tạo campaign; chưa tự bật hoặc tạo campaign.
- Đã đủ bốn role riêng: owner/deployer `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead`, operator `0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c`, signer `0xc9691f85f149e71C4e1C14c6E6204128546Eef17`, securityAuthority là [Safe 2/2 đã finalized](https://explorer.arc.io/address/0x1d4a6c23d9FC7A1Ca05Ecdf4efD0dF750D804B99). Signer/Circle/SMTP/indexer đã staging/verify local; chưa export vào VPS. Hub chưa deploy nên runtime vẫn UNDEPLOYED. Production constructor mới ở `config/mainnet-hub-deployment.json`; không dùng plan all-one-wallet lịch sử.
- Trạng thái Circle Mainnet, App ID production, Reown project/origin; chủ tài khoản tự xử lý Billing/xét duyệt và cấu hình secret an toàn.
- Trần chi phí được duyệt sau estimate, người giữ ví funding và người ký từng transaction.
- Nguồn indexer token Mainnet dùng được từ server: endpoint công khai explorer hiện trả HTTP 403/trang xác minh trên cả máy local và VPS. Mã tự tìm token đã có phân trang và fallback nhập contract; chưa thể nghiệm thu tự liệt kê đầy đủ trên dữ liệu Mainnet thật.
