## Hiện hành — 21/10/2026: username/OAuth đã deploy; mở lại toàn bộ phần từng hoãn

Chỉ dẫn mới của user21Oct thay các dòng hoãn trong lịch sử: username/social, Circle, admin live và OneDrive đều trở lại phạm vi hoàn thành. Giữ Arc Testnet, người dùng tự OTP/ký/consent, VPS writer duy nhất; không reset/seed/replay đơn1–6/giải phóng95held.

Backend **47f3f64da4915e9b46c37ff7b9e09f048e2f8293**, frontend **6e643c8181daada6b33f3874d8e2a3e56b0af8e6**, ops backup **9734d195644dee1b5a77abca0d6c86cc7ecf18ca** đã push/deploy. Seller chọn username trước publication mới; liên kết X/GitHub/Discord bằng OAuth+PKCE, gắn đúng phiên/provider/ID ổn định và duy nhất toàn hệ thống; có ngắt và hiển thị công khai. Chưa cấu hình/consent OAuth live; không ghi đã nghiệm thu provider.

55 scoped identity checks, regression snapshot cũ,10 source/emitted runtime-upgrade cases và các kiểm auth/profile/wallet/product/SQLite liên quan đạt. Desktop/390px CUA fixture đạt; VI quan sát, không coi đã kiểm EN/200%/OAuth live. Build backend/frontend đạt,9 HTTPS routes/guard/assets đạt. Lần deploy đầu bị guard từ chối do thêm collection rỗng vào snapshot; rollback bản cũ/health200 đã kiểm. Sửa lazy collections, không giảm guard; lần sau native preparation **HEALTHY**, mọi field/ledger giữ. Runtime **389 file**, public **186 file**; PID **1339439**, NRestarts0, native **.cache/application-recovery/drill-bqoqaE/candidate**. Backup mới source47f3 private-restore verified/BACKUP_CURRENT.

Native22:07:30UTC:19users/6campaigns/6orders/44ops/8grants/12inventory;ledger52/72/SHAee7087ef1992baf86b322aaf1259487d90fa0a17bf7c544c7ef5c16c3559ce17;5đơn cũSHAf864e1a7f21a123450f6d17111f2f0bbc5514557bb47d048b1cd521622b24ae9/95held giữ. FILE_LINKorder6 đã rút đủ, không làm lại. Safe T/A/N giữ khai báo tách quyền khôi phục; chữ ký18Oct đã hết hạn, không fresh control cho candidate mới.

CURRENT [CHECKS.json](E:/apps/group-deal/reports/evidence/project-completion/2026-10-20T21-38-39-093Z/CHECKS.json), SHA256 **f933b9affb8598ab3d6f3ae01f9bcdc69d8d6038f78b37e683995cf000d7efb8**, 341648bytes/51artifacts. Checkout source duy nhất **E:/apps/group-deal/.cache/ci/c-322e58ff**, remote github, branchcodex/license-key-csv-studio. Rootreports là nơi giữ evidence. NginxSHAfafecfbe84ef0a55ed70f2bd1378544ac2b265cf4bd673a95df848f3e4b77cc9 giữ. **NOT_FROZEN/G5OPEN/G6OPEN/acceptanceEligible=false/wholeProjectAccepted=false.** Tiếp OneDrive/ops độc lập, rồi tài liệu human actions và prompt chat mới; không dừng ở kế hoạch.

# Liên kết mạng xã hội của seller — yêu cầu 18/10/2026

Trạng thái: BACKLOG SAU BẢN ĐẦU, người dùng đã đồng ý ngày 18/10/2026. Cả username bắt buộc cho seller và liên kết mạng xã hội đều hoãn; chưa triển khai hoặc nghiệm thu. Không thuộc phạm vi chặn G5/G6 của bản hiện hành. Tiếp tục kế hoạch cũ; xem reports/KE_HOACH_PHAT_TRIEN_SAU_BAN_DAU.md, mục POST-V1-01.

## Yêu cầu đã xác nhận

- Seller có username GroupDeal bắt buộc; buyer không bắt buộc. Username GroupDeal tách khỏi username của từng mạng xã hội.
- Seller có thể liên kết tài khoản X, GitHub, Discord bằng xác thực quyền kiểm soát tài khoản. Mục đích là để buyer truy cập hồ sơ bên ngoài và tự đánh giá người bán.
- Hiển thị từng liên kết dưới dạng icon dịch vụ, username của tài khoản đó và hyperlink đến hồ sơ tương ứng. Link chỉ do người dùng nhập không đủ để coi là đã xác thực.
- Mỗi tài khoản mạng xã hội chỉ được liên kết với một tài khoản GroupDeal tại một thời điểm. Quy tắc áp dụng toàn hệ thống, không chỉ giao diện seller.
- Liên kết đã xác thực không chứng nhận chất lượng, danh tính pháp lý, quyền phân phối hoặc uy tín của seller. Giữ riêng các dấu xét duyệt đã có.

## Thiết kế đề xuất cho gói triển khai

- Từng dịch vụ là tùy chọn; không bắt seller kết nối đủ ba. Giai đoạn đầu là liên kết tài khoản, chưa mở thêm phương thức đăng nhập hay tính điểm uy tín.
- Hiển thị icon + username như một liên kết có tên truy cập rõ ràng, hỗ trợ bàn phím, mở hồ sơ đúng dịch vụ. Có chú thích “Đã xác thực liên kết” và thời điểm xác thực; không ngụ ý kiểm tra liên tục nếu hệ thống chỉ có bằng chứng tại một thời điểm.
- Xác định tài khoản bên ngoài bằng cặp provider + providerUserId ổn định. Backend bảo đảm duy nhất cho liên kết đang hoạt động bằng thao tác nguyên tử; không dùng username hoặc email làm khóa sở hữu. Hai yêu cầu đồng thời không được tạo hai chủ sở hữu.
- Nếu tài khoản xã hội còn liên kết với GroupDeal A thì từ chối gắn vào B, không tiết lộ thông tin riêng của A. Muốn chuyển: chủ tài khoản ngắt liên kết tại A, rồi xác thực lại tài khoản xã hội tại B. Không tự chuyển, gộp tài khoản hoặc kế thừa lịch sử uy tín.
- Ngắt liên kết phải xóa hiển thị xác thực ở hồ sơ công khai và các bản cache liên quan. Lưu nhật ký thay đổi tối thiểu để truy vết, không công khai lịch sử riêng tư.
- OAuth phải gắn với đúng phiên GroupDeal và provider, giới hạn thời gian, chống callback dùng lại và xin quyền tối thiểu. Liên kết/ngắt liên kết không đổi vai trò, ví nhận tiền, quyền sở hữu đơn hay yêu cầu ký đang có.
- Với seller cũ, đề xuất yêu cầu username trước khi đăng bán mới; vẫn cho xử lý đơn, giao hàng, tranh chấp và quyền lợi cũ.

## Kiểm chứng cần có khi triển khai

1. Liên kết thành công, từ chối cấp quyền, hết hạn và lỗi provider; chỉ thành công mới hiện liên kết xác thực.
2. Hai tài khoản GroupDeal cùng liên kết một provider ID, kể cả đồng thời: chỉ một liên kết hoạt động được chấp nhận.
3. Đổi username bên provider không làm mất quy tắc duy nhất hoặc gắn nhầm người; URL và nhãn được cập nhật từ dữ liệu đã xác thực.
4. Ngắt tại A rồi liên kết tại B phải xác thực lại; callback cũ không khôi phục liên kết đã hủy. Hồ sơ A không còn hiển thị liên kết.
5. Icon, username và hyperlink đúng hồ sơ; VI/EN, bàn phím, mobile và chữ 200%; không lộ token hoặc dữ liệu riêng.

Quyết định tiến độ cuối cùng ngày 18/10/2026: hoãn toàn bộ gói này đến kế hoạch phát triển sau bản đầu; thay cho đề xuất trước đây đưa vào trước G5/G6. Hoàn thiện Người dùng/Phân quyền, hành trình thật, vận hành và G5/G6 theo kế hoạch hiện hành. Khi bắt đầu gói tương lai cần kiểm lại source và yêu cầu nhà cung cấp tại thời điểm đó, lập kiểm chứng riêng cho phần thay đổi; không dùng đặc tả này làm bằng chứng đã hoàn thành.
