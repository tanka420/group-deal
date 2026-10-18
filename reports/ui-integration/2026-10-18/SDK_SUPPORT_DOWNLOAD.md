# SDK support attachment stream — 18/10/2026

Source SDK 5458925313a8b8f2d6d4a63eb6c77f4e5df9eb6c; app frontend 8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07, backend 30fea223380affc471cc91f4ab2390814ddaa87c, ops 73b6fae5a33eda1dfc9ab6c3364d9fcfa65809b8 giữ nguyên. SDK runtime inputs0, không deploy/restart app, chưa publish registry. Người dùng đã hoãn Circle và yêu cầu tiếp tục phần độc lập; không tạo/tiếp tục Circle request, không hỏi lại lượng hoặc OTP Circle trong gói này.

Đã tái hiện lỗi: response gzip dài2.068byte giải thành2.097.152byte. Hàm cũ arrayBuffer đọc hết decoded body trước kiểm length/hash. SDK mới chỉ cấp phát expected.byteLength đã kiểm tối đa1MiB, đọc từng chunk và dừng trước chép vượt buffer; giữ kiểm exact length/SHA256, timeout toàn body, auth error và redirect:error; abort/cancel response khi kết thúc/lỗi.

9 ca mới từ tarball npm pack/cài offline +HTTP loopback đạt: decoded gzip overflow, đúng bytes/hash, đúng biên1MiB, hash sai/body thiếu, MIME/length header sai,401 giữ error sanitized, redirect không chuyển bearer, body treo hết hạn, metadata sai chặn trước transport. Overflow fixture mới chỉ kéo16.384decoded bytes trước dừng, không nhận cả2MiB; buffer SDK chỉ2.068byte theo metadata. Đây là kiểm giới hạn decoded stream trong fixture, không đo tổng RSS hoặc mọi cơ chế nén/runtime.

Giữ FAIL baseline overflow và FAIL sau sửa tại fixture MISSING_LENGTH: Node tự thêm Content-Length cho res.end(Buffer), nên response thực tế có header hợp lệ. Fixture cuối dùng chunked để thực sự thiếu length; không nới production validation. Lượt cuối9case/build PASS. Các SDK method ngoài downloadSupportAttachment byte-identical với416ab71; giữ10webhook proof cũ theo delta, không rerun toàn SDK hoặc full CI. npm test mặc định đã nối ca mới để CI về sau có thể chạy.

Tarball SHA256 474af3cedf3d15b91e77fe4d7b1ce285880ea69d17e9f4cdfe824d3685669d54, 19303 bytes. Chỉ package.json/README/receiver/dist được đóng gói. VPS quan sát 2026-10-18T03:28:11.809Z:PID97197/NRestarts0,377runtime/181public khớp,backup VERIFIED/privateRestore/BACKUP_CURRENT,timers active,95held giữ. Không DB live write, ticket/email/provider request, ký/broadcast/replay hoặc local snapshot backend/DB.

G5 map đã bổ sung proof đúng SDK/support và qualified các execution log/validation kế thừa bằng path/hash/timestamp gốc, tránh hiểu path tương đối của packet cũ là artifact trong packet mới. Claim/commit/UI/metadata/Safe kế thừa đúng timestamp. Circle và admin live đều hoãn; username/social sau bản đầu. Safe owner control/custody và offhost target/RPO–RTO vẫn mở. NOT_FROZEN; G5/G6 OPEN.

Proof: reports/evidence/sdk-support-download/2026-10-18T03-28-07-067Z/CHECKS.json
SHA256: 3000277482bb0d784cbe0a8ac314d940f45540e4ff21c7465cb113b5b7eeef49
