# Tên miền chính thức GroupDeal

Origin chính thức là `https://groupdeal.tech`. `www.groupdeal.tech` và hostname trước đây `groupdeal.thanhtan.top` chỉ chuyển hướng 308, giữ đường dẫn và query. Mạng và các hợp đồng vẫn là Arc Testnet; đổi domain không chuyển sang Mainnet.

DNS tại nhà đăng ký: A của apex trỏ `13.212.35.217`, CNAME `www` trỏ `groupdeal.tech`. Không đặt AAAA khi VPS chưa phục vụ IPv6 tương ứng. HTTPS dùng chứng chỉ Let's Encrypt cho apex và www; tiếp tục gia hạn chứng chỉ hostname cũ để liên kết HTTPS cũ còn chuyển hướng được.

`config/nginx/groupdeal.tech.conf` là virtual host chính và redirect www. `config/nginx/groupdeal-legacy-redirect.conf` giữ redirect hostname cũ và ACME challenge. Hai cấu hình dùng cùng public root hiện hành, không sao chép DB hoặc tạo writer mới.

Chỉ thay `PUBLIC_APP_URL` và `ALLOWED_ORIGINS` thành `https://groupdeal.tech` trong private `backend/.env`, giữ owner ubuntu/mode0600 và mọi biến khác. Trước thay đổi ghim hash đầy đủ cùng hash cấu hình loại hai biến này. So sánh lại sau thay đổi; không ghi giá trị secret vào log, report, source hoặc frontend.

`config/hosted/start.cjs` là bản nguồn của launcher được cài vào runtime `.cache/hosted/start.cjs`. Nó tiếp tục ghim backend9372850, chain5042002, port18420, một origin duy nhất, DB cô lập và95held. Với lần chuyển domain chỉ đổi cấu hình/launcher; runtime inputs backend và database hiện hành giữ nguyên. Restart có kiểm soát dùng admission hiện tại, không restore snapshot hoặc seed. Guard vẫn tạo encrypted startup backup, làm mới auth và đối soát chain trước khi mở worker.

Frontend dùng API cùng origin và metadata Reown theo `window.location.origin`, vì vậy đổi domain không cần build lại bundle không đổi. Ghi riêng backend source, frontend source và commit cấu hình vận hành; không coi HEAD docs/ops là backend mới. Giữ asset lịch sử cho tab cũ và bằng chứng đóng.

Probe và bộ chọn observation cảnh báo đều ghim `https://groupdeal.tech/api/health`. Cài cả hai helper cùng gói, chạy probe thành công trước khi áp redirect cũ; giữ state và chính sách chống gửi lặp của alerts. Không gửi mail thử hoặc giải phóng các job cũ khi chuyển domain.

Callback GitHub/X/Discord dùng `https://groupdeal.tech/seller/profile`; homepage dùng `https://groupdeal.tech`. Người giữ tài khoản tự tạo/cập nhật OAuth app và consent. Kiểm Circle/Reown domain allowlist nếu provider từ chối origin mới; không đổi credential/provider project. Các chuỗi `groupdeal.app` trong thông điệp ký là app identifier theo giao thức hiện hành, không phải URL hosting và không được đổi hàng loạt làm mất binding các challenge/nghĩa vụ cũ.

Trước hoàn tất phải kiểm TLS/renewal hook, routes SPA và API guards, redirect/query, CORS origin mới và từ chối origin cũ, hash public/runtime, counts/old orders/wallet ledger/95held, fresh reconciliation và backup. Người dùng đăng nhập lại trên origin mới bằng đúng principal; agent không ký thay hoặc chuyển session token giữa origin.

Domain migration không đóng G5/G6, không phát giao dịch, không replay đơn1–6 và không thay quyết định đã miễn diễn tập phục hồi backup/RPO-RTO.
