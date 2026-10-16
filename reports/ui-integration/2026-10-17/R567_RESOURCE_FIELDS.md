# R5–R7 — upload tài nguyên và nhập mã truy cập

Ngày 17/10/2026 (UTC+7). Baseline source 5e56402; frontend live trước gói a248dd8, backend324bca2/ops28f62e0. Giữ mặc định approve đúng số tiền, không đổi API/receipt, backend guard hay quyền nghiệp vụ.

Đối chiếu: gói sản phẩm/quyền phân phối trước có proof riêng. Upload/import đã có kiểm dữ liệu và command idempotency/receipt/recovery, nhưng lỗi local còn chung, chưa gắn aria/focus vào file/mã. Khi server xác nhận input bị từ chối, UI chưa đưa focus về trường cần sửa. Phát hiện thêm Rights and resources vẫn cho đổi sản phẩm khi resource command chưa rõ kết quả, làm xóa private input đang giữ trong bộ nhớ tab.

Sửa frontend: lỗi file rỗng/quá16MB/loại hoặc tên không hợp lệ trước hash/UUID/checkpoint/POST; tái dùng MIME normalization hiện hành. Lỗi mã trùng/định dạng12–128/giới hạn1000 gắn đúng textarea, không phản chiếu mã riêng tư vào thông báo. VI/EN, aria-invalid/describedby, focus và cuộn đủ nhãn/lỗi; tên file dài đọc được, ô chọn file có viền focus. Explicit finite RESOURCE_INPUT_INVALID giữ file/mã và đưa focus về trường; retry chỉ do user bấm. Unknown/ambiguous/mismatch giữ checkpoint và chặn gửi lặp. Resource pending khóa chọn sản phẩm khác ở cả disabled/handler để giữ productVersion/resource/file/mã của yêu cầu hiện hành.

Giữ private file/mã trong bộ nhớ tab, không lưu vào browser storage; reload chỉ giữ opaque checkpoint. Receipt đúng mới xóa nội dung thành công; confirmed cancel giữ nội dung để kiểm tra. Không tự cancel/resolve/retry/broadcast hoặc đổi principal/nonce/hold.

Đã giữ hai baseline FAIL và lượt preview local mở trước build hoàn tất nạp bundle cũ. Source cuối d835abc28b755c4bc1176a31282b4f1d3c746cb2: [CI 38978752332](https://github.com/tanka420/group-deal/actions/runs/38978752332) PASS guard/type/build,43dev/47built,không SKIP.6ca local trên production public-config bundle PASS với181hash trước/sau. Đã xem ảnh lỗi/focus VIEN/text200. Đã push/triển khai frontend;90delta/181public/377runtime/HTTPS/guest401 khớp,backend/PID/Nginx giữ. Không coi fixture/CI là seller live hoặc toàn bộ R5–R7.

Admin authenticated live user hoãn. Circle chiều ngược/cirBTC/email nghiệp vụ/Safe control/custody/offhost/RPO–RTO và whole-app/cross-browser còn mở. VPS writer duy nhất; không app/DB local cũ, reset/seed/replay đơn1–5, ký/provider create, giải phóng95held hoặc full test/CI. Candidate NOT_FROZEN, G5/G6 OPEN.

# Khoảng trống sau upload/import

CI https://github.com/tanka420/group-deal/actions/runs/38978752332 đúng d835abc28b755c4bc1176a31282b4f1d3c746cb2: guard/type/build,43dev/47built PASS, không SKIP. Giữ FAIL thiếu field focus, FAIL đổi sản phẩm khi unknown, và FAIL local preview mở trước build xong. Lượt preview đó nạp bundle cũ; không dùng làm bằng chứng source cuối. Sau build hoàn tất, pin181hash trước/sau và6ca cuối PASS. Không bỏ assertion hoặc nới guard.

Metadata 2026-10-16T22:54:43.126Z:52flows/64reservations hash209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4 giữ;0account commands/restricted,8SENT đều TEST cũ/held,0email nghiệp vụ mới;95held.8receipt external ở packet trước được tái sử dụng theo timestamp, không RPC recheck mới hoặc replay. Circle chiều ngược/cirBTC chưa có execution mới.

Gói này đóng đúng lỗi resource fields/context đã kiểm; không đóng toàn bộ R5–R7, whole-app/cross-browser hay seller/admin live. Admin live user hoãn. Safe0signatures/custody, chưa offhost target/RPO/RTO. Candidate NOT_FROZEN,G5/G6 OPEN.

Proof reports/evidence/r567-resource-fields/2026-10-16T23-04-54-616Z/CHECKS.json; SHA256 `e18f951eb4858b3a2b7e409934b20826b0b776126c6a063507224e688fc04aa8`. NOT_FROZEN; G5/G6 OPEN.
