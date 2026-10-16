# Tài khoản và Thông báo — R5–R7, 16/10/2026

Đối chiếu source sạch HEAD4f0955c với frontend0dce624/backend324bca2 và proof CURRENT trước khi sửa. VPS giữ writer duy nhất. Gói này sửa ba lỗi đã tái hiện; không đóng toàn bộ R5–R7 hoặc G5/G6.

| Khoảng trống | Thay đổi và bằng chứng |
|---|---|
| Mất ACK đọc thông báo vẫn chuyển sang đơn, đóng popup | `markRead` trả false khi lỗi hoặc ACK không khớp. Header/trang giữ nguyên ngữ cảnh, trạng thái chưa đọc và báo lỗi; đọc lại xác nhận trạng thái đã lưu rồi mới đi đúng order.id. Không gửi POST lần hai khi đã xác nhận đọc qua GET. |
| Tài khoản tràn 541px ở viewport375/text200 | Cột grid cho phép co, nút xuống dòng, nội dung dài ngắt dòng, fieldset bỏ min-content. Nháp email, checkpoint và phiên hiện hành giữ; nút xác nhận thu hồi nhìn thấy khi focus, chưa phát command trong ca layout. |
| Popup 380px bị cắt cạnh phải ở màn320 | Khôi phục width auto theo hai cạnh của popup mobile. Header xuống hàng khi chữ lớn, giữ tên GroupDeal và các nút không đè nhau. |

Đã đạt kiểm hẹp: 10 ca mới VI/EN bằng mocks; 6 ca hồi quy inbox, 2 ca popup320/375/430/768/1024/1440 và375/text200, 12 ca quản lý phiên. Production build có cấu hình ví public hiện hành và typecheck đạt. Kiểm lại trên bundle build: 10 ca mới đạt; một ca HTTP/native SQLite fixture riêng đạt, chứng minh preference/read đã commit vẫn khôi phục qua GET sau ACK mất, audit đúng một lần, order quantity/owner khác/checkpoint không đổi, outbox0. Đây là fixture mới tách biệt, không phải DB/app snapshot cũ hoặc tài khoản thật.

Lưu các lượt fail và hiệu chỉnh fixture: lỗi chuyển trang thật; overflow541px thật; fixture heartbeat chưa trả ACK; chữ GroupDeal chồng menu chỉ thấy khi xem ảnh dù số đo PASS; selector ngôn ngữ cũ; lượt ghép hai worker timeout khởi động native fixture12s. Chạy riêng native trên bundle đạt, không tăng timeout hoặc nới guard. Các lượt fail không được tính PASS.

Đọc metadata VPS15:13UTC:44 walletFlows/56 signerReservations nguyên hash7d0f952c…, chưa có Circle EURC→USDC đã thực hiện;0RPC receipt mới.8email SENT đều TEST cũ trong held, không có email nghiệp vụ mới; account commands0/restricted0;95held giữ. Circle USDC→EURC1USDC dùng proof trước, không replay; approve-only khác không tự tiếp tục. Admin authenticated live vẫn được user hoãn.

Sau triển khai cần ghim commit frontend, full181 public bytes/377 runtime bytes, HTTPS/account/notifications và guest401, PID/NRestarts/Nginx/backup; cập nhật CURRENT cùng bàn giao. Backend324bca2 và quyền tài khoản thật không đổi. Chưa có cross-browser/whole-app accessibility, email inbox thật, Circle chiều ngược/cirBTC, Safe owner/custody, offhost/RPO–RTO. Candidate NOT_FROZEN/G5/G6 OPEN.
