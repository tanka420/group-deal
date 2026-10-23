# Trạng thái hiện hành — 23/10/2026

- OneDrive đã hoạt động; không còn việc cấu hình hoặc xây lại backup. Gói hiện tại chỉ chuẩn hóa thư mục/tên file cloud, bảo toàn ciphertext và lịch sử; xem [quy tắc OneDrive](../docs/onedrive-backup.md).
- Gói UI trên bản nền VPS đã hoàn tất ở source `6f443f9` và đã bàn giao local. Các phần đã sửa/kiểm tra đạt được chốt; không mở thêm đợt kiểm thử toàn bộ luồng nghiệp vụ giữ nguyên.
- Phạm vi phát hành hiện tại là helper OneDrive và tài liệu kế hoạch. Không ghép phát hành frontend/backend hoặc sửa danh sách dependency backup/recovery của runtime vào gói này.
- Bảng [các mục từng hoãn](./KE_HOACH_PHAT_TRIEN_SAU_BAN_DAU.md) đã sửa các trạng thái OAuth/Circle/OneDrive lỗi thời. Restore/RPO-RTO giữ miễn; retry/DLQ live và X giữ hoãn.
- Hồ sơ G5/G6 lịch sử vẫn giữ trạng thái/phạm vi cũ; hoàn tất gói này không phải một chứng nhận nghiệm thu toàn dự án.

Phần dưới là bản ghi ngày 21/10 theo đúng thời điểm, không dùng các bước tiếp theo đã cũ để mở lại công việc đã xong.

---

# Trạng thái hoàn thiện GroupDeal — 21/10/2026

Full CI 5e7a012 đã PASS và frontend đã cập nhật; xem [báo cáo hiện tại](./HOAN_THIEN_CI_2026-10-21.md). Chưa chốt nghiệm thu toàn dự án.

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
| CI provider | Đã nối backend, Worker và conformance vào pipeline; các nhóm liên quan đạt | Giữ tích hợp trong kiểm tra candidate cuối |
| CI tổng hợp | Full CI 5e7a012 đạt 77/77 bước; browser 989 PASS/67 SKIP trong một lượt; mode riêng đạt | Giữ đúng source và [bằng chứng CI](./HOAN_THIEN_CI_2026-10-21.md) |
| Bàn giao | README và bảng hiện tại đã cập nhật theo các bằng chứng mới | Giữ runbook và artifact đúng candidate khi chốt |
| G5/G6 cuối | Còn mở | Chốt candidate, CI sạch và rà soát độc lập theo phạm vi còn hiệu lực |
| Mainnet | Giai đoạn WP30 riêng | Chưa triển khai hoặc mở rộng quyền ở gói này |

## Việc được tiếp tục ngay

1. Full CI trên checkout sạch đã đạt. Giữ pipeline provider backend/Worker/conformance và wallet login; chỉ chạy lại phạm vi khi có thay đổi hoặc lỗi mới.
2. Giữ README và bàn giao đúng trạng thái domain/OAuth/OneDrive/Circle/Webhook đã có. Phân biệt commit mã đã kiểm, commit đang chạy trên VPS và phạm vi proof còn mở.
3. Chỉ sửa thêm chức năng khi có lỗi hoặc khoảng trống cụ thể. Các phát hiện lịch sử đã được sửa không tự trở thành backlog mới; không chạy lại mọi nhóm kiểm tra đã đạt nếu không bị tác động.
4. Sau khi mã nguồn ổn định, chốt candidate và thực hiện CI/rà soát cuối. Giữ riêng các nhánh kiểm thử người dùng hoãn; không ghi dự án đã nghiệm thu khi còn điều kiện chưa xử lý.

## Giới hạn bảo toàn

Đơn #7 đã claim đủ: buyer 0,04 USDC, seller 0,16 USDC. Tổng phí mạng gói trước là 0,04969549775452 USDC testnet. Không dùng lại ngân sách đó để tạo giao dịch mới. Các đơn 1–7 và 95 tác vụ đang giữ được giữ nguyên.

Gói hoàn thiện hiện tại sửa CI/fixture, bổ sung danh sách dependency backup/recovery bị thiếu và sửa lỗi tràn điều hướng khi phóng to chữ. Frontend 5e7a012 đã deploy static, 181 tệp HTTPS khớp; các sửa dependency backup/recovery chưa rollout backend. Backend vẫn 4b5af76/PID1590135, 393 runtime và dữ liệu/ledger/95held giữ. Không nâng gói Cloudflare, thay DNS, tạo tài nguyên trả phí, restart ứng dụng hoặc phát giao dịch. Bằng chứng G5 hiện hành và nguồn bàn giao đọc từ CURRENT tại root `reports/evidence`; checkout mã nguồn không chứa toàn bộ artifact live.

**NOT_FROZEN / G5 OPEN / G6 OPEN / acceptanceEligible=false / wholeProjectAccepted=false.**
