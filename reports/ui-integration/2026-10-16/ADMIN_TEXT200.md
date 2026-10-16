# Hồ sơ admin — text 200% và bàn phím

Kiểm độc lập sau account-access: ở375px/text200%, nút Quay lại người dùng và Tải lại quyền giữ một dòng, làm document rộng385px. Bổ sung max-width100%/white-space normal riêng cho các nút trong operator-account-profile; không sửa hành vi quyền hoặc backend.

Hai ca VI/EN mới dùng native SQLite fixture riêng: Enter mở hộp, focus nút Đóng rồi Tab vào lý do, vòng Tab/Shift+Tab, Escape trả focus, nháp lý do dài giữ khi mở lại, document/panel/dialog không tràn ngang và DB không đổi. Giữ lần fail do giả định sai focus đầu và lần đo được overflow; không nới assertion overflow để đạt.

6ca account-access scoped đạt, gồm hai ca mới và các ca restriction/reason/unknown response/reload/protected controller;2built guest route375/1440 đạt. Frontend typecheck và production build181files đạt; không chạy app/DB từ snapshot cũ hoặc full test/CI. Các ảnh/mock/native fixture này không thay authenticated admin live; user đang hoãn thao tác admin. Triển khai và identity được ghim riêng sau khi push.
