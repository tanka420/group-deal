## Hiện hành — 19/10/2026: FILE_LINK đã mua thật, đơn #6

Phần này thay trạng thái hiện hành trong các ghi chú lịch sử bên dưới. **Đơn #6 đã mua thành công**, không yêu cầu mua hoặc xuất bản lại. Buyer do user chọn là **0x580cdb6a6354313f73ff16b160b15dcc914d21ae**; seller **0x24F0c19a6E77cc687181500455BeE3550E617580**.

- Sau bản sửa timeout frontend0c61f06, user báo đã đến màn phí rồi tự ký. Approve đúng Hub2USDC: **0x100e397c616253f73c5458caefece28056bda9c8a323c6ba50876268ef924289**, nonce23. Mua2đơn vị/2USDC: **0xe0148def1dd031d64fe2debd6c005c24046c8b38f9076ca04b186fd4a1deff99**, nonce24/block67947791.24 kiểm tra receipt/canonical/finalized/principal/calldata/event đạt; latest=pending25. Agent không ký/broadcast/đồng ý điều khoản. Màn phí trước ký không được agent chụp.
- BUY **op_d4767d88-a004-4d83-ba79-ee32baa86efe** từ UNKNOWN/RECEIPT_NOT_VERIFIED đã phục hồi qua UI **cùng hash** thành PROJECTED/order6. Ledger không đổi qua phục hồi. Campaign#5 bán hết2đơn vị và tự FINALIZED ở giá0,8USDC/đơn vị. Native/chain9kiểm tra tài chính đạt: rebate0,4USDC đã phân bổ/chưa rút; seller/refund0; escrow2USDC. Gas thực tế approve+mua **0,42299852USDC native**, riêng tiền hàng2USDC; dự phòng0,07 trong ghi chú cũ không phải phí thực tế. Diagnostic observer getter/enum sai ban đầu được giữ, đã sửa riêng observer theo contract.
- Đơn #6 **PENDING giao hàng**, chưa proof/hash/grant, chưa download/confirm/claim. SLA **10:38:51 ngày20/10 UTC+7**. Ghim pv_9a577a80-9b57-4db8-9559-0e6015fa9c84 / lv_2730410d-3b49-476d-9d54-4589ea2e20d8; dùng lại resource res_258c1523-2adb-4c54-9fc9-594786fda36f/ZIP6852/SHA5f90be…/rights đã duyệt. Không upload/duyệt/publish lại. Seller đã login, dialog giao đúng đơn6 đã mở; chưa prepare hoặc ký giao hàng trong gói này.
- Native03:48:48UTC:19users/6campaigns/**6orders/40operations**/6grants/12inventory; ledger52flows/**68reservations**/SHA7e8dad079f216f12a6d59031a7e7d28748993652e94ee5b84c73cc1c49f6d080.67→68 do mua thật của user;5đơn cũ SHA f864e1a7…/publication#5/**95held giữ nguyên**. Hai intent cũ EXPIRED, swap cũ giữ nguyên.
- Backup sau PROJECTED tại03:44:35UTC đã private-restore verified/BACKUP_CURRENT, chứa6orders/40ops/95held. Giữ3bản managed verified và1unknown archive theo policy hiện hành; OneDrive làm sau, offhost/RPO/RTO OPEN. Runtime383/public186 hash khớp; backendf52dac9/frontend0c61f06/PID205372/restarts0 giữ. Không đổi source implementation, deploy, restart hoặc fullCI trong gói.

**Bước tiếp:** prepare tài nguyên cho đúng order6 bằng phiên seller hiện tại, kiểm proof và2unit grants; user seller24F tự kiểm phí/ký recordDelivery. Sau receipt, buyer580c tải/kiểm ZIP rồi tựconfirm và claim; kiểm khoản seller sau confirm. Không replay đơn1–5 hoặc mua lại6. Circle/admin khác hoãn; username/social POSTV1; Safe giữ proof/context gốc. **NOT_FROZEN/G5OPEN/G6OPEN/acceptanceEligible=false/wholeProjectAccepted=false.**

CURRENT [CHECKS.json](E:/apps/group-deal/reports/evidence/file-link-purchase/2026-10-19T03-39-53-121Z/CHECKS.json), SHA256 **8a8239df3e5ca472ae4ca6ea8ad02d8729220cd7725e6bb3267296e51ac07cbe**, 264009bytes/**26artifacts/14branches**;47artifact parent đã kiểm hash. [Báo cáo](E:/apps/group-deal/reports/evidence/file-link-purchase/2026-10-19T03-39-53-121Z/FILE_LINK_PURCHASE_VERIFIED.md). Observer .cache/file-link-purchase-detail-native.cjs, ops-final.cjs, canonical.cjs, financial-v2-observer.cjs; clone đổi outputwx. Source chỉ sửa checkout sạch **.cache/ci/c-322e58ff**, remote github, HEAD trước docs7b4a824301d59c55abfae541746700995c29924e; HEAD sau có thể chỉ tiến bằng docs.

# FILE_LINK: mua thật và phục hồi đơn #6 — 19/10/2026

Buyer **0x580cdb6a6354313f73ff16b160b15dcc914d21ae** đã tự ký approve đúng Hub 2 USDC, rồi commit mua 2 đơn vị / 2 USDC cho campaign #5. Sau bản sửa timeout, user báo đã thấy màn kiểm phí; khi agent quan sát, hai chữ ký đã hoàn tất. Agent không chấp nhận điều khoản, ký hoặc broadcast. Không có mua lặp.

| Bằng chứng | Kết quả |
|---|---|
| Approve | 0x100e397c616253f73c5458caefece28056bda9c8a323c6ba50876268ef924289; nonce23, block67947771 |
| Mua | 0xe0148def1dd031d64fe2debd6c005c24046c8b38f9076ca04b186fd4a1deff99; nonce24, block67947791, order6 |
| Xác minh receipt | 24 kiểm tra chain/codehash/principal/Hub/calldata/nonce/event/canonical/finalized đều đạt |
| Giá cuối | Campaign5 bán hết2 đơn vị, tự chốt giá0,8USDC/đơn vị |
| Tài chính | 9 kiểm tra getOrderDetails/native/escrow đạt: rebate0,4; seller0; refund0; chưa claim |
| Gas thực tế | Approve0,035702072 + mua0,387296448 = **0,42299852 USDC native**; tách khỏi2USDC tiền hàng |

Khoản dự phòng0,07USDC ở review trước là ước tính lịch sử; không phải phí gas thực tế. Đã giữ receipt và phép tính gas, không có ảnh màn phí trước ký. Rebate0,4 là khoản phân bổ, chưa chuyển về ví. Escrow campaign5 và số dư Hub đều2USDC tại block67948537;1,6USDC còn lại chưa phân bổ cho seller khi giao hàng chưa hoàn tất.

BUY **op_d4767d88-a004-4d83-ba79-ee32baa86efe** ban đầu UNKNOWN/RECEIPT_NOT_VERIFIED, trong khi order6 đã được index. Sau kiểm canonical, UI dùng cùng hash để phục hồi thành **PROJECTED**, projectedOrderId6/error null. Ledger không đổi qua phục hồi; không tạo giao dịch hoặc đơn mới. Hai intent trước vẫn EXPIRED, request swap cũ giữ nguyên.

Order6 ghim ProductVersion pv_9a577a80-9b57-4db8-9559-0e6015fa9c84 / LicenseVersion lv_2730410d-3b49-476d-9d54-4589ea2e20d8. Delivery PENDING, chưa proof/hash, grants của order6 là0. SLA đến **10:38:51 ngày20/10/2026 UTC+7**. Seller đã đăng nhập và mở dialog giao order6; chưa prepare hoặc ký giao hàng trong gói mua này. Dùng lại resource res_258c1523-2adb-4c54-9fc9-594786fda36f / ZIP6852byte / SHA5f90be577b10d60f6622b92782af0939ef717ebee12851e53477a8e8bb6bc429; không upload/duyệt/publish lại.

Native2026-10-19T03:48:48.040Z:19users/6campaigns/**6orders/40operations**/6grants/12inventory; ledger52flows/**68reservations**, SHA7e8dad079f216f12a6d59031a7e7d28748993652e94ee5b84c73cc1c49f6d080.67→68 là delta mua thật của user; cùng hash recovery không đổi ledger.5đơn cũ SHAf864e1a7f21a123450f6d17111f2f0bbc5514557bb47d048b1cd521622b24ae9, publication và95held giữ nguyên.

Runtime383/public186 hash khớp, backendf52dac9/frontend0c61f06/PID205372/restarts0. Backup2026-10-19T03:44:35.692Z sau PROJECTED được private-restore verify/BACKUP_CURRENT, chứa6orders/40ops/95held. Policy3bản managed verified và1unknown archive kế thừa; OneDrive làm sau, offhost/RPO/RTO còn mở. Không source implementation, deploy, restart hoặc fullCI trong gói.

Diagnostic tài chính lần đầu READ_UNCONFIRMED do observer dùng getter orders thô (rebate tính lười ở getOrderDetails) và nhầm enum FINALIZED1 thay vì2. Đã sửa riêng observer theo SolidityL804–809/interface enum,9checks đạt; giữ diagnostic gốc. Không sửa dữ liệu/contract.

Tiếp theo: prepare đúng tài nguyên order6, đối chiếu proof/2unit grants, user seller24F tự kiểm phí và ký recordDelivery; sau receipt, buyer580c tải/kiểm file rồi tựconfirm/claim. FILE_LINK delivery/download/confirm/rebate payout/seller payout vẫn OPEN. Circle/admin khác hoãn, username/socialPOSTV1, Safe giữ context gốc. **NOT_FROZEN/G5OPEN/G6OPEN/acceptanceEligible=false/wholeProjectAccepted=false.**
