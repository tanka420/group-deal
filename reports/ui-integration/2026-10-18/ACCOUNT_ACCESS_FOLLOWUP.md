# Người dùng/Phân quyền — gói tiếp nối 18/10/2026

Backend 30fea223380affc471cc91f4ab2390814ddaa87c, ops 73b6fae5a33eda1dfc9ab6c3364d9fcfa65809b8; frontend 8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07 giữ nguyên. Bản sửa đã push và triển khai trên VPS duy nhất.

Đã sửa lỗi đơn RESOLVED bị tính là nghĩa vụ mở sau khi seller rút đủ phần phân bổ. Tập trạng thái giao hàng cuối khớp domain/reconciliation: CONFIRMED, RESOLVED, BREACHED_REFUNDED. CANCELLED không là OrderRecord.deliveryStatus hợp lệ và tiếp tục bị chặn như trạng thái chưa xác minh. Chưa rút đủ, còn campaign, delivery/dispute hoặc operation đang chờ vẫn chặn thu hồi. Vai trò seller lịch sử được giữ, quyền hoạt động mới dùng sellerEnabled.

| Thao tác | API/capability và guard | Audit / giới hạn proof |
|---|---|---|
| Danh bạ/hồ sơ/ví/đơn/chiến dịch/hỗ trợ | GET operator/users và users/:id; ADMIN realm, current onchain controller + enrollment capability; cursor ràng buộc actor/session/revision/deployment | Read-only, không tự ghi sự kiện thay đổi quyền. 10 native HTTP/SQL fixture cases PASS; admin thật vẫn hoãn. |
| Hạn chế/gỡ hoạt động mới | POST operator/users/:id/access RESTRICT/RESTORE; committed ADMIN/session/capability, environment/target digest, UUID/lý do, self/controller protection | Account command + ACCOUNT_ACCESS_CHANGED nguyên tử; receipt cùng ID đọc lại bằng GET. 15 fixture cases PASS. |
| Cấp/thu hồi seller | Cùng access command GRANT_SELLER/REVOKE_SELLER; nghĩa vụ kiểm lại trong transaction; giữ role lịch sử | Lỗi RESOLVED đã sửa; partial claim/unknown/CANCELLED/submitted operation vẫn chặn. Không đổi quyền account thật. |
| Mua mới và publish chưa ký | OperationPreparation/Readiness kiểm committed access khi bắt đầu BUY/PUBLISH và trước handoff phù hợp phase | Request/nonce/checkpoint đã có tiếp tục cùng ID; không global-lock nghĩa vụ cũ. Proof guard lịch sử kế thừa, không gọi mọi recovery đã live. |
| Sản phẩm/phiên bản/quyền mới | ProductService kiểm access sau retained-command lookup; seller ownership/role, digest và command riêng | Command replay chỉ trả receipt cũ; không phát lại tài nguyên. Các fixture sản phẩm trước được kế thừa đúng scope. |
| Nháp/thay thế campaign mới | CampaignEditor/Replacement kiểm seller access; schema/terms/product rights/payout riêng | Không thêm tùy chọn PRIVATE: source cho PUBLIC/UNLISTED; private là nhánh từ chối/nháp. |
| Hồ sơ seller | SellerProfileRegistry kiểm prepare/commit mới; payout proof, context/base hash và phiên hiện hành | Seller profile commit/cancel audit riêng; không thêm username bắt buộc/social. |
| Ví, hỗ trợ, giao hàng, confirm/dispute và claim cũ | Giữ session/ownership/onchain principal và capability hiện có; restriction chỉ chặn hoạt động kinh doanh mới | Không cấp quyền tài chính mới; không xóa seller role/đổi owner đơn. Proof restricted-existing kế thừa. |
| Operator và Safe | Controller onchain + enrollment/current capability; roles[] không tự cấp operator | Không API cấp operator tùy ý, thay owner/threshold hoặc ký thay. |

Ca tái hiện trước sửa FAIL tại RESOLVED fully claimed. Sau sửa 15 account-access +10 directory/admin fixture cases PASS, backend build PASS. Giữ log FAIL và packaging precheck bị từ chối do so sánh frontend với backend commit cũ; đã sửa điều kiện baseline trước mọi deploy. Không full test/CI, không rerun UI.

VPS native upgrade đối soát HEALTHY tại finalized 67760896; allLiveFieldsPreserved/privateRecovery và ledger giữ nguyên. Maintenance 13182ms; PID 97197/NRestarts0; 377runtime/181public khớp. Backup đúng backend source VERIFIED/privateRestore/BACKUP_CURRENT, timers active. Ledger đọc lại 2026-10-18T01:23:28.886Z: 52flows/64reservations SHA256 209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4; 95held giữ. Read-only query trên source mới thấy 3 seller, 0 nghĩa vụ mở, 1 RESOLVED đã rút đủ; đó không là authenticated admin hay mutation live.

Nguồn hiện hành còn 0 account commands/0restricted. Circle reverse không có record, cirBTC0; các approve-only/PLANNED giữ nguyên, không resume. Tám SENT đều notification.type TEST, source không có và đều held; chưa provider acknowledgment/inbox nghiệp vụ. Safe đọc finalized 67761173: 2/3, nonce0, modules[]; control/custody chưa proof. Chưa target offhost/RPO/RTO. G5_MATRIX và G5_SOURCE_PROOF_MAP đã chi tiết 14 nhóm, source/test inventory có hash không gán thành execution PASS. NOT_FROZEN; G5/G6 OPEN.

Proof: reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/CHECKS.json
SHA256: 54e34b40093584926841fa4c4870f055e3b435c44cbee5c794a448aed59bd657
