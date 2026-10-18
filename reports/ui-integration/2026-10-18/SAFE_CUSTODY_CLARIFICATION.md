# Sửa khai báo người ký Safe —18/10/2026

Người dùng đã sửa câu trả lời trước bằng: **“nói chứ 3 chữ ký của 3 người khác nhau đấy”**. Ghi nhận **ba chữ ký do ba người khác nhau thực hiện**. Câu “1 người” và kết luận custody NOT MET chỉ dựa trên câu đó được thay thế; không tiếp tục ghi nhận một người giữ/khôi phục cả ba khóa như một sự thật hiện hành.

Ba chữ ký vẫn là cùng input SHA256 80553996f57a5fda5f4a769e37d0c82af3b03a6efc7b13ad6c6a38fc3232ec64; đã được xác minh đúng3owner, đúng thông điệp982byte/digest21207e4b…/contextbackend30fea22 và quorum2/3 trong gói trước. Không yêu cầu ký lại hoặc tạo challenge mới. Owner list/threshold/Safe configuration không thay đổi. Khai báo3người là bằng chứng người dùng cung cấp; không gọi đó là xác thực danh tính từng người hoặc kiểm tra độc lập toàn bộ bản sao/khôi phục khóa. Hồ sơ hiện có thể đưa khai báo này cùng proof control vào bước review custody, thay cho kết luận thất bại vì1người. Không tự miễn tiêu chí hoặc đánh dấu G5/G6 hoàn tất.

Đây là gói sửa hồ sơ, không source/runtime change, deploy/restart, giao dịch/OTP/ký mới, DB read/write hoặc test/CI. Runtime377/public185(181main+4ops)/PID97197/backup/privateRestore/BACKUP_CURRENT/95held kế thừa observation 2026-10-18T04:10:07.821Z; authority finalized67780880 kế thừa 2026-10-18T04:10:10.064Z, không nói đã đọc mới. Raw chữ ký vẫn chỉ ở artifact root, không đẩy vào GitHub docs.

Circle/admin live tiếp tục hoãn; username/social POST-V1. Offhost/incident RPO/RTO, các branch live còn thiếu và review theo G5/G6 vẫn giữ phạm vi riêng. NOT_FROZEN;G5/G6 OPEN;acceptanceEligible=false.

Proof: reports/evidence/safe-custody-clarification/2026-10-18T04-18-42-214Z/CHECKS.json
SHA256: d482dcc2308f4fe73aeb580e4c6ec98391af12939a7fc3c41360342feff603ff
