# R5–R7 — chia sẻ và bố cục deal ở cỡ chữ 200%

Baseline checkout `d7aec73`; frontend đang phục vụ `2761137`, backend `324bca2`, ops `28f62e0`. Chỉ sửa checkout sạch `.cache/ci/c-322e58ff`. Preflight VPS xác nhận 377 runtime/181 public khớp, PID 3655922/NRestarts 0, backup VERIFIED/privateRestore/BACKUP_CURRENT, 95 held giữ. Ngày báo cáo là 17/10 theo UTC+7; timestamp artifact/CI dùng UTC.

Proof trước của chia sẻ có export/guard public/private và 7 độ rộng, chưa có kiểm chữ 200% với nhãn, số tiền dài, field/error focus và ngữ cảnh khi quay về deal. Ca mới tái hiện document rộng 400px ở viewport 375px: nút breadcrumb rộng khoảng 376px từ x=24. Một span của CTA mua cố định đi tới x≈505 trong tiếng Việt/x≈448 trong tiếng Anh; phần tử fixed này không làm tăng documentWidth nên chỉ kiểm documentWidth sẽ bỏ sót. Ảnh còn cho thấy cột giá quá hẹp, chữ ở summary và nút Chia sẻ bị cắt/chia vụn.

Sửa CSS hiện có: breadcrumb và nút trong purchase panel được xuống dòng trong width khả dụng; SVG không bị co nhỏ. CTA mobile cho price/label xuống hàng và giới hạn span trong nút. Share detail-list và summary của purchase panel chuyển một cột trên mobile để nhãn/giá có đủ chiều rộng. Không đổi text, số tiền/base units, quote, điều kiện mua, request, checkpoint hoặc authorization. Không sửa ShareModal/backend/widget HTML/PNG renderer.

Hai ca mới VI/EN dùng snapshot UNLISTED, title dài hợp lệ và số `900719925474099312.345678 USDC`: nhãn nguyên từ, đúng giá/rebate/fee, không chồng label/value, focus đủ field và alert ở chữ 200%, public read không auth/cookie, copy được xác nhận, private response xóa stale exports, refresh phục hồi, Tab/Escape trả focus đúng trigger, nội dung CTA nằm trong nút và financial checkpoint giữ nguyên. Giữ các lần fail/đo đạc và ảnh số đo PASS nhưng CTA còn clipped; không coi numeric PASS thay việc xem ảnh.

Hồi quy hẹp: 7 ca share cũ (canonical link/iframe, QR và PNG 1200×800, clipboard denial, malformed/private/mixed-deployment, finalized/huge/missing origin, late response, 7 widths/keyboard) và 6 ca join (focus/consent, TERMS_REVIEW/CLOSED/SOLD_OUT/RIGHTS, exact USDC/claim copy). Không chọn nhóm native loopback HTML widget vì backend/widget HTML không đổi. Các API đều là fixture; không mở DB hoặc gọi ví thật.

CI manual `r7-share` chỉ chạy guard tooling, frontend typecheck/build, 9 share dev, 6 join dev, 9 share bản build, có baseline/allowlist/hash trước–sau. Dependency khóa và Action ghim SHA. Source dùng `[skip ci]` để tránh auto full; không ghi CI/triển khai PASS trước khi xác minh đúng SHA.

Gói này chỉ bổ sung kiểm R5/R6/R7 trong phạm vi chia sẻ/deal reflow. Chưa có hành trình mua/chia sẻ seller/admin thật trên bundle mới, toàn-app/cross-browser/OS scaling, hoặc financial reconciliation. Admin authenticated vẫn hoãn theo user; Circle chiều ngược/cirBTC/email nghiệp vụ, Safe control/custody/emergency, offhost/incident/RPO–RTO và G5/G6 còn OPEN/NOT_FROZEN. Không replay hoặc giải phóng 95 held.

Đã triển khai frontend `aa7bff7`, giữ backend `324bca2`. [CI 38937776676](https://github.com/tanka420/group-deal/actions/runs/38937776676) PASS đúng SHA. Proof reports/evidence/r7-share-deal-reflow/2026-10-16T17-16-09-037Z/CHECKS.json; SHA256 `87e85713aa30ace7989ea73184369192727941ff52ed5e86fd3214e486f9ef78`. NOT_FROZEN; G5/G6 OPEN.
