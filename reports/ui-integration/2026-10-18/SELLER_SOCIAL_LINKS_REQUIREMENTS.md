# Username và liên kết xã hội — đặc tả hiện hành21/10/2026

Quyết định21Oct đã mở lại gói trước đây hoãn18Oct. Source đang deploy: backend937285063b76f7192ae30f4254b051c9910df8fa, frontend22a45704b0fff52c93e7e28358e64bf3bd571c50. Local/source/UI scoped đã kiểm; OAuth3app/consent và các kiểm live còn thiếu được ghi riêng, chưa nghiệm thu toàn bộ provider.

## Hành vi

- Seller cần username GroupDeal trước publication mới; buyer có thể chọn tại /account và không bắt buộc để mua. Username khác tên hiển thị và username bên provider;3–30chữ thường/số/_, bắt đầu bằng chữ, tên hệ thống giữ riêng, chọn một lần và duy nhất toàn hệ thống.
- Các intent và nghĩa vụ cũ vẫn phục hồi theo proof cũ; chọn username không thay vai trò, payout, owner đơn, resource hoặc nonce.
- Seller tùy chọn xác thực X/GitHub/Discord qua OAuth authorizationcode+PKCES256; ràng buộc đúng phiên/user/provider/origin/revision, hạn5phút, không tự exchange lại code không rõ kết quả. Không mở phương thức đăng nhập xã hội.
- Backend dùng provider+stableID làm chủ sở hữu nguyên tử;2account cùng yêu cầu chỉ1winner. Đổi username provider cập nhật URL/nhãn sau xác thực lại cùngID. Không tự chuyển/gộp account.
- Muốn chuyển phải ngắt tạiA rồi xác thực lại tạiB. Callback cũ không khôi phục link đã ngắt. Publicprojection không cache; hiển thị icon/username/URL/thời điểm; không công khai token/email/privatehistory.
- Verifier mã hóa trong DB; access token chỉ dùng trong lần trao đổi, không lưu. BackendprivateCLIENT_SECRET không vào VITE/bundle/reports.
- Xác thực link không chứng minh uy tín/chất lượng/pháp nhân/quyền phân phối. Giữ riêng xét duyệt seller và quyền theo version.

## Kết quả và phần cần người dùng

60checks gồm duplicate/callback/session/unique/concurrency/unlink/restart/backup và legacyshape; source/emittedupgrade10cases và regression phù hợp đạt. CUA fixturedesktop/390px/VI/EN/Tab, message đổi locale đã sửa và deploy; chưa gọi physicalzoom200 hay consent thật đạt.3OAuthapps hiệnconfiguredfalse.

Cấu hình6biến/callback và các bước chính chủ: docs/seller-identity.md và H1 trong reports/HUONG_DAN_NGHIEM_THU_2026-10-21.md. Không yêu cầu seller đăng bán/claim lại đơn6 để kiểm. CURRENT reports/evidence/onedrive-preparation/2026-10-20T22-15-48-272Z/CHECKS.json/SHA7ec11bc83eaa5539148d957c41bc50875ee58dbdb4099c51c09470d42d016e34; G5/G6OPEN.
