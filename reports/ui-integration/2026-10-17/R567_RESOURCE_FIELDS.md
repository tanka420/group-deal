# R5–R7 — upload tài nguyên và nhập mã truy cập

Ngày 17/10/2026 (UTC+7). Baseline source 5e56402; frontend live trước gói a248dd8, backend324bca2/ops28f62e0. Giữ mặc định approve đúng số tiền, không đổi API/receipt, backend guard hay quyền nghiệp vụ.

Đối chiếu: gói sản phẩm/quyền phân phối trước có proof riêng. Upload/import đã có kiểm dữ liệu và command idempotency/receipt/recovery, nhưng lỗi local còn chung, chưa gắn aria/focus vào file/mã. Khi server xác nhận input bị từ chối, UI chưa đưa focus về trường cần sửa. Phát hiện thêm Rights and resources vẫn cho đổi sản phẩm khi resource command chưa rõ kết quả, làm xóa private input đang giữ trong bộ nhớ tab.

Sửa frontend: lỗi file rỗng/quá16MB/loại hoặc tên không hợp lệ trước hash/UUID/checkpoint/POST; tái dùng MIME normalization hiện hành. Lỗi mã trùng/định dạng12–128/giới hạn1000 gắn đúng textarea, không phản chiếu mã riêng tư vào thông báo. VI/EN, aria-invalid/describedby, focus và cuộn đủ nhãn/lỗi; tên file dài đọc được, ô chọn file có viền focus. Explicit finite RESOURCE_INPUT_INVALID giữ file/mã và đưa focus về trường; retry chỉ do user bấm. Unknown/ambiguous/mismatch giữ checkpoint và chặn gửi lặp. Resource pending khóa chọn sản phẩm khác ở cả disabled/handler để giữ productVersion/resource/file/mã của yêu cầu hiện hành.

Giữ private file/mã trong bộ nhớ tab, không lưu vào browser storage; reload chỉ giữ opaque checkpoint. Receipt đúng mới xóa nội dung thành công; confirmed cancel giữ nội dung để kiểm tra. Không tự cancel/resolve/retry/broadcast hoặc đổi principal/nonce/hold.

Đã giữ hai baseline FAIL: upload không focus trường và chọn sản phẩm khác vẫn enabled khi unknown. Có 37 ca resource recovery/rejection và bốn ca VI/EN PASS trước sửa context cuối; đang kiểm sáu ca cuối, type/build và CI hẹp r7-resource trên source chính xác. Chưa triển khai gói tại mốc ghi ban đầu; không coi fixture/CI là seller live hoặc nghiệm thu toàn bộ R5–R7.

Admin authenticated live user hoãn. Circle chiều ngược/cirBTC/email nghiệp vụ/Safe control/custody/offhost/RPO–RTO và whole-app/cross-browser còn mở. VPS writer duy nhất; không app/DB local cũ, reset/seed/replay đơn1–5, ký/provider create, giải phóng95held hoặc full test/CI. Candidate NOT_FROZEN, G5/G6 OPEN.
