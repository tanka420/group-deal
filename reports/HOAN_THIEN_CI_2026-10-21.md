# Tiến độ hoàn thiện CI — 21/10/2026

Đã hoàn tất vòng sửa và phủ browser cục bộ qua các lượt; **chưa có một full CI PASS trên commit cuối, chưa triển khai các sửa mới**. Gói bằng chứng pha này còn mở và không thay gói đã niêm phong.

## Mã nguồn đã sửa

- Nối provider backend, Worker Cloudflare và conformance vào pipeline và workspace install chung. Bổ sung bước wallet-login-browser để 14 ca SDK ví có cấu hình luôn chạy trong CI chung.
- Thêm 3 dependency thiếu vào input của 5 service backup/recovery và script drill. Delta AST chỉ thêm 21 đường dẫn literal; 15 ca freshness và các nhóm recovery liên quan đạt. Không sửa logic phân quyền hoặc giao dịch.
- Sửa header khi chữ 200%: tràn điều hướng tại 768px và logo/menu chồng nhau tại 375px. Giữ font/nội dung, cho nhóm xuống dòng. Các ca geometry, thông báo, phí và điều hướng liên quan đạt; frontend build 14185af đạt.
- Sửa fixture theo phiên ADMIN riêng, URL chuẩn, bảng chiến dịch, form/preview, menu tài khoản và DTO username hiện hành. Giữ exact command/receipt/checkpoint, số lần POST/broadcast và chặn kết quả của phiên cũ.
- Support fixture dùng authRouter thật, authority testnet được bind vào manifest cô lập và APP/ADMIN tách riêng. Khi mất quyền, ADMIN không đọc dữ liệu; APP chỉ truy cập ticket thuộc mình. Không nới middleware runtime. 11 ca support và 14 ca liên kết ví đạt.
- Ghim EOL 5 tệp CSV Studio: checkout Windows/LF đều tạo ZIP 6.594 byte, SHA256 1edbbab6f3b6665132699f23f3fd2d05a1dcb78574751b66d236268fc702c6da. Giữ CSV BOM/CRLF.

## Kết quả và giới hạn

- Browser mặc định: **989 ca khác nhau PASS, 67 SKIP, không còn ca chưa được phân loại** trong 1.056 ca hiện hành, tổng hợp theo proof/commit. Lượt cuối trên cc397b8 có 62 PASS/67 SKIP, nguồn giữ nguyên. Không gọi tổng cộng này là một full-run trên commit cuối.
- 67 SKIP gồm 20 hành trình bridge mới đã bị sản phẩm vô hiệu hóa, 10 checkout, 6 built-page, 16 external fee và 15 Reown cần cấu hình riêng. Các nhóm 10/6/16 đã có proof ở mode tương ứng; Reown mới nhất đạt **14 PASS/1 SKIP** trên bước pipeline wallet-login-browser của 1ab0ac9. Tổng **21** hành trình bridge mới chưa khả dụng là SKIP_NOT_PASS; không phải hoãn mới do người dùng, không tự bật lại.
- 9 nhóm backend từng lỗi đã chạy lại đạt; 52 nhóm khác đạt trước đó. SDK/package, Worker 16 ca và conformance đạt. Đây là tổng hợp qua các commit, chưa phải full-run cuối.
- Tail pipeline trên f937a51 đạt các bước built-page/checkout/external-fee/fallback/secret scan (1.311 file, không finding). Backend build f937a51, frontend build 14185af và tooling test 1ab0ac9 đạt. Các artifact giữ source/timestamp gốc.
- Một ca Circle readiness từng FAIL trong bộ tổng rồi PASS khi chạy riêng không đổi mã. Nguyên nhân chưa xác định; giữ cả kết quả trong CIRCLE_READINESS_DIAGNOSTIC.json, chờ CI cùng source cuối để xác minh độ ổn định.
- Local Node 24.11.1 khác Node 24.21.0 của workflow. Bước tiếp theo là full CI Ubuntu trên commit cuối, sau khi tài liệu và source đã đồng bộ.

## Nguồn và bằng chứng

Checkout sửa mã: E:/apps/group-deal/.cache/ci/c-322e58ff, nhánh codex/license-key-csv-studio. Commit mã: **1ab0ac9fea4380b2457ff2ac630df547bf992c03**; commit tài liệu có thể đứng sau, không coi HEAD nào cũng đã chạy trên website. Checkout kiểm sạch: E:/apps/group-deal/.cache/ci/final-9dc63c98-1792575989483. Không stage/reset workspace gốc có thay đổi người dùng.

Pha mở: reports/evidence/final-candidate-ci/2026-10-21T09-46-29-482Z. BROWSER_DEFAULT_AGGREGATE_cc397b8.json và baseline V13 ghi từng proof/skip; các lượt FAIL/interrupted giữ nguyên. Bản nháp map 9358e59 kiểm 134 đường dẫn Git canonical, không thiếu; inventory không thay execution proof. Chưa có CHECKS.json, chưa thay CURRENT.

Gói completion trước giữ SHA256 956aa3cae19037e785ad9885dd62146ffb08287f445b39b793cab97da9de522b; H5 live giữ SHA256 56c27d9d0c6cc35e72da77544e642ac7be69640260ed732ac6b3ca1c59fedefe. Metadata providerBinding cũ được sửa trong bản nháp bằng 8 artifact live đã kiểm hash; không sửa gói cũ hoặc giả là live read mới.

Runtime website vẫn source 4b5af7604df53be680e7af9986d45810ac4d26e2 theo lần quan sát trước. Pha này chưa deploy/restart, không đọc lại toàn bộ live và không phát giao dịch.

## Phạm vi giữ nguyên

Retry/DLQ/redrive live **DEFERRED_BY_USER**, kiểm thử sau; chưa PASS. Diễn tập restore/RPO-RTO **WAIVED_BY_USER**; không mở lại. Giữ đơn 1–7, hai khoản claim đơn 7 và 95 tác vụ đang giữ. Không Mainnet, không nâng gói hoặc dùng dịch vụ trả phí.

**NOT_FROZEN / G5 OPEN / G6 OPEN / acceptanceEligible=false / wholeProjectAccepted=false.**
