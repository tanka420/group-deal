# R5–R7 đăng nhập, seller công khai và draft campaign — 16/10/2026

Base source3b56b7e; frontend đang phục vụ9dc90d6/backend324bca2/ops28f62e0. Đối chiếu CURRENT_G5/CI guard và source trước khi sửa; VPS vẫn writer duy nhất. Không mở lại các hành trình tài chính đã hoàn tất hoặc admin live đang hoãn.

| Khoảng trống đã tái hiện | Sửa và tiêu chí kiểm |
|---|---|
| Email trống/sai chỉ có native browser validation, thiếu lỗi theo trường VI/EN | Dùng validity của input email để chặn trước request; lỗi required/invalid được dịch, aria-invalid/describedby và focus đúng trường. Sửa giá trị xóa lỗi; lỗi provider giữ nháp, không lộ diagnostic. Không thay kiểm backend. |
| Ô email focus bị cắt ở mép modal tại375/text200 | Cuộn đủ target sau focus trong modal và chừa focus ring, giới hạn transition ở màu/border/shadow. Không can thiệp Circle/Reown handoff; cleanup hủy frame/listener. |
| Hồ sơ seller: cột metric cố định ép nhãn/counter; tên dài bị hẹp bởi avatar | Mobile metric tự xuống hàng theo kích thước chữ; giảm padding lồng và đặt avatar trên tên. Counter23456/12345/11111 vẫn nguyên, đọc được một dòng; bio hiển thị text. Không suy số đếm thành financial reconciliation. |
| Tier editor: tổng width PASS nhưng ô/lỗi USDC xếp dọc từng mảnh | Hàng threshold/price một cột trên mobile; kiểm đủ chỗ cho nguyên đơn vị USDC và xem ảnh. Không sửa giá/base units/rebate hoặc checkpoint/CAS. |
| Icon đăng nhập guest chỉ còn vài pixel ở chữ200 | Bỏ padding rem trong nút44px, giữ SVG không co. Header/route/menu logic không đổi. |
| Giờ lấy dữ liệu hồ sơ phụ thuộc timezone browser | Ghim Asia/Ho_Chi_Minh/h23, hiện UTC+7; browser UTC phải đổi2026-10-15T20:30Z sang03:30 ngày16, giữ datetime ISO nguồn. Đây là thời điểm lấy projection, không phải thời điểm thanh toán/finality. |

Kiểm local:16ca auth (4mới+12hồi quy),6ca profile/draft (4mới+2độ rộng) đạt; kiểm type và production bundle với public wallet configuration hiện hành đạt. Built preview có8ca PASS/2SKIP; hai ca SDK ready giả lập chỉ có ở dev, không coi SKIP là PASS hoặc OTP thật. R6 timezone được bổ sung sau vòng ảnh; kết quả cuối lấy đúng source/bundle và CI đã ghim.

Các fail được giữ: email thiếu aria/lỗi; focus còn cắt dù chờ ổn định; metric VI/EN overflow; timezone hiển thị20:30/ngày15 trong browserUTC. Ảnh số đo PASS còn bắt được tier chữ dọc/icon guest quá nhỏ/tên seller hẹp. Các hiệu chỉnh fixture giữ riêng: displayName vượt80 bị reader từ chối; tên nút Mở bản nháp có tên draft; aria-invalid vắng là trạng thái hợp lệ; khôi phục edit local qua đúng nút Restore thay vì mở bản server; copy EN current edits saved; giữ raw max3.0 để chặn autosave trong ca không ghi. Không nới parser/guard sản phẩm để làm test xanh.

Job dispatch `r7-forms` ghim baseline3b56b7e và allowlist source của gói; chỉ tooling guard, frontend type/build, auth/profile/draft dev/built fixtures. Dùng dependency khóa, Node24.21.0 và mọi Action ghim SHA; không full application CI, backend app/DB cũ, provider/financial request hoặc deploy. Source commit dùng `[skip ci]` để tránh auto full; chỉ công nhận kết quả GitHub đúng SHA sau khi run hoàn tất.

Trước deploy đã đọc lại377runtime/181public bytes khớpfrontend9dc90d6, PID3655922/NRestarts0/95held/backup VERIFIED/privateRestore/BACKUP_CURRENT. Gói frontend mới phải có CI hẹp PASS, public/full-build manifest/HTTPS và runtime readback rồi mới cập nhật CURRENT. Không restart backend, mutation quyền thật, ký/OTP thay user, replay đơn1–5 hoặc giải phóng95held.

Phạm vi còn mở: whole-app/cross-browser/OS scaling; các nhánh G5 chưa đủ proof; admin live hoãn; Circle chiều ngược/cirBTC/email nghiệp vụ; Safe independent control/custody/emergency; offhost/incident/RPO–RTO. Candidate NOT_FROZEN/G5/G6 OPEN.

Đã triển khai frontend `7704cad`, giữ backend `324bca2`. [CI 38930605333](https://github.com/tanka420/group-deal/actions/runs/38930605333) PASS đúng SHA. Proof: reports/evidence/r7-auth-seller-campaign/2026-10-16T16-24-19-355Z/CHECKS.json; SHA256 `faa3577d9d3d072174f37144b27ad5e0508e866ce625c4fa3d5cbed56431490e`. Safe đọc tại block finalized 67526385; chưa có chữ ký kiểm soát/custody. Candidate NOT_FROZEN; G5/G6 OPEN.
