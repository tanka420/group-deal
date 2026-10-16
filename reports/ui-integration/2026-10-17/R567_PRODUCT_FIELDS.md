# R5–R7 — lỗi trường sản phẩm và quyền phân phối

Ngày 17/10/2026 (UTC+7). Baseline fa08285; frontend live trước gói aa7bff7, backend 324bca2. Giữ mặc định approve đúng số tiền; không thêm tùy chọn hoặc đổi chính sách allowance trong gói này.

Đối chiếu source/proof: ProductStudio đã có command UUID, digest, receipt, giữ pending khi mất phản hồi và chống POST lặp. Form trước gói phụ thuộc validation của trình duyệt và lỗi chung; thiếu lỗi theo trường/focus cho nội dung trắng, số seat/ngày, giới hạn metadata và link HTTPS. Quyền phân phối thiếu kiểm trước checkpoint đối với statement trắng hoặc evidence không hợp lệ. Các proof recovery cũ không thay bằng chứng các lỗi này.

Sửa frontend: kiểm metadata theo giới hạn backend trước tạo UUID/checkpoint/request, lỗi VI/EN gắn aria-invalid/describedby; focus trường sai đầu tiên theo thứ tự DOM và cuộn đủ nhãn/lỗi dưới header. Ô số nguyên giữ chuỗi nhập để báo lỗi thập phân hoặc ngoài giới hạn; duration/activation trống vẫn null, supportDays=0 vẫn hợp lệ. Lỗi tự cập nhật khi sửa hoặc đổi ngôn ngữ; không xóa nháp. Giữ nguyên server guard, API, receipt và khóa gửi khi kết quả chưa rõ. Chỉ xác nhận thành công khớp receipt mới xóa nội dung.

Đã giữ baseline FAIL thiếu aria-invalid ở seat0. Source cuối a248dd8f729bdd741af1e45f3ad2546914b134a2: [CI 38943611476](https://github.com/tanka420/group-deal/actions/runs/38943611476) PASS guard/type/build,25dev/25built,không SKIP; production public-configuration build181files và4ca built local PASS. Đã xem ảnh focus/lỗi VI/EN/text200. Đã push/triển khai frontend, giữ backend/PID/Nginx;89delta/181public/377runtime/HTTPS/guest401 đạt. Không gọi CI/fixture là nghiệm thu live.

Giới hạn: file upload/import codes còn cần gói lỗi trường riêng; chưa whole-app/cross-browser hoặc hành trình seller thật. Admin live user hoãn; Circle chiều ngược/cirBTC/email nghiệp vụ, Safe owner/custody và offhost/RPO–RTO còn mở. Không app/DB local cũ, reset/seed/replay đơn1–5, ký/provider create thật, mutation tài khoản thật, giải phóng 95 held hoặc full test/CI. G5/G6 OPEN, candidate NOT_FROZEN.

# Khoảng trống sau gói sản phẩm/quyền phân phối

CI https://github.com/tanka420/group-deal/actions/runs/38943611476 đúng a248dd8f729bdd741af1e45f3ad2546914b134a2: guard/type/build, 25 dev và 25 built PASS, không SKIP. Giữ baseline FAIL thiếu aria-invalid/focus ở seat=0; không bỏ assertion hoặc nới backend guard. Mặc định approve đúng số tiền giữ nguyên.

Đọc 2026-10-16T17:58:40.087Z: 52 flows/64 reservations, hash 209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4; tăng 8 hồ sơ so với packet trước, không gọi là ledger44/56 không đổi. Tám receipt mới đều đạt; 4 swap hoàn tất/3 approve-only và một yêu cầu khác hoàn toàn PLANNED. Không tự tiếp tục các request cũ. Circle chiều EURC→USDC và cirBTC chưa execution mới; 8 email SENT vẫn TEST cũ/held, 0 email nghiệp vụ mới; account commands/restricted=0.

File upload/import code errors, whole-app zoom/long content/cross-browser và các nhánh G5 còn thiếu giữ OPEN. Admin live user hoãn. Safe có 0 chữ ký kiểm soát/custody; offhost chưa target/RPO/RTO. Candidate NOT_FROZEN, G5/G6 OPEN. Proof parent được kiểm hash manifest và 138 artifact trực tiếp, tái sử dụng theo timestamp/phạm vi; không tuyên bố mọi artifact lịch sử lồng nhau được kiểm mới.

Proof reports/evidence/r567-product-fields/2026-10-16T18-04-00-478Z/CHECKS.json; SHA256 `2f51cb0962f894b9eb0b1d958c0cd5607b60efd0ab06af9f577646f0c967507c`. NOT_FROZEN; G5/G6 OPEN.
