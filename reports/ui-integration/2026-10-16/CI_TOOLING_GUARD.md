# Sửa guard CI và công việc tiếp theo — 16/10/2026

Run38924441979 (HEAD542901f) và38923312168 (source9dc90d6) lỗi ở `Tooling isolation and redaction guards`; compile/test ứng dụng chưa chạy. Tái hiện trên checkout sạch xác định assertion cũ `local_pipeline.test.cjs:34:314`: đếm đúng3 lần dùng Action. Workflow đã mở rộng thành8job/24lần dùng, đều ghim SHA40; assertion đếm cứng đã lỗi thời. Lượt bàn giao trước đã kiểm local scoped nhưng bỏ sót trạng thái CI tự động, không được coi các run này xanh.

Sửa guard để kiểm mọi `uses:` đều ghim commit bất biến và vẫn có checkout/setup-node/upload-artifact. Kiểm nhiều job hợp lệ; thêm một use dùng main/tag/SHA39/expression hoặc thiếu action bắt buộc phải fail. Giữ kiểm credential tạm, network block, cấm deploy/seed, redaction và từ chối chiếm port; chỉ in vị trí assertion khi lỗi, không in giá trị. `node test/local_pipeline.test.cjs` đã đạt local.

Thêm dispatch scope `tooling`: chỉ cài backend dependencies và chạy guard trên Node24.21.0/Ubuntu24.04, không Chromium/full suites/DB/app/provider/deploy. Mọi Action vẫn ghim SHA. Commit này dùng `[skip ci]` để tránh auto full-pipeline cho delta tooling; xác minh GitHub bằng job dispatch tooling riêng. Không đổi rule hoặc xóa lịch sử run fail; chỉ công nhận đúng scope của run mới khi có kết quả. Kết quả run và hash bằng chứng lưu trong CURRENT_CI_TOOLING_LATEST ở root workspace.

Frontend đang phục vụ9dc90d6, backend324bca2/ops28f62e0; delta này chỉ test/workflow/docs, không cần deploy hoặc restart.31ca UI scoped và public/runtime proof giữ phạm vi riêng; sửa guard không biến chúng thành full CI/G5/G6 PASS.

| Thứ tự | Trợ lý thực hiện | Người dùng phối hợp |
|---|---|---|
| 1 | Sửa guard CI, xác minh job tooling trên GitHub, cập nhật CURRENT/bàn giao. | Chưa cần thao tác. |
| 2 | Tiếp tục đối chiếu R5–R7 theo màn/trạng thái còn thiếu; kiểm hẹp VI/EN, focus, bàn phím, chữ lớn/nội dung dài và các nhánh quyền hiện có. | Khi sẵn sàng mới đăng nhập admin `/admin/users`, chỉ xem danh bạ/Phân quyền, không thay quyền thật để test. Việc hoãn hiện tại vẫn được giữ. |
| 3 | Chuẩn bị các hành trình G5 thực sự thiếu và đối chiếu từng request/receipt; không replay đơn1–5 hoặc swap đã thành công. | Tự OTP/ký khi phối hợp đúng yêu cầu Circle EURC→USDC còn thiếu; cirBTC chỉ thực hiện khi có route/quote hợp lệ. Không tự tiếp tục các request approve-only để chẩn đoán. |
| 4 | Chuẩn bị sự kiện email nghiệp vụ mới và đối chiếu recipient/preferences/provider ACK; không giải phóng95held. | Chọn người nhận qua email liên hệ đã xác minh trong app, tự kiểm inbox khi có sự kiện mới hợp lệ; không cần gửi OTP/mật khẩu vào chat. |
| 5 | Kiểm Safe packet đúng context/canonical trước khi thu chữ ký; xác minh chữ ký và ghi riêng custody. | Hai owner, gồm người giữ khóa độc lập đã báo, tự ký thông điệp kiểm soát và xác nhận vai trò giữ khóa. Đây không phải Safe transaction/approve/chuyển tiền. Chờ kiểm packet còn hiệu lực trước khi ký. |
| 6 | Preflight target rồi thực hiện restore drill cô lập, đo RPO/RTO đúng phạm vi; VPS vẫn writer duy nhất. | Khi có máy khác VPS, cung cấp host/path và cách truy cập phù hợp. Chưa có máy thì mục này chờ; không gửi secret hoặc tự chép backup sang máy khác. |
| 7 | Khi mọi nhánh bắt buộc đủ proof mới freeze candidate/G5 rồi rà soát độc lập G6. | Phối hợp nghiệm thu những phần cần người thật; chưa tuyên bố toàn dự án hoàn tất. |

G5 còn nhánh publish/commit/metric/cap, recovery/claim/dispute allocation, inventory/provider/SDK/webhook cần nối source/proof theo bảng hiện hành; các dòng tổng hợp trên không bỏ các nhánh này. Cần receiver được chỉ định trước khi thử webhook thật. Không dùng full CI hoặc một giao dịch mẫu thay bằng chứng còn thiếu.
