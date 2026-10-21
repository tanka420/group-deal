# Sau CONNECTED / Worker READY

Đã kiểm chỉ đọc lúc13:59ngày21/10: subscription seller24F khớp endpoint, Worker200/READY, hai secret binding có mặt, inbox0event và95jobheld giữ. Không cần copy secret hoặc Allow Cloudflare lại. Chưa có event thật để xác minh hai bên dùng cùng HMACsecret.

Provider CSV Studio đã có mã nguồn và16kiểm tra local đạt. **Chưa deploy bản provider, chưa cấp quyền thật**; Worker hiện tại vẫn chỉ nhận inbox. Bản provider mặc định tắt, chỉ bật cho một campaign UAT mới sau khi đọc đúng ID/Hub và xác nhận chưa có đơn. Không bật cho toàn bộ seller hoặc campaign đã chạy.

## Bước cần phiên seller: lưu một sản phẩm mới ở dạng nháp

Công cụ browser trong chat đang bị tắt ở Work settings. Bước lưu cần thực hiện trong phiên seller đang mở; không cần đăng nhập lại nếu phiên còn dùng được. Đây là lưu metadata, chưa tạo giao dịch hoặc phí mạng.

Mở https://groupdeal.tech/seller/products → **Tạo sản phẩm**. Tạo mới, không sửa hai sản phẩm cũ hoặc hồ sơ quyền UAT đã thu hồi. Dùng các giá trị dưới đây, rồi bấm **Lưu phiên bản** một lần.

| Trường | Giá trị |
|---|---|
| Tên sản phẩm | GroupDeal CSV Studio 1.0 — Webhook UAT 21-10-2026 |
| Nhà cung cấp | GroupDeal Testnet Lab |
| Danh mục | Productivity |
| Edition / gói license | Personal 1.0 — Webhook UAT |
| Seat mỗi đơn vị | 1 |
| Thời hạn sử dụng | Để trống |
| Hạn kích hoạt sau giao hàng | Để trống; cửa sổ tải được mô tả riêng trong điều khoản |
| Vùng áp dụng | Worldwide |
| Số ngày hỗ trợ | 0 |
| Phạm vi sử dụng | Cá nhân |
| Cho phép chuyển nhượng | Không chọn |
| Ảnh đại diện | https://placehold.co/960x540/0866e8/ffffff.png?text=GroupDeal%20CSV%20Studio |

**Mô tả sản phẩm**

Công cụ xem, lọc và xuất CSV UTF-8 chạy offline bằng Chrome hoặc Edge. Gói gồm HTML, hướng dẫn, điều khoản và CSV minh họa. Provider Cloudflare nhận order.committed có chữ ký từ GroupDeal để cấp đường dẫn ZIP riêng cho đơn. Seller giao đường dẫn trong nội dung mã hóa của GroupDeal sau khi xác minh giao hàng onchain. Đây là sản phẩm UAT riêng trên Arc Testnet.

**Yêu cầu / tương thích** (mỗi dòng một mục)

```text
Chrome hoặc Edge hiện hành
CSV UTF-8; tối đa 5 MB, 25.000 dòng, 128 cột, 250.000 ô
```

**Chính sách hỗ trợ**

Sản phẩm mẫu Arc Testnet; không cam kết SLA hoặc hỗ trợ có thời hạn. Báo lỗi qua kênh hỗ trợ GroupDeal.

**Điều khoản sử dụng license**

Một người mỗi đơn vị, dùng cá nhân bản1.0đã tải lâu dài. Provider cấp đường dẫn tải riêng có hiệu lực30ngày kể từ lúc cấp theo order.committed; không chia sẻ đường dẫn hoặc phân phối lại gói. Công cụ đã tải chạy offline, không có DRM hoặc bước nhập LICENSE_KEY. Quyền tài chính, tranh chấp và claim của order được xử lý riêng trên GroupDeal; cửa sổ tải không hạn chế các quyền này. Đây là mẫu UAT Arc Testnet, chưa dành cho Mainnet. Áp dụng LICENSE.txt trong gói.

Khi đã thấy tên mới trong danh sách, báo **“Đã lưu bản nháp Webhook UAT”**. Agent sẽ đọc ID/tuple từ metadata. Không cần gửi token, secret hoặc ký ví ở bước này. Chưa gửi hồ sơ quyền, publish hoặc mua đơn tại bước này; agent chuẩn bị đúng tuple tiếp theo.

File JSON đầy đủ cùng nội dung: `samples/webhook-csv-studio/PRODUCT_INPUT.json` tại checkout nguồn sạch.

## Trình tự sau bản nháp

Agent chuẩn bị hồ sơ quyền riêng cho ProductVersion/LicenseVersion mới; operator tự quyết định và tự ký. Sau đó tạo draft campaign WEBHOOK riêng, đọc ID/Hub và xác minh chưa có order để áp migration0002/deploy/gắn provider. Khi campaign/provider sẵn sàng mới chốt ngân sách một order UAT mới trước khi tạo intent hoặc ký. Giữ Workers Free; không nâng gói hoặc tạo billing subscription. Phí mạng Arc Testnet nếu cần được duyệt riêng.

Webhook order.committed hợp lệ tạo một grant theo subscription+order, chứa số seat, token ngẫu nhiên256bit và expiry30ngày. Grant và inbox bền trong D1. Gửi lặp không thay token/expiry hoặc kích hoạt lại grant đã thu hồi. Sai campaign/buyer/chain/Hub/quantity không tạo quyền. Lỗi cấp grant/cập nhật inbox trả503để producer retry. Không lưu body/signature/token vào log hoặc bằng chứng.

Đường dẫn tải là bearer secret. Helper riêng sẽ cho chính chủ lấy URL trong terminal để seller giao qua nội dung mã hóa của GroupDeal; không đưa URL vào chat/bằng chứng. Provider không giữ khóa ví/APPsession hoặc tự recordDelivery/claim. Buyer tải ZIP thật, mở HTML và dùng CSV; agent đối chiếu event/job/grant/hash và receipt. HTTP202/localPASS chưa chứng minh giao hàng thật. Retry/DLQ producer chỉ thử trên job mới. Chưa có tự động hóa lifecycle tài chính/revocation Mainnet.

NOT_FROZEN / G5 OPEN / G6 OPEN / acceptanceEligible=false / wholeProjectAccepted=false.
