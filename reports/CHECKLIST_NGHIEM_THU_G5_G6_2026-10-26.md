# Checklist G5/G6 cho bản 8c32212 — 26/10/2026

Đã tách 20 dòng nhóm của matrix trước thành **32 ca chi tiết** theo các ID đã có; không thêm tiêu chí bắt buộc. **Chủ sản phẩm đã chốt giữ đủ 23 ca còn thiếu, chưa miễn ca nào.** Việc tách ca chỉ tổ chức lại hồ sơ; chưa ca live mới nào được chạy hoặc đóng. G5/G6 OPEN; candidateFrozen/acceptanceEligible/wholeProjectAccepted=false.

FE/BE cùng 8c32212fdb051cdb01f98226932f3a61afa3e9bf; manifest Arc Testnet chain 5042002, Hub 0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574, protocol 1. CI và biên bản phát hành được ghim trong [báo cáo phát hành 24/10](THUC_THI_SAU_REVIEW_2026-10-24_02.md). [Báo cáo thực hiện 26/10](THUC_THI_SAU_REVIEW_2026-10-26.md) ghi đối chiếu runtime và giới hạn review.

## Checklist theo ca

| Ca | Nội dung / kết quả cần quan sát | Vai trò cần có | Trạng thái |
|---|---|---|---|
| ACL-01 | Từ chối quyền mới, giữ nghĩa vụ cũ: Trên dữ liệu riêng đã duyệt, actor bị từ chối không tạo hành động mới nhưng vẫn thực hiện đúng nghĩa vụ còn hiệu lực. | Seller/buyer có quyền bị từ chối; admin quyền | Chưa chạy; cần actor được phép |
| ID-01 | Hủy OAuth: Hủy authorization trong yêu cầu liên kết riêng; GroupDeal báo hủy và không ghi liên kết mới. | Chủ tài khoản GitHub/Discord | Chưa chạy; cần actor được phép |
| ID-02 | Ngắt rồi liên kết lại: Ngắt liên kết riêng đã duyệt; liên kết lại đòi authorization mới và chỉ có một liên kết hợp lệ. | Chủ tài khoản GroupDeal và social | Chưa chạy; cần actor được phép |
| ID-03 | Social ID trùng giữa hai account: Account thứ hai không chiếm social ID đang thuộc account thứ nhất. | Hai chủ account được phép hoặc người sở hữu cả hai | Chưa chạy; cần actor được phép |
| WAL-01 | Chốt asset/funding còn bắt buộc: Chỉ định rõ route/asset/funding còn thiếu nếu có; giữ lý do SKIP cũ khi không cấu hình được. Không tự thêm swap. | Chủ sản phẩm | Chờ quyết định phạm vi |
| CMP-01 | Sửa điều khoản/material replacement: Thay đổi thuộc material edit phải theo đúng revision/version và consent/publication đang áp dụng. | Seller được quyền trên campaign riêng | Chưa chạy; cần actor được phép |
| CMP-02 | Riêng tư qua vòng đời campaign: Actor ngoài scope không đọc dữ liệu riêng trong các trạng thái còn thiếu; ACL-01 dùng chung. | Seller và actor không sở hữu | Chưa chạy; cần actor được phép |
| BUY-01 | Early rebate bật và cap: Trên campaign riêng, giá/cap/early rebate khớp terms protocol v1 và bảo toàn tiền. | Buyer/seller có quyền ký | Chưa chạy; cần actor được phép |
| BUY-02 | Mua lại và max-account: Mua lặp theo đúng giới hạn đã chốt; boundary vượt giới hạn không tạo commitment ngoài policy. | Buyer có quyền ký | Chưa chạy; cần actor được phép |
| BUY-03 | Ranh giới tồn kho: Số lượng tại/qua inventory boundary theo đúng policy, không bán vượt tồn kho. | Seller/buyer có quyền ký | Chưa chạy; cần actor được phép |
| REC-01 | Đổi phiên/thiết bị, mất ACK: Cùng intent/hash được nhận diện qua phiên và mất ACK mà không gửi commitment trùng. | Chủ account trên hai phiên/thiết bị | Chưa chạy; cần actor được phép |
| REC-02 | Unknown/drop/replacement: Nhánh được chọn phải phân biệt chưa rõ/drop/replacement và giữ cùng intent/nonce đúng quy tắc. | Chủ account và người ký giao dịch riêng | Chưa chạy; cần actor được phép |
| REC-03 | Revert recovery: Revert được nhận diện đúng, không ghi thành công giả hoặc tạo nghĩa vụ kép. | Chủ account và người ký giao dịch riêng | Chưa chạy; cần actor được phép |
| AUTH-01 | Xác nhận readiness authority/Safe: Chủ authority xác nhận readiness/quyền kiểm soát trên đúng bộ FE/BE/manifest hiện hành; không đổi custody. | Chủ authority/Safe | Chưa chạy; cần actor được phép |
| AUTH-02 | Emergency cancel nếu còn là tiêu chí: Chỉ thực hiện nếu chủ sản phẩm giữ ca này; kiểm đúng actor, trạng thái và hậu quả tài chính trên dữ liệu riêng. | Chủ sản phẩm và authority ký | Chưa chạy; cần actor được phép |
| ENT-01 | Resource revoke/expiry/activation: Kiểm các nhánh vòng đời còn thiếu, quyền tải/dùng thay đổi đúng policy mà không ảnh hưởng resource thật đã xong. | Seller/provider và buyer sở hữu resource riêng | Chưa chạy; cần actor được phép |
| ENT-02 | Entitlement mismatch: Sai order/resource/principal/version không cấp hoặc đọc nhầm entitlement. | Buyer và provider trên dữ liệu riêng | Chưa chạy; cần actor được phép |
| RETRY-01 | Exhaustion/DLQ/redrive live: Giữ DEFERRED_BY_USER. | Chủ sản phẩm nếu sau này mở lại | DEFERRED_BY_USER |
| DSP-01 | Partial trên UI hiện hành: Ca partial riêng trên UI hiện hành giữ tỷ lệ và conservation; proof 50/50 lịch sử order2 vẫn giữ. | Hai bên và actor phân xử có quyền ký | Chưa chạy; cần actor được phép |
| DSP-02 | Dispute window/fallback: Chọn đúng nhánh time window/fallback còn thiếu; outage chỉ ở môi trường riêng được duyệt. | Actor phân xử và chủ sản phẩm | Chưa chạy; cần actor được phép |
| CLM-01 | Batch claim nhiều đơn: Batch trên đơn riêng không claim trùng hoặc cộng sai; không lặp cumulative proof đã đủ. | Chủ principal có quyền ký | Chưa chạy; cần actor được phép |
| CLM-02 | Claim authority/recovery: Nhánh authority/recovery còn thiếu không cho người khác claim và không tạo claim lặp khi khôi phục. | Chủ principal và actor khác scope | Chưa chạy; cần actor được phép |
| PROJ-01 | Projection rebuild/outage/recovery: Chỉ tổ chức ca nếu được duyệt riêng; projection phục hồi tương thích dữ liệu/chain và không mất/nhân bản nghĩa vụ. | Người vận hành trên môi trường riêng | Chưa chạy; cần actor được phép |
| SUP-01 | Ticket close/reopen/remove/expiry: Vòng đời ticket riêng tuân đúng policy; không sửa ticket thật hoặc gửi mail khi chưa mở scope. | Chủ ticket và support có quyền | Chưa chạy; cần actor được phép |
| SUP-02 | Attachment download ACL: Download tuân ticket-message-attachment binding và trạng thái còn thiếu; actor ngoài scope bị từ chối. | Chủ ticket, support và actor ngoài scope | Chưa chạy; cần actor được phép |
| A11Y-01 | Handle keyboard/focus: Giữ PASS_FIXTURE_DELTA: confirm/back/error/success/readonly VI/EN × mobile/desktop. | Bằng chứng fixture đã có | Kế thừa bằng chứng đúng phạm vi |
| A11Y-02 | Wallet filter/page/error/text200: Giữ PASS_FIXTURE_DELTA: 45 rows, keyboard/loading/error, reflow không clipping/caption từng ký tự. | Bằng chứng fixture đã có | Kế thừa bằng chứng đúng phạm vi |
| A11Y-03 | Phạm vi UI kế thừa: Giữ 408 lượt R5–R7 và 30 error/retry theo thời điểm gốc; không thêm chứng nhận AT/WCAG toàn diện. | Người review | Kế thừa bằng chứng đúng phạm vi |
| OPS-01 | Phát hành/vận hành và bàn giao: Phần kỹ thuật đã xác minh; người dùng chỉ định T nhận vận hành/review, còn chờ xác nhận vai trò/runbook và kết luận review. | T (được chỉ định; chưa ký nhận) | Kỹ thuật đạt; chờ nhận bàn giao |
| X-01 | Tích hợp X: Giữ DEFERRED_BY_USER. | Chủ sản phẩm nếu sau này mở lại | DEFERRED_BY_USER |
| RESTORE-01 | Manual restore/RPO-RTO: Giữ WAIVED_BY_USER. | Chủ sản phẩm | WAIVED_BY_USER |
| MAINNET-01 | Mainnet/paid/token expansion: Giữ NOT_APPLICABLE / OUT_OF_SCOPE. | Chủ sản phẩm ở giai đoạn khác | NOT_APPLICABLE |

## Bằng chứng tối thiểu và cách ghi quyết định

Mỗi ca được giữ lại cần: FE/BE/manifest được ghim, thời điểm UTC, vai trò/actor trong hồ sơ private, điều kiện trước, thao tác, kết quả mong đợi/thực tế, native audit/receipt hoặc UI/API evidence theo đúng nhánh. Ca có tài chính cần receipt/event/block và đối soát theo đơn; health UP không thay thế. Chỉ thu phần còn thiếu; không lặp positive OAuth/Circle/email/delivery/claim đã đủ. Không đưa token, code OAuth, private key, HAR chứa credential, database hoặc attachment private vào Git.

CASE_CHECKLIST.json trong kho private mới ghi riêng minimumEvidence cho từng ca, parentGroup và trạng thái nguồn. 23 ca còn thiếu đã ghi ownerDecision=KEEP_LIVE và scopeDecisionRecorded=true theo câu trả lời “Giữ đủ 23 ca, chưa miễn ca nào”. Actor thực thi từng ca vẫn chưa được phân công. OPS-01 ghi T là người nhận vận hành được chỉ định; không suy nhãn T thành xác nhận tính độc lập hay chữ ký. WAL-01 vẫn chờ định nghĩa asset/funding nếu có. Các trạng thái hoãn/miễn/ngoài phạm vi được kế thừa nguyên vẹn.

Quyết định phạm vi hiện hành: **giữ toàn bộ 23 ca chưa thực hiện, không có ngoại lệ mới**. Nếu thay đổi sau này, ghi rõ ID và lý do. Chỉ ghi EXPLICIT_SCOPE_EXCEPTION khi có quyết định rõ theo ca; không mặc định miễn phần chưa trả lời. Đây không phải phê duyệt tạo giao dịch, đổi quyền, ký ví, OAuth, outage hoặc email thật.

## Quyết định đã ghi và phần còn chờ

| Mã | Người quyết định | Nội dung cần ghi | Hiện tại |
|---|---|---|---|
| D1 | Chủ sản phẩm | Giữ đủ 23 ca còn thiếu; không miễn ca nào; không tự mở asset/swap mới | Đã ghi nhận; chưa cấp quyền chạy live |
| D2 | Chủ authority/Safe | AUTH-01 readiness trên candidate này; AUTH-02 có giữ UAT không | Chưa có xác nhận |
| D3 | Chủ hệ thống/chủ sản phẩm | Digest byte Worker đã upload/live có provenance hoặc ngoại lệ bằng văn bản | Chưa khép |
| D4 | T (nhãn do người dùng cung cấp) | Tính độc lập, phạm vi/candidate, findings và disposition | Đã chỉ định; chưa xác nhận độc lập hoặc ký |
| D5 | T nhận vận hành; chủ sản phẩm quyết định nghiệm thu | Xác nhận nhận/runbook, scope cuối, freeze/sign-off | Đã chỉ định người nhận; chưa ký |

## Hướng dẫn người review và người nhận vận hành

G6_REVIEW_PACKET.json nối ledger phát hành, CI, catalog lịch sử, current observation, review kỹ thuật và 32 ca. Reviewer đối đúng 8 file delta từ các base FE 49f2719 / BE f314de7, các bằng chứng được tái sử dụng với timestamp gốc và khoảng trống Worker. Review kỹ thuật 26/10 do cùng assistant đã triển khai thực hiện, **không phải review độc lập hoặc chữ ký G6**. Không có P0/P1 mới được xác nhận trong phạm vi delta đã rà; điều này không chứng nhận toàn hệ thống không có lỗi.

Người nhận vận hành xem [runbook backup/offhost](../docs/onedrive-backup.md) và biên bản 24/10; dùng receipt POST-REVIEW-RELEASE-8c32212...json mới thay cho việc suy phiên bản từ WORKSPACE-RELEASE/FRONTEND-RELEASE cũ. Timer/observer hiện có tiếp tục chạy; backup quá 90 phút hoặc offhost quá 150 phút báo ATTENTION. Giữ 95 hold; sự cố sau admission không được tự reset/restore database, replay hoặc đổi signer.

Nhãn “T” được giữ nguyên theo câu trả lời, áp dụng cho hai vai trò đã hỏi. Chưa suy ra danh tính pháp lý, vai trò authority hoặc reviewer đã độc lập với phần triển khai. Giữ yêu cầu reviewer độc lập; cùng một người có thể nhận vận hành nếu phù hợp nhưng việc được chỉ định chưa là sign-off.
