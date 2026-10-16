# Bắt đầu hoán đổi mới sau thành công — 16/10/2026

Frontend `de13f7b378f6334fe82864130617aac37821a43e` đã push/lên VPS. Backend `393fa6d38fc368ea848d3960fae02d3d88136592` và PID3638966/NRestarts0 giữ nguyên; không backend restart, kết thúc phiên APP hoặc truy cập/sửa DB trong triển khai frontend này.

## Lỗi và hành vi sau sửa

WalletSwap luôn được mount trên WalletPage. Sau khi người dùng hoàn tất, nó vẫn giữ preview đã persist; mọi step khác PLANNED khiến form bị khóa, đóng/mở cũng dùng lại bản ghi cũ. Người dùng không bắt đầu được hoán đổi khác từ popup đó.

Khi tất cả step CONFIRMED, popup chỉ hiện kết quả, số đã gửi/nhận, phí thực tế và link biên nhận; ẩn form đã khóa và hướng dẫn của bước chưa hoàn tất. Có “Hoán đổi mới” / “Xong”. Hoán đổi mới xóa lượng nhập và preview trên giao diện, giữ lựa chọn token/slippage, đưa focus vào lượng nhập. Không tự quote, START, READY, ký hoặc gửi. Nhập lại cùng khối lượng cũng lấy preview/ID mới và vẫn cần người dùng thực hiện từng bước.

Đóng sau thành công bằng Xong/Đóng/Escape cũng xóa lượt đã hoàn tất khỏi form; mở lại là lượng trống. Bản ghi giao dịch vẫn giữ nguyên trong hoạt động. SIGNING/SUBMITTED hoặc kết quả chưa rõ không được reset thành lượt mới; popup giữ tiến trình để kiểm tra/tiếp tục. Không thêm hành động Hoán đổi mới vào hộp lịch sử hoặc gửi USDC.

## Kiểm chứng

11 ca browser scoped ở lượt đầu, sau đó6 ca liên quan chạy lại trên bản cuối sau khi ẩn form thành công. Bản cuối kiểm hai hoán đổi nối tiếp cho ví ngoài và Circle, ID/nonce riêng; không tự ký lại; giữ nguyên toàn bộ record đầu tiên; đóng/mở bằng ba cách; chưa rõ kết quả vẫn khóa/giữ cùng request. 375/1440px có ảnh kết quả; nút Hoán đổi mới hiển thị trên mobile. Kiểm liên quan gửi USDC, approve→swap, preview không có hoạt động và hết hạn sau approve đạt ở lượt đầu. Frontend typecheck/build đạt,181 file build; không full test/CI, backend tests kế thừa vì không đổi backend.

VPS cài89 file delta/181 full; public index/main/WalletPage/CSS khớp hash,4 route200, health200, khách wallet/reauth/preview/start401. Nginx giữ SHA `c842e06d1239f38c1391329c9276cf3ab2838dc02b29f5edc268f88c7160ef98`. Backend/backup source/helper và PID không đổi, backup VERIFIED/private restore/BACKUP_CURRENT;95 held worker jobs không giải phóng. Chưa có financial execution thật bởi trợ lý hoặc bằng chứng user swap mới sau bản frontend này; người dùng tải lại trang để nhận bundle mới.

## Giới hạn số lượng được hỏi

Không nên dùng tổng số giao dịch trọn đời làm hạn ngạch hoán đổi. Giới hạn64 hồ sơ hiện là chốt kỹ thuật của snapshot signer, không giới hạn số token. Gói này giữ nguyên chốt đó và budget theo cardinality đã sửa ở393fa6d. Muốn bỏ trần cản người dùng cần thiết kế đối soát lịch sử có phân đoạn/mốc finality với ràng buộc owner, nonce, reorg và atomic proof; chưa triển khai cơ chế đó, không được chỉ xóa guard trong lúc vẫn quét toàn bộ lịch sử mỗi READY. Ô khối lượng chỉ nên khóa cho chính yêu cầu đã cấp quyền ký; kết quả thành công cho phép bắt đầu lượt mới như sửa ở đây.

Candidate NOT_FROZEN; G5/G6, Circle swap independent receipt proof/cirBTC/Safe/offhost và khoảng trống R5–R7 vẫn theo ma trận hiện hành. Không coi kiểm popup hay public health là nghiệm thu toàn dự án.
