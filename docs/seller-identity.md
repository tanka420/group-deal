# Username và liên kết xã hội

Username được lưu riêng khỏi hồ sơ payout có chữ ký. Seller chọn một lần, 3–30 ký tự thường/số/`_`, bắt đầu bằng chữ; tên hệ thống được giữ riêng. Server chuẩn hóa chữ thường và giữ duy nhất trong giao dịch SQLite. Deal mới cần username trước khi chuẩn bị xuất bản; các intent đã tạo và nghĩa vụ của đơn cũ vẫn phục hồi như trước.

Tại `/seller/profile`, seller chọn username rồi xác thực GitHub, X hoặc Discord. URL tự nhập không được dùng như bằng chứng sở hữu. OAuth authorization code dùng PKCE S256 và state ngẫu nhiên có hạn 5 phút, buộc đúng user, phiên, origin, provider và revision. Verifier được mã hóa trong DB; access token chỉ dùng trong lần gọi provider, không lưu vào DB/trình duyệt. Callback lỗi không tự đổi code lần nữa. Sau lỗi mạng, tải lại định danh để xem kết quả trước khi xác thực lại.

Mỗi stable provider ID chỉ thuộc một tài khoản GroupDeal. Đổi tên ở provider được cập nhật khi xác thực lại cùng ID. Muốn đổi tài khoản cùng provider phải ngắt trước. Ngắt liên kết cần xác nhận, bỏ URL công khai và làm callback đang chờ mất hiệu lực. Nó không tự thu hồi ứng dụng trong trang quản lý quyền của provider; người dùng có thể thu hồi tại provider.

## Cấu hình trên VPS

Tạo ba OAuth application riêng; không dùng callback wildcard. Homepage: `https://groupdeal.thanhtan.top`. Callback chính xác cho cả ba: `https://groupdeal.thanhtan.top/seller/profile`.

| Provider | Loại ứng dụng / quyền | Biến private ở backend |
|---|---|---|
| GitHub | OAuth App; `read:user` | `GROUPDEAL_SOCIAL_GITHUB_CLIENT_ID`, `GROUPDEAL_SOCIAL_GITHUB_CLIENT_SECRET` |
| X | Web App, confidential OAuth 2.0; `users.read tweet.read` | `GROUPDEAL_SOCIAL_X_CLIENT_ID`, `GROUPDEAL_SOCIAL_X_CLIENT_SECRET` |
| Discord | OAuth2 application; `identify` | `GROUPDEAL_SOCIAL_DISCORD_CLIENT_ID`, `GROUPDEAL_SOCIAL_DISCORD_CLIENT_SECRET` |

Đặt cặp ID/secret trực tiếp vào private `backend/.env` của runtime bằng SSH/editor an toàn, quyền file `0600`. Không gửi secret, OAuth code hoặc token vào chat/reports, không thêm `VITE_` hoặc commit. Agent phải kiểm hash/cấu hình/admission trước và sau thay đổi cấu hình, rồi restart qua thủ tục runtime hiện hành. Thiếu một trong hai giá trị thì nút provider đó bị khóa rõ lý do; provider khác vẫn dùng được. Không coi nút đang khóa là nghiệm thu OAuth live.

## Bằng chứng cần người dùng

Đăng nhập seller → chọn username muốn dùng lâu dài → cấp quyền từng provider trong cửa sổ chính chủ → quay lại đúng tab. Kiểm username/link trên hồ sơ công khai. Thử hủy consent; thử ngắt rồi xác thực lại một provider; thử liên kết cùng social ID ở tài khoản GroupDeal khác phải bị từ chối. Không cần mua, giao, claim hay đổi payout để kiểm phần này.

Kiểm nguồn và fixture: `node scripts/run_seller_identity_checks.cjs`. Dữ liệu cô lập, không dùng wallet/provider/DB live. Nó không thay thế consent thật tại provider.

Tham chiếu giao thức: [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [X authorization code](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2).
