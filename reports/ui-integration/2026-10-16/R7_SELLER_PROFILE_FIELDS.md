# R7 — lỗi trường hồ sơ seller và ngữ cảnh xem lại

Baseline checkout `c19c32a`; frontend đang phục vụ `7704cad`, backend `324bca2`, ops `28f62e0`. Trước thay đổi đã đọc lại trên VPS: 377 file runtime và 181 file public khớp, PID 3655922/NRestarts 0, backup VERIFIED/privateRestore/BACKUP_CURRENT, 95 held giữ nguyên. Root lịch sử không được dùng làm source; chỉ sửa checkout sạch `.cache/ci/c-322e58ff`.

Source/proof cho thấy `SellerProfileEditor` vô hiệu hóa nút khi tên trống/ngắn và dựa vào native validation, thiếu lỗi theo trường VI/EN. Proof trước có dialog/7 độ rộng và guard hồ sơ, chưa có cỡ chữ 200% cho trường và bước xem lại. Ca fixture mới tái hiện nút disabled, không có phản hồi sửa lỗi.

Đổi form sang lỗi theo trường với `aria-invalid`, `aria-describedby` và focus trường sai đầu tiên. Tên sau trim phải 2–80 ký tự, không chứa ký tự điều khiển; bio sau trim tối đa 2.000 ký tự với cùng tập ký tự được phép như backend. Payout phải nằm trong danh sách ví thuộc tài khoản đã được reader xác nhận. Khi inventory chưa tải hoặc rỗng, nút vẫn disabled; khi có inventory, người dùng được bấm xem lại để nhận lỗi rõ ràng. Mọi validation diễn ra trước UUID/checkpoint/request. Sửa trường nào xóa lỗi trường đó; UiMessage cho phép đổi VI/EN tại chỗ mà không gửi lại hoặc mất nội dung đang sửa.

Giữ nguyên schema/backend, principal, inventory reader, intent parser, payload ký, nonce, TTL, Circle session, explicit sign/commit/cancel và phục hồi GET. Không tạo persistence mới cho bản nháp chưa lập yêu cầu. Chỉ khẳng định giữ nội dung trong lúc sửa lỗi/đổi ngôn ngữ và giữ checkpoint tối thiểu của yêu cầu đã lập khi đóng/mở modal; không khẳng định bản nháp chưa lập được giữ sau khi đóng/reload.

Ba ca mới: VI/EN required/length/control characters/bio/payout, không ghi khi sai, focus/ring ở 375px cỡ chữ 200%, đúng payout và checkpoint qua xem lại/đóng/mở; inline profile đổi VI–EN–VI giữ lỗi/nháp/ví và không thêm request. Hồi quy hồ sơ kiểm 7 độ rộng, inventory khác tài khoản, phản hồi sai account/payload/purpose/chain, ACK hiện hành/cũ/khác tài khoản, thiếu ID, cancel và Circle signing session. Chữ ký trong ca dev là khóa fixture ngẫu nhiên tách biệt; ca này SKIP trên bản build và không phải bằng chứng ví thật.

Giữ các lần fail: baseline nút disabled và hai lượt dev/built fail do locator tiếng Việt sau đổi sang tiếng Anh. Sửa fixture bằng locator ổn định của editor/field; không sửa production để né lỗi test. Ảnh text200 đã xem: ô nhập/viền focus nhìn đủ, lỗi đọc được, nút ký/xác nhận xuống dòng trong modal.

CI manual `r7-profile`: guard tooling, frontend typecheck/build, đúng file `seller_profile.spec.ts` trên dev và bản build. Baseline/allowlist/hash source trước–sau, dependency khóa, Action ghim SHA; không full test/CI. Source dùng `[skip ci]` và dispatch scope này. Kết quả GitHub/triển khai chỉ được ghi sau khi xác minh đúng SHA và bytes.

Chưa nghiệm thu hồ sơ seller thật, OTP/ký/commit live, admin authenticated, toàn R5–R7/whole-app/cross-browser. Các nhánh G5, Safe control/custody/emergency, offhost/incident/RPO–RTO vẫn OPEN; candidate NOT_FROZEN. Không replay đơn/giao dịch đã hoàn tất hoặc giải phóng 95 held.

Đã triển khai frontend `2761137`, giữ backend `324bca2`. [CI 38934428712](https://github.com/tanka420/group-deal/actions/runs/38934428712) PASS đúng SHA. Proof reports/evidence/r7-seller-profile-fields/2026-10-16T16-50-25-407Z/CHECKS.json; SHA256 `94e9b7f59a8dee88a276bb4f28bf24227f5d4bd998a16510ee5c0746278d2549`. NOT_FROZEN; G5/G6 OPEN.
