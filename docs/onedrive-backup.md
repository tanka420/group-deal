# Backup OneDrive

## Trạng thái hiện hành — 23/10/2026

OneDrive **đã hoạt động**: `gd_onedrive` đã có consent, upload/tải ngược kiểm SHA-256, lịch phút 10 mỗi giờ và giám sát độ mới. Không còn công việc cấu hình, consent hoặc xây lại chức năng backup. Lượt 23/10 chỉ chuẩn hóa cấu trúc thư mục, quy tắc tên file và tài liệu; không thay ứng dụng, database, khóa hoặc chính sách giữ backup.

## Cấu trúc thư mục và tên file — layout v2

```text
GroupDeal/
  ArcTestnet/
    <owner-id>/
      YYYY/MM/DD/
        groupdeal-arc-testnet-backup-YYYYMMDDTHHmmssSSSZ-<sha256-16>.enc
        groupdeal-arc-testnet-backup-YYYYMMDDTHHmmssSSSZ-<sha256-16>.manifest.json
```

- `owner-id` là định danh ổn định của bộ backup, giữ tách biệt các bộ và môi trường.
- Ngày/thời điểm là **UTC của lúc tạo backup**, không phải lúc upload hoặc sắp xếp lại. `SSS` là mili giây; `Z` biểu thị UTC. Ví dụ ngày 23/10/2026: `2026/10/23/groupdeal-arc-testnet-backup-20261023T140001501Z-0123456789abcdef.enc`.
- Tên chỉ dùng ký tự ASCII, không khoảng trắng, dấu tiếng Việt, email, tên người dùng hoặc secret. Phần cuối là 16 ký tự đầu SHA-256 của ciphertext; kiểm chứng luôn dùng **toàn bộ SHA-256**, không chỉ tiền tố tên.
- Archive vẫn là nguyên ciphertext đã có. Manifest `GroupDealOffhostManifestV2` ghi tên archive mới, thời điểm, kích thước, SHA-256 đầy đủ, `sourceArchive`, hash và nội dung metadata của manifest nguồn. Không giải mã dữ liệu để đổi tên.
- Đường dẫn/tên được tính xác định từ metadata: chạy lại cùng backup không tạo bản trùng hoặc ghi đè file khác nội dung.

## Tổ chức các bản cũ

Helper có chế độ `--organize-existing` để đọc các archive/manifest cũ tại gốc `<owner-id>`, tạo bản sao vào layout v2 và tải ngược kiểm kích thước/SHA-256. Các đối tượng cũ được giữ nguyên để bảo toàn lịch sử và các receipt đã ghi trước đây; không `sync`, `move` hoặc xóa OneDrive.

Archive thiếu manifest được ghi riêng trong `unpairedArchivesPreserved`, giữ nguyên và **không** được coi là backup đã xác minh đầy đủ. Không tự tạo manifest mang trạng thái verified cho những file này. Lần kiểm kê đầu 23/10 thấy 60 archive, 56 manifest; kết quả áp dụng thực tế lấy từ receipt migration, không coi con số kiểm kê là kết quả migration.

Tác vụ xử lý tối đa 4 archive song song, thử lại có giới hạn khi gặp lỗi truyền tải OneDrive. `LAYOUT-PROGRESS.json` lưu từng cặp đã kiểm đủ hash; lần tiếp tục chỉ tái sử dụng bằng chứng nếu manifest nguồn, tên đích, kích thước và hash vẫn khớp, giữ nguyên thời điểm kiểm ban đầu. Lỗi hash/scope không được coi là lỗi truyền tải để thử lại.

Receipt riêng tại `operations/offhost/LAYOUT-MIGRATION.json` chứa ánh xạ tên cũ → thư mục/tên mới và hash. `LATEST.json` chỉ được cập nhật bởi luồng upload backup hiện hành sau khi round-trip đạt; việc tổ chức lịch sử không được làm mới giả thời điểm backup.

## Vận hành và giữ bản

- VPS vẫn giữ 3 archive managed đã xác minh. Tên file cục bộ `backup_<timestamp>_<uuid>.enc` không đổi; layout v2 chỉ áp dụng kho OneDrive.
- Kho cloud tiếp tục chính sách **chỉ thêm mới, không tự xóa**. Theo dõi dung lượng, nhất là khi giữ bản cũ cùng các bản đã tổ chức. Không tải `.env`, khóa giải mã hoặc `rclone.conf` lên OneDrive.
- Helper dùng đúng cấu hình OneDrive riêng, ghim drive identity; không nhận process-level `RCLONE_*` override. Sai scope, hash, drive hoặc nội dung xung đột sẽ dừng và giữ receipt thành công trước đó.
- Upload định kỳ vẫn dùng `operations/backups/backup.lock`. Tác vụ tổ chức lịch sử dùng `operations/offhost/layout.lock` riêng: nó chỉ đọc các bản cũ trên cloud và `OWNER.json`, không đọc/xóa archive local hoặc cập nhật `LATEST.json`, nên không chặn lịch backup. Phát hành helper và xác minh một upload layout v2 trước khi tổ chức lịch sử; các upload tiếp theo chỉ tạo tên mới ở thư mục ngày.
- Probe đọc được receipt v1 cũ và v2 mới; backup quá 90 phút hoặc offhost quá 150 phút vẫn báo ATTENTION theo chính sách hiện có.
- Bộ helper triển khai trên VPS phải gồm cả `hosted_offhost_backup.cjs` và `offhost_backup_layout.cjs`, đặt cạnh `hosted_backup.cjs`. Không cần restart backend để thay helper này.

## Phạm vi đã miễn/hoãn

Diễn tập restore thủ công và đo RPO/RTO đã được người dùng miễn. Retry/DLQ nghiệp vụ live đang hoãn. Chuẩn hóa kho OneDrive không mở lại các công việc đó và không thay đổi nghĩa vụ transaction recovery/reconciliation.

Hướng dẫn consent/cấu hình cũ trong báo cáo ngày 21/10 là tài liệu xử lý khi phải cấu hình lại, không phải việc đang chờ. Không yêu cầu Microsoft consent lại cho bộ hiện hành.

Kiểm tra phần bị tác động:

```sh
node --test scripts/hosted_offhost_backup.test.cjs scripts/hosted_backup.test.cjs scripts/observe_hosted_health.test.cjs scripts/hosted_alerts.test.cjs
```

46 kiểm tra đã đạt trong gói chuẩn hóa ngày 23/10; fixture không liên hệ Microsoft/SMTP, không tạo dữ liệu ứng dụng hoặc khôi phục database vận hành.
