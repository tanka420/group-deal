# Người dùng / Phân quyền — đối chiếu và quyết định còn thiếu

Nguồn kiểm trực tiếp: checkout sạch b032812 và delta R5–R7 ngày 16/10. Không thay quyền tài khoản thật để kiểm.

| Thao tác | Source / authority hiện hành | Kết luận |
|---|---|---|
| Danh bạ, tìm kiếm, hồ sơ, ví, đơn/chiến dịch/hỗ trợ/audit | operatorAdministrationService + operatorAccountRead; cursor MAC gắn actor/session/revision/deployment | Đã có API và UI; cần bổ sung admin authenticated live sau user ký. |
| Phiên admin | ADMIN realm; OperatorEnrollmentService.authorize đọc quyền onchain, binding ví và certificate trước mỗi capability | Có tách phiên; không thay bằng roles[] đơn thuần. |
| Cấp/thu hồi operator | Chỉ ví operator cấu hình, quyền controller và enrollment signature; không có API cấp operator tùy ý | Không thể thêm nút sửa roles[] để cấp quyền vận hành thực. |
| Buyer / seller | Buyer là quyền sở hữu dữ liệu; seller có profile/đăng ký và guard riêng | Chưa có quy tắc thủ công cấp/thu hồi seller, đặc biệt khi còn đơn cần giao. |
| Khóa tài khoản | UserRecord chưa có trạng thái khóa; SessionRegistry và command admission chưa có guard khóa chung | Chưa có mutation hoặc audit sự kiện khóa. |

Phương án triển khai cụ thể sau khi xác định chính sách:

- API command dưới `/api/operator/users/:id/access`, capability admin hiện hành, `expectedRevision`, command ID chống lặp, action và lý do bắt buộc. Không cho sửa chính actor hoặc controller đang bảo vệ hệ thống. Trước ghi kiểm lại committed session/capability và revision, ghi account command + audit trong cùng transaction.
- Hồ sơ hiển thị trạng thái, lý do đã lọc, thời điểm, actor, lịch sử cấp/thu hồi; xác nhận nêu đúng target ID/action. Chỉ bật nút khi server công bố capability tương ứng. Giữ bản nháp khi API từ chối; 409 yêu cầu đọc trạng thái mới trước gửi command mới.
- Chọn chính sách khóa: (A) hạn chế thao tác mới như tạo sản phẩm/chiến dịch/mua mới, vẫn được đăng nhập, đọc và xử lý đơn/quyền lợi đã có; (B) khóa đăng nhập và các phiên ứng dụng. Cả hai không thể khóa quyền tự tương tác contract bằng khóa ví và không được sửa quyền sở hữu đơn cũ.
- Chọn chính sách vai trò: (A) buyer mặc định, admin cấp/thu hồi seller với điều kiện không bỏ nghĩa vụ đơn đang mở; operator vẫn theo ví controller + chữ ký hiện hành; (B) thêm quản trị viên được ủy quyền với capability vận hành riêng, cần định nghĩa tập quyền và ai cấp/thu hồi. Không gộp quyền tài chính của contract/Safe vào role offchain.
- Kiểm bằng DB/key tổng hợp riêng: actor không có capability, khác realm, session cũ, self/controller target, tamper/duplicate command, conflict, concurrent revoke, audit atomicity; kiểm UI VI/EN/focus. Không test mutation trên tài khoản live.

Hai lựa chọn trên là quyết định nghiệp vụ chưa có trong source hoặc bàn giao. Chưa triển khai mutation, chưa đóng phần Người dùng/Phân quyền. Có thể tiếp tục proof đọc, email, Safe và chuẩn bị offhost trong lúc chờ.
