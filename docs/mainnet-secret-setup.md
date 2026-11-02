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

## Kiểm chứng công cụ

```text
node --test scripts/validate_mainnet_secret_input.test.cjs
powershell.exe -NoLogo -NoProfile -File scripts/initialize_mainnet_secrets.test.ps1
```

Test dùng khóa ngẫu nhiên mới và cây fixture riêng trong `.cache/mainnet-secret-tests/`; không dùng secret, ví hoặc DB của người dùng. Kiểm Node bao gồm key sai, role trùng, sai môi trường, input lỗi/quá lớn và không echo secret ra stdout/stderr. Fixture PowerShell kiểm đường nhập, DPAPI roundtrip, ACL riêng, app secrets khác nhau, không có plaintext trong vault/status, verify không ghi đè và từ chối signer context đã đổi. Đây không phải bằng chứng credential production hoặc full CI.
