# Trạng thái hoàn thiện GroupDeal — 21/10/2026

Phạm vi hiện tại là sản phẩm **Arc Testnet** tại [groupdeal.tech](https://groupdeal.tech). Theo quyết định mới nhất, ưu tiên hoàn thiện mã nguồn, tích hợp và bàn giao; kiểm thử retry/DLQ trên hệ thống thật sẽ thực hiện sau. Hoãn kiểm thử không đồng nghĩa nhánh đó đã đạt hoặc được miễn nghiệm thu.

| Phần việc | Trạng thái có bằng chứng | Việc tiếp theo |
|---|---|---|
| Tên miền và website | groupdeal.tech đã vận hành qua HTTPS | Giữ cấu hình và runbook hiện hành |
| GitHub/Discord | Seller đã liên kết thật | Các ca hủy/ngắt/liên kết lại/khác tài khoản còn trong ma trận kiểm thử |
| X | Hoãn theo người dùng vì chi phí | Không cấu hình hoặc mua dịch vụ lúc này |
| Backup OneDrive | Consent, round-trip kiểm hash và lịch giám sát đã hoạt động | Theo dõi receipt của lịch; không mở lại diễn tập phục hồi/RPO-RTO đã miễn |
| Admin và quyền phân phối | UAT cấp/thu hồi seller, khóa/mở và duyệt/thu hồi hồ sơ đã có bằng chứng theo phạm vi | Các nhánh ACL và lifecycle còn thiếu giữ trong G5 |
| Circle | Email wallet và hoán đổi testnet đã có bằng chứng | Không lặp các swap tùy chọn chỉ để thêm bằng chứng |
| Giao hàng | LICENSE_KEY, FILE_LINK và Webhook đã có hành trình thật theo từng hồ sơ | Giữ bằng chứng và quyền của đơn đã hoàn tất |
| Webhook đơn #7 | Cấp quyền, tải ZIP, dùng CSV, xác nhận và cả hai khoản rút đã hoàn tất | Không mua/giao/xác nhận/rút lại đơn này |
| Retry/DLQ live | **DEFERRED_BY_USER — kiểm thử sau** | Chưa gây outage, tạo job lỗi hay replay; không tính PASS |
| CI provider | Đã nối backend, Worker và conformance vào pipeline chung; các nhóm liên quan đạt | Chạy full CI trên candidate cuối ở giai đoạn chốt |
| Bàn giao | README và bảng hiện tại đã cập nhật theo các bằng chứng mới | Giữ runbook và artifact đúng candidate khi chốt |
| G5/G6 cuối | Còn mở | Chốt candidate, CI sạch và rà soát độc lập theo phạm vi còn hiệu lực |
| Mainnet | Giai đoạn WP30 riêng | Chưa triển khai hoặc mở rộng quyền ở gói này |

## Việc được tiếp tục ngay

1. Nối các kiểm tra provider vào lệnh backend, pipeline và workspace install của CI. Worker được build/test trước bài conformance dùng bundle đó. Dùng fixture và SQLite/D1 cô lập, không lấy token hoặc dữ liệu live.
2. Sửa README để phản ánh đúng domain, OAuth, OneDrive, Circle và Webhook đã vận hành; tách hướng dẫn môi trường local khỏi dịch vụ live trên VPS.
3. Chỉ sửa thêm chức năng khi có lỗi hoặc khoảng trống cụ thể. Các phát hiện lịch sử đã được sửa không tự trở thành backlog mới; không chạy lại mọi nhóm kiểm tra đã đạt nếu không bị tác động.
4. Sau khi mã nguồn ổn định, chốt candidate và thực hiện CI/rà soát cuối. Giữ riêng các nhánh kiểm thử người dùng hoãn; không ghi dự án đã nghiệm thu khi còn điều kiện chưa xử lý.

## Giới hạn bảo toàn

Đơn #7 đã claim đủ: buyer 0,04 USDC, seller 0,16 USDC. Tổng phí mạng gói trước là 0,04969549775452 USDC testnet. Không dùng lại ngân sách đó để tạo giao dịch mới. Các đơn 1–7 và 95 tác vụ đang giữ được giữ nguyên.

Gói hoàn thiện hiện tại chỉ sửa CI và tài liệu; không nâng gói Cloudflare, thay DNS, tạo tài nguyên trả phí, restart/deploy ứng dụng hoặc phát giao dịch. Bằng chứng G5 hiện hành và nguồn bàn giao đọc từ CURRENT tại root `reports/evidence`; checkout mã nguồn không chứa toàn bộ artifact live.

**NOT_FROZEN / G5 OPEN / G6 OPEN / acceptanceEligible=false / wholeProjectAccepted=false.**
