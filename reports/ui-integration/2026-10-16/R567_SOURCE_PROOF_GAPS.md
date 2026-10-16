# R5–R7 — khoảng trống đối chiếu source / proof

Ngày 16/10/2026. Base sạch b032812; frontend de13f7b, backend 393fa6d. Mốc fe9a004/52bbaef/4851fef là lịch sử. Các pointer kế thừa được kiểm SHA256/byteLength trước sử dụng; manifest con được kiểm nếu CHECKS có trường files. Không suy manifest không có files là đã kiểm lại mọi artifact lồng nhau.

| Phạm vi | Có source / proof | Khoảng trống hoặc sửa trong gói này |
|---|---|---|
| R1–R4/R8 | UI01–05, buyer URL live, orders hoàn tất lịch sử | Tái dùng đúng scope; không mở lại, không replay đơn1–5. |
| R5 mua/giao/confirm/dispute/claim | Route/returnTo, order.id, checkpoint, managed dialogs, recovery guards và proof scoped theo gói | Chưa có whole-flow live cho mọi nhánh G5; các nhánh pending/no-hash/ambiguous/actor vẫn cần đối chiếu riêng. |
| R5 Gửi USDC | Nháp giữ khi đóng form, review cùng intent, unknown giữ record; live external↔Circle send đã có | Review đóng sau handoff từ form không có đích focus còn gắn DOM. Gói này trả focus rõ về nút Gửi, kiểm nháp và không tạo start khi chỉ preview. |
| R5/R6 swap | Inline approve/swap, min nhận, phí/TTL, giữ request đã bắt đầu; external hai chiều live | Circle swap và cirBTC chưa execution PASS. Không dùng quote/no-route để đóng execution. |
| R6 tiền/ngày | Base units/UTC+7, gross/rebate/refund, thiếu số dư hiện —, min output/fee cap | Giữ source tài chính hiện hành. Gói frontend này không thay fee/nonce/quote/calldata hoặc kiểm receipt live mới. |
| R7 form gửi | Trước gói chỉ có lỗi chung, không liên kết lỗi với trường; lỗi địa chỉ/số lượng không trả focus đúng trường | Bổ sung lỗi required/zero/self/invalid recipient và amount precision, aria-invalid/describedby, focus trường sai đầu tiên, dịch VI/EN; giữ nháp khi quay lại. |
| R7 form swap | Có lỗi precision trực quan | Bổ sung aria-invalid/describedby cho input và lỗi; kiểm nội dung VI/EN ở mobile với text 200%. |
| R7 khả dụng toàn app | Scoped keyboard/mobile theo từng gói | Kiểm mới chỉ phạm vi form/review ví; chưa có dossier mọi màn/trạng thái ở zoom, keyboard, nội dung dài. Không ghi accessibility 100%. |
| Người dùng/Phân quyền | Danh bạ/hồ sơ, admin realm, onchain enrollment và audit read | Chưa role/account lock mutation; xem ACCOUNT_ACCESS_DECISION.md để chốt semantics trước ghi. |
| Vận hành / G5G6 | VPS writer duy nhất; backup VERIFIED/BACKUP_CURRENT, timers active, 95 held | Safe independent control signature và offhost target/RPO/RTO còn thiếu. Candidate NOT_FROZEN, G5/G6 OPEN. |

Gói R5–R7 chỉ đóng các lỗi form/focus có bằng chứng scoped ở trên. Việc khép toàn bộ R5–R7 tiếp tục theo ma trận G5, không gộp triển khai thành nghiệm thu toàn mục.
