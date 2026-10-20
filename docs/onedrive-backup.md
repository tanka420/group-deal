# Backup OneDrive và diễn tập phục hồi

Giữ 3 archive mã hóa đã kiểm trên VPS. Bản trên OneDrive dùng tên riêng theo owner của bộ backup và chỉ thêm mới; job không xóa remote, không sync/move, không tải `.env`, khóa giải mã hoặc cấu hình OAuth lên cloud. Cần theo dõi dung lượng OneDrive vì chưa bật dọn tự động trên cloud.

`hosted_offhost_backup.cjs` chỉ nhận `LATEST.json` hợp lệ của bộ backup cục bộ, yêu cầu private restore đã đạt và ciphertext còn đúng hash. Sau upload, nó tải ngược archive và manifest để so kích thước/SHA-256 rồi mới ghi receipt offhost. Lặp cùng bản không ghi đè; nội dung remote khác hash bị từ chối. Nó không mở DB ứng dụng và không bật writer/worker.

## Phần người giữ tài khoản Microsoft thực hiện

1. Mở PowerShell trên máy có trình duyệt, chạy `ssh -L 53682:127.0.0.1:53682 tan-picks`. Giữ cửa sổ này mở. Tunnel chỉ nghe loopback, không mở cổng public của VPS.
2. Trong shell VPS vừa mở, chạy:

   ```sh
   sudo -u ubuntu /usr/bin/rclone config --config /home/ubuntu/groupdeal/operations/offhost/rclone.conf
   ```

3. Chọn tạo remote mới, tên chính xác **gd_onedrive**, storage **Microsoft OneDrive** (`onedrive`). Để trống client ID/secret để dùng ứng dụng rclone; không chọn advanced config. Chọn đúng cloud vùng tài khoản, thường Microsoft Cloud Global.
4. Khi hỏi auto config / dùng trình duyệt, chọn **Yes** vì đã có SSH tunnel. Mở URL `http://127.0.0.1:53682/auth?...` do rclone hiện trong trình duyệt máy Windows, tự đăng nhập Microsoft và đọc quyền trước khi đồng ý. Không gửi URL, code, token, password hoặc nội dung config vào chat.
5. Chọn đúng OneDrive của mình trong danh sách do rclone đọc, xác nhận cấu hình và thoát. Báo **“Đã cấu hình gd_onedrive”**. Nếu lỗi, chỉ gửi mã lỗi đã bỏ thông tin bí mật. Agent sẽ tự kiểm mode/drive binding, upload/hash và bật lịch sau khi lần đầu đạt.

Không cần cài rclone trên Windows với cách dùng SSH tunnel này. Nếu cổng local53682 đang được dùng, dừng và để agent đổi cách xác thực; không mở listener public hoặc bỏ kiểm TLS.

## Các bước agent thực hiện sau khi cấu hình

- Kiểm source/runtime/CURRENT/hash và file config600, ownerubuntu. Không in token. Remote phải đúng typeonedrive và drive ID cố định; token refresh được phép, đổi drive giữa chừng bị từ chối.
- Chạy `sudo systemctl start groupdeal-offhost-backup.service`. Đọc receipt `/home/ubuntu/groupdeal/operations/offhost/LATEST.json` để xác nhận round-trip2file. Giữ 3 bản managed cục bộ và archive không được quản lý.
- Khi đạt, bật `sudo systemctl enable --now groupdeal-offhost-backup.timer`. Lịch vào phút10 mỗi giờ, sau backup local mỗi giờ. Chưa có consent/receipt thì timer được cài nhưng giữ disabled; đây là phụ thuộc đăng nhập, không phải quyết định hoãn phạm vi.
- Sau lần đầu đạt, cài `scripts/systemd/groupdeal-health-probe-offhost.conf` thành `/etc/systemd/system/groupdeal-health-probe.service.d/offhost.conf`, daemon-reload và kiểm probe. Không bật trước khi upload đầu đạt. Lúc đã bật, receipt thiếu, sai hoặc quá150phút phải tạo ATTENTION và đi qua policy cảnh báo hiện có; không coi healthHTTP200 là bằng chứng offsite tốt.
- Ghi version/hash rclone, source/hash helpers, archive/manifest/remote round-trip và CURRENT. Không dùng thời gian upload làm RTO hoặc khẳng định offhost private restore đã đạt.

## Phục hồi ngoài VPS / đo RPO, RTO

Cần một máy hoặc VM độc lập, thư mục riêng và người giữ khóa khôi phục. Không sao chép `.env`, private key signer hoặc token provider sang máy thử. Người giữ khóa đưa khóa giải mã cần thiết qua kênh riêng; không gửi khóa vào chat. Nếu thiếu máy/kênh giữ khóa thì giữ mục phục hồi này OPEN, không thay bằng drill trên cùng VPS.

Agent ghim ciphertext/manifest từ OneDrive và kiểm hash; phục hồi trong thư mục cô lập bằng đúng source/dependencies đã ghim; giữ auth recovery barrier, toàn bộ held jobs và tắt outbound mail/webhook/provider/financial worker. Kiểm SQLite/audit, mọi trường private, counts, request/checkpoint/nonce/ledger; đối soát canonical cùng block qua read-only RPC. Không seed/reset, không promote, không có hai writer. Đánh dấu thời điểm incident, điểm dữ liệu gần nhất phục hồi được và thời điểm đạt tiêu chí ready để tính RPO/RTO. Báo cáo phải nêu tiêu chí đo và giới hạn, cần review độc lập trước khi đóng G5-14.

Kiểm nguồn: `node --test scripts/hosted_offhost_backup.test.cjs scripts/hosted_backup.test.cjs scripts/observe_hosted_health.test.cjs scripts/hosted_alerts.test.cjs`. Fixture không liên hệ Microsoft/SMTP và không tải backup thật.

Tài liệu chính thức: [OneDrive backend](https://rclone.org/onedrive/), [headless / SSH tunnel](https://rclone.org/remote_setup/), [copyto](https://rclone.org/commands/rclone_copyto/), [cat](https://rclone.org/commands/rclone_cat/).
