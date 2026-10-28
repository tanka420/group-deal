# Triển khai subdomain Testnet ngày 28/10/2026

## Kết quả

- Testnet đã phục vụ tại **https://testnet.groupdeal.tech**. DNS A trỏ `13.212.35.217`, TTL quan sát 14400.
- HTTPS dùng chứng chỉ riêng cho subdomain, hết hạn ngày 26/01/2027; renewal hook hỗ trợ subdomain mới.
- Commit cấu hình vận hành đã kích hoạt: `31ae9920dbde2e8490b8f524ffafede07dbc622d`.
- Backend Testnet giữ nguồn `8c32212fdb051cdb01f98226932f3a61afa3e9bf`, port `18420`; frontend giữ public release directory hiện hành. Không deploy nguồn ứng dụng Mainnet vào Testnet.
- Native database vẫn đúng thư mục cũ; không sao chép/reset DB. 95 held được giữ. Không phát giao dịch hoặc replay hành trình.
- Chỉ đổi `PUBLIC_APP_URL`, `ALLOWED_ORIGINS` và guard origin trong launcher. Hash phần private environment loại hai biến origin không đổi; không ghi credential vào tài liệu/Git.
- Health probe và alert selector đã cùng chuyển sang subdomain; alert state được giữ. Timer probe, alerts, local backup, offhost backup đều active; probe báo UP cùng backup/offhost hiện hành. Không gửi email thử.

Lượt đầu đã rollback khi HTTPS được kiểm ngay sau graceful reload còn trả certificate từ worker cũ. Bản `31ae992` thiết lập và đợi TLS trước khi đổi origin; activation sau đó thành công. Private rollback và receipt đầy đủ chỉ lưu trên VPS, không nhập Git.

## Phạm vi xác nhận

Kiểm triển khai đã đạt: Nginx configuration, HTTP 301 giữ path, HTTPS 200, `/api/health` trả chain `5042002` và đúng Testnet Hub, CORS trả đúng origin subdomain, cùng đường database/held/source, secret ngoài origin và các timer được giữ. Đây là xác nhận triển khai/liveness, không phải kiểm tài chính hoặc một hành trình ký mới.

Theo yêu cầu người dùng, bộ test ứng dụng, đăng nhập Circle thực và hành trình ví được ghi **SKIP_USER_REQUEST**. Circle/Reown/OAuth có thể cần chủ tài khoản cập nhật domain allowlist/callback sang subdomain; chưa tự thay credential hoặc project provider.

## Apex và Mainnet còn lại

**`groupdeal.tech` hiện vẫn phục vụ Testnet trong giai đoạn chuyển tiếp; chưa phải Mainnet.** Người dùng muốn Mainnet đầy đủ, không chọn thay apex bằng trang “đang chuẩn bị”, nên vhost apex chưa thay đổi.

Testnet tạm cho phép đúng `https://testnet.groupdeal.tech` và apex cũ để duy trì đường truy cập cũ. Khi Mainnet đầy đủ được kích hoạt tại apex, phải bỏ apex khỏi allowlist Testnet, dùng cấu hình/DB/session/key Mainnet riêng theo phạm vi đã chốt, và đổi redirect hostname Testnet cũ về subdomain.

Mainnet vẫn `UNDEPLOYED`. Còn chờ chốt version và bộ địa chỉ owner/deployer, authorization signer, operator, Safe; cấu hình Circle production phù hợp; chuẩn bị transaction cụ thể với nonce/phí/ngân sách rồi nhận chữ ký, xác minh receipt/runtime/roles trước khi bật backend Mainnet. Quyền deploy domain/service không thay cho các đầu vào hoặc chữ ký chưa có.
