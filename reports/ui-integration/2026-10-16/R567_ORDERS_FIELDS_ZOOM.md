# R5–R7 — đơn mua, tranh chấp và giao hàng seller

Base sạch d174747; frontend đang triển khai cc0daf7/backend324bca2. Preflight VPS chỉ đọc:377runtime/181public khớp admission/build, PID3655922/NRestarts0, backup VERIFIED/BACKUP_CURRENT và95held giữ.

Các lỗi xác định và sửa:

- Khoảng ngày sai chỉ báo lỗi, không focus trường cần sửa; lỗi giữ sau khi chỉnh ngày. OrderList trả focus đúng input ngày và xóa lỗi khi sửa, giữ nháp, URL và bộ lọc đã áp dụng.
- Lý do tranh chấp chỉ có khoảng trắng dừng im lặng; URL HTTPS chứa credentials chỉ có lỗi chung. Form dùng lỗi theo trường VI/EN, aria-invalid/describedby, focus trường sai đầu tiên và giữ nháp/đúng order.id. Không chuẩn bị giao dịch khi invalid; business/backend validation giữ nguyên.
- Text200 làm nút quay lại buyer/tạo campaign seller tràn viewport; các nút trong hai workspace xuống dòng theo width. Visual review bắt thêm nút Hủy/Xác nhận bị ép từng ký tự dù scrollWidth đạt; hai nút dialog đổi sang flex-basis có thể xuống hàng. Nút trao đổi có chỗ cho cả từ conversation.

6ca mới VI/EN kiểm375px/text200, filter/detail/returnTo, trường lỗi, review score/comment/dispute reason/evidence giữ khi đóng/mở, checkpoint không đổi, không API mutation.16ca buyer integration/view giữ exact money lớn, unverified balance, unknown SLA, owner mismatch, late response, unknown acknowledgement và drafts.6ca built claim/order/delivery giữ checkpoint khi projection mismatch và recover đúng, không gọi ready/ký. Typecheck/production build181files đạt. Các fail đầu và lần PASS số học nhưng visual chưa tốt được giữ, không dùng một ảnh để gọi accessibility toàn app đạt.

Thêm variant --restricted-existing cho2kịch bản backend claim_operation/order_action: dùng SQLite fixture riêng, guard BUY/SELLER mới từ chối nhưng buyer/seller claim và dispute/confirm/breach/settle/resolve của nghĩa vụ cũ vẫn prepare/ready/recover theo receipt. Claim giữ historical seller role với sellerEnabled=false. Không thay runtime backend. Sửa fixture operator dùng ADMIN realm, không nới guard; fixture built dùng URL chi tiết đơn thay route danh sách cũ.

Chỉ scoped evidence, không live financial/provider/admin acceptance. Không app/DB local từ snapshot, full test/CI, replay đơn1–5, release95held, gửi email, ký hoặc broadcast. Candidate NOT_FROZEN/G5G6 OPEN. Các nhánh human/provider/offhost giữ chờ như bàn giao hiện hành.
