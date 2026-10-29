# Các quyết định chủ dự án cần chuẩn bị trước Mainnet

Cập nhật 29/10/2026. Tài liệu giải thích các mục trong checklist; không cấp quyền ký, nạp tiền, thêm thẻ hoặc deploy.

## Circle production và thanh toán

Circle production là môi trường Mainnet của dịch vụ Circle Wallets dùng cho đăng nhập email và ví trong ứng dụng. GroupDeal đang dùng ví user-controlled: người dùng tự phê duyệt xác thực/giao dịch. Việc bật production không thay đổi contract V1/V2 và không tự deploy GroupDeal. Ví ngoài kết nối qua Reown là một luồng khác.

Theo [FAQ Circle Wallets](https://help.circle.com/support/en/circle-wallets-faqs?id=kb_article_view&sysparm_article=KB0010611), chuyển từ Testnet sang Mainnet cần thông tin thanh toán và bước xét duyệt tuân thủ. Chủ tài khoản cần hoàn thành những bước Console đang yêu cầu, kiểm tra quyền sử dụng User-controlled Wallets trên Arc, thiết lập ứng dụng/đăng nhập email cho domain `groupdeal.tech`, rồi tạo cấu hình Mainnet tương ứng. Chỉ cung cấp App ID/tham chiếu công khai; API key được nhập qua cấu hình server bảo mật, không dán trong chat/Git. Không dùng key/phiên Testnet thay thế.

[Biểu phí Circle](https://help.circle.com/support/en/developer-services-product-fee-schedule?id=kb_article_view&sysparm_article=KB0010546) công bố 1.000 monthly active wallets đầu miễn phí mỗi tháng. Bậc 1.001–5.000 có giá $0,038/ví cho Signing API Only hoặc $0,050/ví cho All Included, theo gói/mạng thực tế được cấp cho tài khoản. MAW tính theo địa chỉ ví có hoạt động đủ điều kiện, gồm tạo ví, gửi/nhận hoặc ký; không đồng nghĩa số người mở trang. Tài khoản có điều khoản riêng có thể có mức khác.

Thẻ ở mục Billing dùng thanh toán dịch vụ phát sinh; không phải tự động mua USDC cho người dùng. Phí Circle Wallets được tính theo sử dụng và lập hóa đơn; không nên hiểu thêm thẻ là toàn bộ dịch vụ và gas sẽ miễn phí. Kiểm tra mức phí/điều khoản thể hiện trong Console trước khi lưu. Nếu bật Gas Station, đây là dịch vụ trả gas thay người dùng: biểu phí hiện công bố gas thực tế cộng 5% phí nền tảng và thuế áp dụng. Chưa có phạm vi bật tài trợ gas trong đợt này.

## Hạn mức deploy/gas

Deploy là đưa bytecode contract lên Arc. Tạo Safe, deploy Hub và thay đổi cấu hình trên chain đều có thể phát sinh gas. [Arc dùng USDC để trả gas](https://docs.arc.io/arc/references/gas-and-fees), cùng tài sản USDC có giao diện ERC-20; không cộng hai cách biểu diễn thành hai số dư.

Phí thực tế = gas đã dùng × giá gas thực tế. Trần dự phòng của một giao dịch = gasLimit × maxFeePerGas. Hạn mức toàn đợt là tổng tiền chủ dự án cho phép chi, ngăn retry hoặc cấu hình phí tiêu vượt dự kiến. Nó không phải khoản phí cố định bị thu trọn.

Ví dụ minh họa: 4.000.000 gas × 25 Gwei = 0,1 USDC. Đây không phải estimate cho deployment GroupDeal. Sau khi chốt version/địa chỉ/constructor sẽ đọc RPC và estimate cho từng transaction cụ thể, thêm biên dự phòng rồi xin ký.

Đề xuất ban đầu để thảo luận: trần **10 USDC cho gas của đợt tạo Safe, deploy Hub và cấu hình ban đầu**, xem lại nếu estimate cụ thể vượt trần. Chưa đề nghị nạp tiền ngay. Phí bridge, dịch vụ Circle, tiền mua deal và ngân sách vận hành dài hạn nằm ngoài trần này. Vượt trần cần phạm vi chi mới; không tự retry để tiêu thêm.

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

## Có dùng ví chính để deploy không?

Ví chính có thể ký deploy về mặt kỹ thuật. Đề xuất cho GroupDeal: tạo tài khoản quản trị/deploy riêng, ưu tiên ví cứng hoặc cách lưu khóa có bảo vệ; giữ tài sản cá nhân lớn trong ví chính. Chỉ nạp ví deploy theo ngân sách đã duyệt. Tách riêng khóa signer/operator dùng cho server, không đưa seed/private key của ví chính lên VPS.

Ví chính có thể làm nguồn cấp USDC hoặc một owner Safe do anh tự ký. Hai tài khoản sinh từ cùng seed vẫn có chung điểm rủi ro nếu seed lộ; multisig có ý nghĩa hơn khi các khóa được giữ độc lập. Chỉ cần gửi địa chỉ công khai để chuẩn bị constructor và giao dịch chưa ký.

## Đầu vào còn cần

- Chọn V1/V2 và chốt có bật early rebate ngay không.
- Địa chỉ deployer/owner, authorization signer, operator; địa chỉ Safe đã có trên Arc hoặc danh sách owners và threshold để chuẩn bị tạo Safe.
- Trạng thái Circle Mainnet, App ID production, Reown project/origin; chủ tài khoản tự xử lý Billing/xét duyệt và cấu hình secret an toàn.
- Trần chi phí được duyệt sau estimate, người giữ ví funding và người ký từng transaction.
- Nguồn indexer token Mainnet dùng được từ server: endpoint công khai explorer hiện trả HTTP 403/trang xác minh trên cả máy local và VPS. Mã tự tìm token đã có phân trang và fallback nhập contract; chưa thể nghiệm thu tự liệt kê đầy đủ trên dữ liệu Mainnet thật.
