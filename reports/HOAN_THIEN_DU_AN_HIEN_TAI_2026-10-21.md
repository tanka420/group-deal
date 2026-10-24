> Bổ sung sau review 24/10/2026: candidate **8c32212** đã sửa F1/F2 và lỗi focus/reflow liên quan, full CI **78/78 PASS**, preflight VPS đạt. **Chưa phát hành:** activate bị duyệt tự động chặn, cần tin nhắn phê duyệt trực tiếp SHA và restart backend. VPS vẫn FE 49f2719 / BE f314de7. Xem [báo cáo thực thi/candidate ledger/acceptance matrix](THUC_THI_SAU_REVIEW_2026-10-24.md). G5/G6 OPEN và các cờ nghiệm thu vẫn false; nội dung dưới đây giữ theo thời điểm gốc.

# Trạng thái hiện hành — 24/10/2026

## Phát hành đã hoàn tất

| Thành phần | Phiên bản / kết quả đã xác minh |
|---|---|
| Frontend | `49f2719d8c114bb380a16ab87c128b740c47dadc`, VPS và local đã cập nhật |
| Backend | `f314de7fc47b77055b25615209dbdb8bd867853e`, đã gồm API workspace và dependency recovery |
| CI mã ứng dụng | [49f2719 — 78/78 PASS](https://github.com/tanka420/group-deal/actions/runs/40063311147); backend/workspace [f314de7 — 78/78 PASS](https://github.com/tanka420/group-deal/actions/runs/40002078347) |
| Đối chiếu frontend 24/10 | 185 file HTTPS đúng hash; 22 tuyến/ranh giới HTTP; header desktop/mobile đạt; vận hành UP |
| OneDrive | Layout v2 đã triển khai; 56 cặp lịch sử được tổ chức/kiểm hash; 4 archive thiếu manifest giữ riêng; backup/offhost sau nâng backend đã xác minh |

Gói UI gồm danh sách/phân trang, giao dịch mua bán GroupDeal, `@handle` tạo một lần, thông tin tier, tổng quan/sidebar người bán, tab quyền quản trị và footer/ticket. Bản header mới dùng dropdown bám header khi cuộn, VI/EN công khai trước chuông và menu desktop căn giữa. Xem [gói UI/phát hành](../docs/workspace-ui-2026-10-22.md).

Gói backend/workspace đã phát hành trước; bản header ngày 24/10 chỉ thay frontend, giữ backend/PID và không đổi database/nginx. Biên bản VPS riêng: `operations/WORKSPACE-RELEASE.json` cho gói backend/workspace và `operations/FRONTEND-RELEASE.json` cho frontend mới nhất. Không còn backlog triển khai UI hoặc dependency recovery được ghi ở các báo cáo ngày 21/10.

## Phần còn mở và các quyết định phạm vi

- [Bảng G5/G6 chi tiết](PHAM_VI_G5_G6_CON_LAI_2026-10-24.md) đối chiếu từng nhóm bằng chứng còn thiếu; không mở lại chức năng/giao dịch đã hoàn tất. CI và bản phát hành đã chốt theo đúng phạm vi, chưa tự trở thành nghiệm thu live toàn dự án.
- G6 còn chốt bộ candidate và acceptance matrix, rà soát độc lập, issue ledger/runbook và ký nhận bàn giao. Chưa thực hiện các bước đó trong gói đồng bộ tài liệu.
- Retry/DLQ live và X: **DEFERRED_BY_USER**. Restore thủ công và đo RPO/RTO: **WAIVED_BY_USER**. Mainnet/WP30 ngoài phạm vi gói hiện hành.
- Giữ các bằng chứng Circle, GitHub/Discord, admin/quyền/ticket/email và giao hàng đã có; không lặp đơn 1–7 hoặc giải phóng 95 tác vụ đang giữ. Không tự tái sử dụng ngân sách/chữ ký cho ca mới.
- Hai con trỏ private `CURRENT_G5_PREPARATION_LATEST.json` và `CURRENT_PROJECT_COMPLETION_LATEST.json` được đồng bộ sang chỉ mục ngày 24/10, kế thừa nguyên bằng chứng live ngày cũ và nối thêm biên bản phát hành mới. Các artifact private không thuộc Git.

**G5 OPEN / G6 OPEN / candidateFrozen=false / acceptanceEligible=false / wholeProjectAccepted=false.** Đây là trạng thái hồ sơ nghiệm thu tổng thể, không phải trạng thái hoàn thành của gói UI/OneDrive/phát hành đã xong.

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
