> **Trạng thái hiện hành 24/10/2026:** Frontend `49f2719` và backend `f314de7` đã phát hành; CI mã ứng dụng 78/78 PASS. UI, dependency recovery và OneDrive/layout v2 đã hoàn tất trong phạm vi ghi nhận. Xem [trạng thái hiện hành](HOAN_THIEN_DU_AN_HIEN_TAI_2026-10-21.md) và [từng nhóm G5/G6 còn mở](PHAM_VI_G5_G6_CON_LAI_2026-10-24.md). Retry/DLQ live và X giữ hoãn; restore/RPO-RTO giữ miễn. Nội dung bên dưới là lịch sử theo thời điểm, không dùng các bước tiếp theo cũ để mở lại phần đã xong.

# Hoàn thiện CI và cập nhật frontend — 21/10/2026

**Full CI đã PASS trên commit 5e7a012c790084a6c7ff59dfc3e9f31a4764b3f2. Frontend của commit này đã lên https://groupdeal.tech; backend giữ 4b5af7604df53be680e7af9986d45810ac4d26e2.**

[GitHub Actions — full CI](https://github.com/tanka420/group-deal/actions/runs/39610131943) chạy Ubuntu 24.04 / Node 24.21.0, đạt đủ **77/77 bước** trên cùng source; tooling guard, contracts/model, backend, SDK, Worker/conformance, build và browser đều đạt. Browser mặc định **989 PASS / 67 SKIP** trong một lượt 1.056 ca. Các mode riêng: built-page 6 PASS; wallet login 14 PASS/1 SKIP; checkout dev 10 PASS; external fee 16 PASS; checkout production 10 PASS; fallback 24 PASS. Quét 1.312 tệp không có finding. 21 hành trình bridge mới chưa khả dụng vẫn SKIP_NOT_PASS; CI xanh không biến các ca này thành PASS.

Đã sửa danh sách dependency thiếu của 5 service backup/recovery, nối các kiểm tra provider và wallet login vào pipeline, sửa fixture ADMIN/APP, URL/form/checkpoint hiện hành và EOL gói CSV Studio. Runtime frontend chỉ đổi CSS header để chữ 200% xuống dòng đúng trên desktop/mobile. Các ràng buộc signer, quyền, receipt, nonce và hợp đồng tài chính giữ nguyên. Những lượt lỗi trước và chẩn đoán Circle readiness vẫn được lưu; lượt backend tổng cuối đã đạt, chưa kết luận nguyên nhân flake ban đầu hoặc độ ổn định ngoài lượt này.

Frontend production build có 182 tệp, dùng hai biến public đã đối chiếu fresh live. Precheck đầu tiên dừng trước kích hoạt vì CRLF của logo và hai tệp giấy phép font trên Windows khác byte LF đang chạy. Đã lấy ba blob public canonical từ đúng Git commit, chứng minh chỉ đổi CRLF→LF và trùng hash live; giữ nguyên immutable collision guard. Lượt sau triển khai static đạt lúc 14:39:32 UTC. Thêm 87 asset, giữ toàn bộ asset lịch sử và bốn tệp Safe; tổng public 4.025→4.112 tệp. Ba entry index/fallback/manifest có bản rollback riêng.

Đối chiếu sau triển khai: 182 tệp build đúng byte tại VPS; 181/181 tệp public đúng hash qua HTTPS; health 200, metadata build 404, guest webhook 401. Backend 393 tệp giữ hash, PID 1590135/restarts 0, Nginx giữ nguyên. Hash toàn bộ 7 record đơn hàng và ledger trước/sau khớp; 20 user/7 campaign/7 order/50 operation/8 grant/12 inventory, 53 wallet flow/80 reservation và 95 held giữ. Đây là readback mới 14:29–14:42 UTC, không phải xác minh lại receipt/finality của các giao dịch lịch sử.

Các sửa dependency backup/recovery đã được kiểm trên source nhưng **chưa rollout vào backend đang chạy**. Backup guard vận hành vẫn bind backend 4b5af76; cần một gói nâng cấp runtime riêng đúng admission/intake và guard nếu triển khai phần này. Pha hiện tại không restart backend, gọi backup/offhost thủ công, diễn tập restore, đổi env/DNS/billing, tạo đơn hoặc phát giao dịch. Không dùng lại ngân sách testnet đã kết thúc của đơn 7.

Bằng chứng mới ở reports/evidence/final-candidate-ci/2026-10-21T09-46-29-482Z; CHECKS và các CURRENT ở workspace gốc là điểm tra cứu sau khi niêm phong. Checkout nguồn chỉ chứa tài liệu, không chứa toàn bộ artifact live. Gói parent completion và provider-live giữ nguyên hash; pointer H5 live vẫn trỏ gói giao dịch thật trước đó. Source CI là 5e7a012; commit bàn giao đứng sau chỉ đổi tài liệu, không gọi commit tài liệu là source đã chạy lại full CI.

Retry/DLQ/redrive live **DEFERRED_BY_USER — kiểm thử sau**; restore/RPO-RTO **WAIVED_BY_USER**; X hoãn vì chi phí. Các nhánh G5 còn thiếu và rà soát độc lập G6 vẫn mở. Không Mainnet, nâng gói hoặc dùng dịch vụ trả phí.

**NOT_FROZEN / G5 OPEN / G6 OPEN / acceptanceEligible=false / wholeProjectAccepted=false.**
