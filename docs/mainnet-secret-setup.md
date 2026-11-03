# Nhập cấu hình bí mật Mainnet trên Windows

Đây là bước chuẩn bị local, không cấu hình dịch vụ live hoặc triển khai VPS. Người dùng đã xác nhận có Circle Mainnet API key và private key của signer. Không nhập chúng vào chat, file source hoặc file mẫu được Git theo dõi.

## Cách nhập

Chạy bằng tài khoản Windows của người giữ khóa:

```powershell
powershell.exe -NoLogo -NoProfile -File E:\apps\group-deal-mainnet\scripts\initialize_mainnet_secrets.ps1
```

Công cụ mở hai lượt `Read-Host -AsSecureString`, không hiển thị giá trị đã nhập:

1. `CIRCLE_API_KEY`: API key thuộc môi trường Mainnet trong Circle Console.
2. `AUTHORIZED_SIGNER_PRIVATE_KEY`: khóa của `0xc9691f85f149e71C4e1C14c6E6204128546Eef17`.

Validator local suy ra địa chỉ từ khóa và so với manifest; không ký message/transaction, gọi Circle/RPC hoặc khởi động backend. Key không được truyền qua dòng lệnh, biến môi trường, log hoặc file plaintext. Validator chỉ nhận stdin và trả metadata đã lọc. Key Circle chỉ được kiểm định dạng/loại bỏ một số đầu vào Testnet rõ ràng; chưa xác minh key có quyền Mainnet, thuộc đúng App ID hoặc dùng được với dịch vụ thật.

Sau khi hai đầu vào hợp lệ, công cụ tạo riêng `JWT_SECRET`, `CAMPAIGN_IDENTITY_SECRET` và `MASTER_ENCRYPTION_KEY`, mỗi giá trị 32 byte ngẫu nhiên; không tạo ví/signing key mới và không dùng secret Testnet. Tất cả được mã hóa bằng Windows DPAPI [CurrentUser](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope) tại `.cache/mainnet-private/secrets.dpapi.json`. Thư mục chỉ cấp quyền cho tài khoản Windows đang chạy, SYSTEM và Administrators; đường dẫn `.cache` được Git bỏ qua. Kho này phụ thuộc tài khoản Windows/máy, không phải file env để chép trực tiếp sang Linux/VPS. Việc tạo cấu hình runtime cho VPS được xử lý ở bước riêng.

Khi có kho sẵn, công cụ xác minh lại mà không thay khóa hoặc tạo mới app secrets. Đổi signer context sẽ bị từ chối; không tự ghi đè hoặc xoay master key. Lỗi chỉ xuất mã/phase/type/số dòng, không in nội dung exception; cửa sổ lỗi tự đóng. Hủy cửa sổ trước khi lưu sẽ không tạo runtime hoạt động.

## Kiểm tra lại

```powershell
powershell.exe -NoLogo -NoProfile -File E:\apps\group-deal-mainnet\scripts\initialize_mainnet_secrets.ps1 -VerifyOnly
```

Chỉ đọc metadata tại `.cache/mainnet-secret-input/<run>/STATUS.json` để báo tiến độ; không in hoặc mở nội dung khóa/kho đã giải mã trong chat. `LOCAL_SECRETS_STAGED` nghĩa là đã lưu/xác minh local, chưa phải Circle authentication hoặc backend production đã hoạt động. Source commit, signer đã khớp và các cờ live/activation được ghi riêng.

SMTP Email OTP trong Circle khác SMTP thông báo của backend. Các đầu vào SMTP backend, Safe/Hub thật, manifest, backup/monitoring và nghiệm thu live vẫn phải hoàn tất theo checklist.

## Kiểm tra Circle bằng GET và nhập SMTP

Ngày 03/11 đã xác minh kho local thật: signer khớp, app secrets hiện diện, verify-only không làm đổi vault. Để kiểm quyền đọc cấu hình Circle và App ID đúng với bản Mainnet:

```powershell
powershell.exe -NoLogo -NoProfile -File E:\apps\group-deal-mainnet\scripts\initialize_mainnet_secrets.ps1 -VerifyOnly -CheckCircle
```

Chế độ này chỉ gửi Circle API key tới GET cố định `https://api.circle.com/v1/w3s/config/entity`, không gửi khóa signer ra ngoài. Full key phải có prefix `LIVE_API_KEY` theo [Circle](https://developers.circle.com/api-reference/keys). HTTP 200/App ID khớp là bằng chứng quyền đọc cấu hình; không chứng minh OTP hoặc giao dịch ví Arc đã hoạt động. Không tạo entity secret/user/wallet/subscription.

Người dùng chọn dùng cùng tài khoản SMTP như trong Circle. Nhập cấu hình riêng của backend bằng:

```powershell
powershell.exe -NoLogo -NoProfile -File E:\apps\group-deal-mainnet\scripts\configure_mainnet_smtp.ps1
```

Nhập hostname, port 465 hoặc 587 (mặc định 587), username, email gửi (để trống dùng username) và mật khẩu ẩn. Dùng đúng thông tin provider đã cấu hình trong Circle. Cửa sổ chỉ kiểm kết nối TLS và đăng nhập qua Nodemailer `verify()`, không gửi email; TLS/certificate verification được giữ. Theo [Nodemailer](https://nodemailer.com/smtp), việc verify không đảm bảo server sẽ chấp nhận email gửi bằng địa chỉ From đã chọn.

SMTP lưu mã hóa riêng ở `.cache/mainnet-private/smtp.dpapi.json`; kho `secrets.dpapi.json` không thay đổi. Có vault sẵn thì chỉ xác minh, không ghi đè. `configure_mainnet_smtp.ps1 -VerifyOnly` chỉ kiểm format local, không kết nối server. Metadata nằm tại `.cache/mainnet-smtp-input/<run>/STATUS.json`; không in password hoặc nội dung vault. Các test SMTP dùng transport mock, chưa phải bằng chứng email thật đã gửi/nhận.

## Kiểm chứng công cụ

```text
node --test scripts/validate_mainnet_secret_input.test.cjs
powershell.exe -NoLogo -NoProfile -File scripts/initialize_mainnet_secrets.test.ps1
```

Test dùng khóa ngẫu nhiên mới và cây fixture riêng trong `.cache/mainnet-secret-tests/`; không dùng secret, ví hoặc DB của người dùng. Kiểm Node bao gồm key sai, role trùng, sai môi trường, input lỗi/quá lớn và không echo secret ra stdout/stderr. Fixture PowerShell kiểm đường nhập, DPAPI roundtrip, ACL riêng, app secrets khác nhau, không có plaintext trong vault/status, verify không ghi đè và từ chối signer context đã đổi. Đây không phải bằng chứng credential production hoặc full CI.
