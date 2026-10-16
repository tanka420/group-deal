# R5–R7: lỗi form ví, focus và text lớn

Frontend 247da270dbe03ae994402df365816813bf4224ee đã push và triển khai. Backend 393fa6d/PID3638966/NRestarts0 giữ nguyên.

Form gửi báo lỗi theo trường (required, địa chỉ không hợp lệ/zero/self, amount >0 và 6 decimals), aria-invalid/describedby, focus trường sai đầu tiên. Đóng review trả về nút Gửi, mở lại giữ đúng recipient/amount. Swap liên kết lỗi input và xuống dòng tiêu đề khi text200%.

Typecheck/build đạt. 11 ca scoped, 6 ca bản cuối sau sửa reflow và 3 ca built đạt. Lần đầu 3/4 ca mới đạt, một selector tiếng Việt sai đã sửa; ảnh text200% phát hiện tiêu đề một ký tự dù không overflow, đã sửa flex và thêm assertion chiều cao. Giữ metadata fail và ảnh trước/sau, không full/CI. Fixture/mocks riêng, không chạy backend hoặc DB snapshot local.

90 file delta/181 full; public bytes và 4 route200, health200/guest401 đạt. Nginx hash không đổi, assets cũ giữ; backend không restart, không DBwrite/ký/broadcast. Backup VERIFIED/BACKUP_CURRENT, 95held giữ nguyên.

Proof root workspace: reports/evidence/r567-wallet-accessibility/2026-10-16T09-44-08-265Z/CHECKS.json, SHA256 1f1c11cfdf1f0b76204e8b291e5cf151b40aab73a2d2d67da6f4580c7ddcfec7. CURRENT_R567_SCOPED và CURRENT_UI_WALLET trỏ packet này. Bảng R567_SOURCE_PROOF_GAPS.md xác định phần còn mở; không kết luận toàn R5–R7/accessibility100%.

User đã chốt: khóa chỉ chặn thao tác mới, giữ login/read/đơn/quyền lợi cũ; buyer mặc định, quản lý seller, operator theo controller hiện hành. Bước kế tiếp triển khai command/capability/audit theo ACCOUNT_ACCESS_DECISION.md và chính sách đã chốt. Circle swap/cirBTC/admin live/email/Safe/offhost, G5/G6 vẫn OPEN, candidate NOT_FROZEN.
