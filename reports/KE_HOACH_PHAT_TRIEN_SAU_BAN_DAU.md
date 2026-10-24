# Trạng thái các mục từng hoãn — cập nhật 24/10/2026

Bảng này thay các trạng thái lỗi thời ngày 21/10. Phần đã có kết quả được chốt theo đúng phạm vi; không tự mở lại luồng vận hành hoặc các giao dịch đã hoàn tất.

| Mục | Trạng thái hiện hành | Việc còn lại trong phạm vi này |
|---|---|---|
| Username | Đã triển khai; hiển thị `@handle`, chỉ tạo một lần, không đổi | Không yêu cầu chọn lại username đã có |
| GitHub/Discord | Đã cấu hình và liên kết thật | Không cấu hình hoặc consent lại cho phần đã xong |
| X | Hoãn theo người dùng vì chi phí | Không mở dịch vụ hoặc phát sinh chi phí |
| Circle | Đã có đăng nhập ví email và hoán đổi Testnet được ghi nhận | Không lặp các giao dịch đã xong |
| Admin/quyền/ticket/email | Các hành trình đã ghi nhận giữ nguyên kết quả; phần operator có tab riêng trong gói UI mới | Chỉ xử lý lỗi hoặc yêu cầu mới cụ thể |
| OneDrive | Kết nối, upload/tải ngược SHA-256, lịch và giám sát đã hoạt động | Đã triển khai layout v2 trên VPS và tổ chức 56 cặp; 4 archive thiếu manifest được giữ riêng, không tự gắn verified |
| Giao hàng | LICENSE_KEY, FILE_LINK và WEBHOOK đã có các hành trình thật đã ghi nhận | Không mua/giao/xác nhận/claim lại các đơn đã xong |
| UI/workspace và header | Đã phát hành: frontend `49f2719`, backend `f314de7`; CI 78/78 PASS; local cập nhật | Không còn việc triển khai gói này; chỉ xử lý lỗi/yêu cầu mới cụ thể |
| Backend/dependency recovery | Đã nâng runtime đúng admission và đối soát; backup/offhost sau nâng cấp đạt | Không còn backlog rollout `4b5af76` được ghi trong báo cáo ngày 21/10 |
| Restore/RPO-RTO | Người dùng đã miễn diễn tập thủ công và đo chỉ số | Không mở lại |
| Retry/DLQ live | Người dùng đã hoãn | Không gây outage, replay hoặc tạo đơn mới |
| G5/G6 tổng thể | OPEN theo phạm vi còn hiệu lực; các chỉ mục đã nối biên bản phát hành mới | Xem [từng nhóm còn thiếu bằng chứng và bước bàn giao](PHAM_VI_G5_G6_CON_LAI_2026-10-24.md); không tự kiểm tra lại toàn bộ |

Nguồn: reports/HOAN_THIEN_DU_AN_HIEN_TAI_2026-10-21.md, docs/workspace-ui-2026-10-22.md, docs/onedrive-backup.md. GitHub và VPS cần ghi riêng commit helper/tài liệu với frontend/backend đang phục vụ.
