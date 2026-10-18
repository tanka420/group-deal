# PUBLIC/UNLISTED và product/rights: kiểm API hiện hành — 18/10/2026

19 GET không cookie/token/đăng nhập tại https://groupdeal.thanhtan.top đã khớp metadata read-only của VPS lúc 2026-10-18T04:32:36.741Z. Campaign1 PUBLIC xuất hiện ở /api/v1/catalog, /api/v1/campaigns và /api/campaigns; campaign2–4 UNLISTED không xuất hiện trong cả ba danh sách nhưng detail JSON v1/legacy và widget-data đều200 qua link trực tiếp. Catalog đã đọc hết (limit100, hasMore=false, nextCursor=null), count/gross chỉ scope PUBLIC khớp; không nhầm tập discovery với mọi campaign. Dữ liệu catalog tự khai INDEXER/financialStateChainVerified=false, không phải chứng nhận số dư onchain.

Cả4campaign FINALIZED/VERIFIED_PUBLISH; product version/license version/content hashes/rights snapshot/owner binding/validUntil/APPROVED/terms/status khớp dữ liệu native hiện hành. Cả bốn dùng cùng1product version và1rights record; không suy ra đã kiểm mọi loại license hoặc phân phối. Widget giá final-clearing khớp projection, purchaseHeld=true và không next tier. Không thực hiện thay đổi rights, không tạo approve/revoke/expired state.

Ba GET cho ID không tồn tại trả404; override visibility=UNLISTED không hỗ trợ ở catalog trả400/VALIDATION. Mọi response no-store và không có trường bí mật trong danh sách kiểm đã định nghĩa. Chỉ lưu route/status/hash/byteLength/keys/checks và metadata whitelist; không lưu toàn response hoặc đọc license/key/resource/template/email/credential. Kiểm field denylist có phạm vi hữu hạn, không gọi là audit bí mật đầy đủ.

SQLite read-only/BEGIN, before/after metadata giống nhau. Ledger52flows/64reservations giữ SHA256 209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4;95held giữ. Backend30fea223380affc471cc91f4ab2390814ddaa87c,377runtime và6source hashes của public routes/DTO/pagination/catalog khớp admission. Checkout trước gói 2599953a10f9bb71d2fffa8fcbb5385572f68a58 sạch. Không source/deploy/restart/test/CI, app/DB local snapshot, OTP/ký/broadcast, POST/PUT/provider create/email hoặc replay giao dịch/đơn.

Hồ sơ publish campaign3 ngày12/10 và4reference focused public-rights/catalog fixtures được hash-check, kế thừa đúng tầng. Lần GET này không phải current authenticated seller publish/edit/concurrent command, không là current frontend/session/device recovery. PRIVATE là trạng thái phòng vệ không truy cập, không thêm lựa chọn publish; private/draft/unbound/mixed deployment/archived negatives vẫn giữ fixture/historical scope. Các nhánh rights mutation/revocation/expiry/alternate licensing/distribution còn OPEN.

Runtime public185/PID97197/backup VERIFIED/privateRestore/BACKUP_CURRENT quan sát04:21UTC kế thừa; gói này đọc lại runtime377 và metadata, không gọi backup/Safe đã đọc mới. Safe3owner signatures verified và user xác nhận3người khác nhau; không còn chờ ký lại hoặc giữ kết luận1người. Danh sách việc người dùng đã được viết lại theo trạng thái hiện hành; hồ sơ lịch sử/hash giữ nguyên.

Circle/admin live tiếp tục hoãn; username/social POST-V1. Offhost/RPO/RTO, email nghiệp vụ/inbox, provider/receiver độc lập và các branch live còn thiếu vẫn OPEN. NOT_FROZEN;G5/G6 OPEN;acceptanceEligible=false;wholeProjectAccepted=false.

Proof: reports/evidence/public-branches-readonly/2026-10-18T04-32-35-608Z/CHECKS.json
SHA256: 116e524bee9bb3ee34634e4f0e4d9a1f12bc97684f0a7afe2912d62a97f08300
