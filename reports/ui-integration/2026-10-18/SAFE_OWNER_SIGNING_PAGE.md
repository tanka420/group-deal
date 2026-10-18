**Safe hiện hành:** Ba chữ ký control đã verified; user xác nhận “1 người” có thể ký/khôi phục cả ba ví. Control đạt; custody độc lập NOT MET, không còn chờ chữ ký hoặc câu trả lời về số người giữ. Chưa có quyết định miễn yêu cầu hoặc đổi cấu hình Safe.

# Cách gửi hai chữ ký Safe — trang owner tự ký

Mở **https://groupdeal.thanhtan.top/safe-owner-control/index.html**. Không cần đăng nhập GroupDeal bằng hai ví; chữ ký đăng nhập là thông điệp khác và không dùng cho gói control này.

1. Người giữ owner73307bdd…50b6d mở link trên máy/ví của họ, chọn OKX/MetaMask (hoặc trình duyệt trong ví) rồi bấm **Kết nối ví đã chọn**. Kiểm địa chỉ được hiển thị.
2. Đọc toàn bộ thông điệp; bấm **Đã đọc · Ký thông điệp bằng ví**, rồi chính người giữ ví xác nhận trong cửa sổ ví. Trang chỉ gọi personal_sign, không giao dịch/approval hoặc phí gas.
3. Bấm **Sao chép kết quả**, dán JSON vào chat này. Một owner khác làm tương tự bằng ví của họ. Mỗi kết quả có owner và signature; trợ lý sẽ ghép/kiểm quorum theo cùng digest.
4. Kèm xác nhận ai giữ mỗi ví, người đó ký được những owner nào, ai khác có thể dùng/khôi phục khóa. Không gửi seed/private key. Hai chữ ký riêng chưa tự chứng minh hai người hoặc custody độc lập.

Thông điệp gốc không đổi: digest 0x21207e4bbe6a41efad99f8b398254370c8784abdd7dd78d5a599436cbc64f7d4; backend context30fea22; hạn **08:27:27 ngày19/10/2026 UTC+7**. Trang chặn khi hết hạn, owner không thuộc gói, account đổi, authority thay đổi, RPC chưa xác minh, hủy ký hoặc chữ ký không khớp. Không nhập message tùy ý, không eth_sign/typed data, không lưu browser storage hoặc POST chữ ký; kết quả chỉ ở RAM/tab và clipboard sau khi người dùng bấm. Trang không thu chữ ký thay người dùng.

Source cf2983885897f4fd089523cd85c215f27ccc189a, đã push. Page bundle4files byte-identical với gói đã kiểm. 9ca ban đầu +2ca post-sign/copy mới đạt; không rerun9ca đã đạt. Chữ ký từ key fixture sinh trong RAM đã qua verifier quorum hiện hành, acceptance/custody/transaction đều false. Test gồm message byte-exact của cả3owner, signer sai, owner khác, đổi account, hủy, expiry, single-flight, nonce trước/sau prompt, copy và mobile375/text200. Đây là fixture Chrome/VI, không mọi engine/manual accessibility hoặc ví thật.

Bốn asset HTTPS đúng SHA256, browser public không console error; live browser dùng provider giả trả cancel4001 để kiểm11publicRPC chỉ đọc/CSP/CORS và authority trước prompt. Không mở khóa ví thật hoặc thu chữ ký thật trong gói. URL thư mục /safe-owner-control/ trả404 theo Nginx hiện hành, nên dùng index.html rõ ở trên; Nginx không sửa. Các lỗi tool/binary/network/URL normalization ban đầu được lưu riêng, không gán thành PASS.

Triển khai chỉ4static files;181asset frontend chính và377runtime hash khớp trước-sau. Tổng public185=181main+4ops. PID97197/NRestarts0, backend30fea22/frontend8dc5cf1/SDK5458925/ops73b6fae giữ; không restart hoặc đổi DB. Backup/privateRestore/BACKUP_CURRENT/timers đọc lúc 2026-10-18T03:49:19.697Z giữ đúng timestamp;95held không giải phóng. Không provider create/Circle/email, backup export hoặc replay đơn/giao dịch. Safe đọc riêng lúc 2026-10-18T03:49:19.282Z, finalized67778411 khớp12kiểm; public page còn tự đọc trước/sau chữ ký. Khi nhận chữ ký thật vẫn cần re-read authority/context/expiry và đánh giá custody.

Circle/admin live hoãn; username/social POST-V1. Chưa nhận hai chữ ký hoặc attestation, thiếu offhost/RPO/RTO và các branch live khác. NOT_FROZEN; G5/G6 OPEN;acceptanceEligible=false.

Proof: reports/evidence/safe-owner-page/2026-10-18T04-01-13-366Z-final/CHECKS.json
SHA256: e9680118ce31ececb4d3f46d4aa131e00d4886a8a19d53cc35246e590e76ae66
