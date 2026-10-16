# Hoán đổi cùng popup; xem phí gửi/hoán đổi không tạo hoạt động

Ứng dụng `66b3d720dbf2a28edbd889b5931c2bfe9bcfabd4`, backup guard `12f341e453564827b84eababc099e250bf22bdef`, đã push lên nhánh codex/license-key-csv-studio và triển khai VPS ngày16/10/2026.

## Hành vi

- Thống nhất tên Hoán đổi. Nhập số lượng, đọc số nhận/minimum/phí, bấm Cấp quyền rồi bấm Hoán đổi ngay trong cùng popup. Không chuyển sang màn review thứ hai, không tự ký bước tiếp. Quyền đã đủ thì chỉ cần Hoán đổi. Ví/OTP vẫn do user điều khiển.
- Tái sử dụng logic ký/phục hồi hiện hành qua panel inline; giữ exact amount/spender/fee cap/principal/nonce/hash và Circle resume/repair. Spender có link explorer ghi đủ địa chỉ trong accessible label. Mobile375 và desktop1440 đã xem ảnh; nút hiện trong khung900px, không che thông tin phí/quyền.
- Báo giá còn chưa bắt đầu được tự cập nhật khi hết hạn, chỉ lúc popup mở/hiện. Sau approve đã xác nhận, nếu quote hết hạn thì đọc trạng thái cũ, lấy preview mới dựa trên allowance hiện hành. Không đổi quote/MAC/nonce/hold của bản đã ký và không tự gọi START/READY/ký swap. Approve đã có vẫn được giữ trong lịch sử với nhãn Đã cấp quyền · chưa hoán đổi. Một preview nối tiếp có thể thành hoạt động swap riêng khi user thực hiện.
- Gửi USDC cũng dùng preview: nhập người nhận/số lượng và kiểm phí chưa tạo hoạt động. Chỉ bấm nút thực hiện mới bắt đầu lưu yêu cầu, sau đó giữ cơ chế READY và ký hiện hành.

## API và lưu trữ

POST `/api/wallet/flows/preview` dùng kiểm ý định, balance/route/quote/fee hiện hành, nhưng không ghi walletFlows hoặc signerReservations, không audit giao dịch. Rate budget vẫn được lưu để giữ giới hạn request. Preview tạm trong RAM tối đa1024, bound account/wallet/APP session/recovery context, TTL tối đa60s; không chứa secret trong DTO. ID lặp cùng ý định trả cùng preview, thay ý định bị từ chối.

POST `/api/wallet/flows/start` chỉ nhận previewId, kiểm auth/scope/TTL và lưu đúng preview server đã giữ. Không nhận calldata/amount thay thế, chưa giữ nonce hoặc gọi provider; READY vẫn là bước kiểm/giữ lượt ký riêng. START idempotent cho cùng yêu cầu. Thời gian hoạt động được ghi khi START. Cache mất sau restart/hết hạn thì cần cập nhật báo giá, không tạo yêu cầu hoặc hold từ dữ liệu client.

API quote cũ vẫn giữ để tương thích bundle đang mở. History lọc tại SQL trước LIMIT/cursor: chỉ trả record có ít nhất một step khác PLANNED. Không xóa/migrate các quote cũ. Giữ tất cả SIGNING/SUBMITTED/CONFIRMED/REVERTED và hoạt động chỉ mới approve. Chỉ xem phí không chặn giao dịch khác. Khi đã giao quyền ký nhưng kết quả chưa rõ, request/hold vẫn giữ để phục hồi; không tự giải phóng chỉ vì đóng popup/hủy UI/timeout.95held worker jobs là phạm vi khác và không được sử dụng làm test.

## Kiểm và triển khai

Backend37service+12API cases đạt bằng store/RPC/provider fixture cô lập. Gồm preview không tạo history/hold, session/owner/expiry/restart, START idempotency, legacy quote không chiếm cursor, các guard READY/receipt/Circle resume/repair cũ. Backend build và frontend typecheck/build đạt.

34ca dev wallet và3ca built routes có kết quả đạt qua các lượt scoped; không chạy toàn dự án/CI. Giữ các lượt thất bại đầu: fixture collection optional chưa tạo, fixture ghi ledger sai cổng scoped, assertion timestamp START cần khác preview, selector nút vô hiệu cũ, thiếu CTA đăng nhập guest, init script fixture chạy nhầm vào iframe Circle có storage sandbox. Đã sửa đúng lỗi/fixture, rerun phần liên quan; không bỏ assertion pageerror hoặc nới guard tài chính.

Backend native upgrade lúc08:56:54Z:6file source/compiled được ghim, private restore/conservation/reconciliation HEALTHY; wallet ledger35flows/49reservations giữ nguyên hashdfca739d…ab9a14,95held giữ nguyên. Counts19users/4campaigns/5orders/36Huboperations/6grants/12license. Native drill-CzYL95, PID3632826/NRestarts0, maintenance12.835s. Nâng backend đổi auth recovery context nên phiên cũ cần đăng nhập lại một lần. Idle24h/absolute7ngày không đổi.

Backup sau nâng source đúng66b3d72, VERIFIED/privateRestore/BACKUP_CURRENT, SHA c40b93ab87d70fa36303d91027788422946014fd46352a3dd7e47c7c86861e2b. Ba timer active. Lần gọi upgrade đầu dừng trước PRECHECK do thiếu manifest trong incoming; đã chuyển manifest và hash trước lần nâng thực. Gói static đầu dừng ở guard do HEAD là ops commit; đã kiểm backend/frontend không diff từ app commit rồi đóng gói. Không có thêm outage từ hai lần dừng này.

Frontend90file delta/181full, hash cài đặt khớp; public index/app/WalletPage/AccountPage/SupportPage/CSS và4route200, health200, wallet/reauth/preview/start guest401. Nginx không đổi, asset cũ còn. Static rollback frontend-wallet-inline-7jHbFW/before; backend pre-start rollback .cache/hosted-upgrade-wallet-inline-t9X8vB/before, không restore DB cũ sau khi writer mới đã chạy.

Đọc SQLite mới chỉ read-only, không app/store:35walletFlows gồm24quote-only được lọc và11activity (9confirmed,2approve chưa swap,0SIGNING/SUBMITTED tại thời điểm08:59:51Z). Đây là đối chiếu dữ liệu/SQL và runtime bytes, không là proof UI đã đăng nhập mới hoặc giao dịch tài chính live trên bản này. Không assistant ký, tạo challenge, broadcast, replay đơn1–5, release held hoặc export credential/backup.

G5/G6 và candidate freeze vẫn OPEN/NOT_FROZEN. Circle swap/cirBTC live, admin/email/Safe/offhost/RPO–RTO và phần còn thiếu trong R5–R7 tiếp tục theo kế hoạch. Packet mới được ghim trong CURRENT_WALLET_PREVIEW_INLINE_LATEST/CURRENT_UI_WALLET_LATEST ở workspace bàn giao.
