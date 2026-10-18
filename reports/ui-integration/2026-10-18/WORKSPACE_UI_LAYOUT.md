# Giao diện workspace: danh sách, sidebar và xem trước

Đã push và triển khai frontend **ac1dff554af998c0fb700289ea635b00a9f6bf01** lên https://groupdeal.thanhtan.top. Backend30fea223380affc471cc91f4ab2390814ddaa87c/ops73b6fae/SDK5458925/Safe pagecf29838 giữ nguyên; không restart backend hoặc đổi Nginx.

| Chỗ | Đã sửa | Bằng chứng và giới hạn |
|---|---|---|
| Header | Chỉ giữ Trang chủ/Khám phá; đơn mua,ví,tài khoản,hỗ trợ,kênh người bán,nạp tiền/ngôn ngữ ở menu tài khoản. Header không xuống hàng. | CUA VI/EN có phạm vi,khổ320–1280; live header2links. Các guard đăng nhập/kết nối không đổi. |
| Admin/seller | Bỏ giới hạn1280px ở workspace;sidebar256px cố định sát trái và cao theo viewport,tự cuộn;dưới1024px mở drawer trái. |22observations khôngtrànngang;desktopsidebarleft0/fixed,drawer375left0/height812. |
| Xác minh/bản quyền | Hai danh sách riêng,có tìm/lọc và xem thêm;dòng tóm tắt,chi tiết/quyết định chỉ mở hồ sơ được chọn. |12rights/4sellers synthetic;live2rights/3seller rows. Không gửi quyết định hoặc đổi huy hiệu. Chặn chuyển danh sách khi đang ký/lưu. |
| Sản phẩm seller | Danh sách một cột gọn;form tạo/sửa mở khi cần;giữ nội dung khi ẩn/mở. |4products synthetic;UI đã deploy. Không tạo/upload/archive/version mới. |
| Tạo deal/preview | Bỏ cột preview thường trực và khối thống kê khỏi bước tạo;stepper ngang. Nút mắt “Xem trước” mở khung bản nháp riêng,có desktop/điện thoại. |Escape đóng và trả focus;nháp giữ nguyên. Preview nằm tại editor để cả thay đổi chưa lưu vẫn xem được,không tạo URL công khai hoặc publish draft. Live mở/đóng đúng draft FILE_LINK. |
| Khoảng cách | Thêm nhịp24px cho ui-stack,form/toolbar/danh sách có gap16–24px;sidebar và header có padding riêng. |Đã sửa một xung đột CSS lazy khiến sidebar thiếu padding/không cao hết màn.22measurements và ảnh ghi đúng phạm vi,không phải mọi route/engine/200% đã chạy lại. |

Typecheck/configured production build đạt;180file main package,không source maps hoặc fixture identifiers,public secret scan0.18kiểm CUA chức năng và22observations responsive đạt;14HTTPS entry/JS/CSS/route byte checks đạt. Bốn vùng hàm quyết định rights/badge/save-product/probe/publish giữ byte-identical với source trước;không đổi backend/contract/SDK hoặc API tài chính. Không chạy full test/CI;source push dùng skip ci theo phạm vi UI.

Lượt deploy đầu dừng PRECHECK/PUBLIC_INVENTORY_CHANGED trước mọi write. Danh mục185file là active181main+4Safe,không phải toàn bộ filesystem. Chẩn đoán chỉ đọc thấy3069file,gồm2884assets hash lịch sử. Đã đối toàn bộ3069preimages;triển khai180file mới,giữ3066file cũ bất biến,thêm87assets,thay3entry atomically. Hiện active184=180main+4Safe,toàn bộfilesystem3156file;không xóa asset để tab cũ vẫn dùng được. Giữ log reject,chẩn đoán,rollback path và kết quả cuối.

Live inspection dùng phiên hiện có,không login/ký mới. GET enrollment200;quyền/dispute/reconcile/seller ban đầu409. Một lượt bấm tải lại có kiểm soát trả200;live2rights/3sellerrows khôngalert hiển thị,0form quyết định mở. Giữ SANITIZED HTTP diagnostic và ảnh lỗi đầu,không ghi lượt đầu thành PASS;chưa chứng nhận mọi tình huống cạnh tranh/read conflict.

Đã mở **đúng** bản nháp mới tại https://groupdeal.thanhtan.top/seller/create?draft=draft_d702e1b5-2db3-4795-943c-a08dad36cafb bằng bundle mới,đọc publication sẵn có và mở/đóng preview;không save/prepare/READY/publish. Tab chờ ký cũ khôngreload. User có thể tiếp tục từ tab mới đúngdraft;không dùng URL draft_060109bf cũ để tránh mở bản mặc định105→89. Currentoperation **op_1510d8a7-f9d8-4c8e-bb38-4eebe9079f8b**,phasePREPARED,nohash;termsHash0x0dfdab6f71e61e663a2ff3f3b1ef6b85ec5d4ba8030e23f608db61aa8432df51,version3 giữ.

Read-only native trước2026-10-18T07:01:18.308Z và sau2026-10-18T07:11:53.947Z:19users/6campaigns/5orders/37operations/6grants/12inventory,cùng operation/campaign;hash5đơn cũf864e1a7f21a123450f6d17111f2f0bbc5514557bb47d048b1cd521622b24ae9,ledger52/64/hash209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4,95held đều giữ. Runtime2026-10-18T07:07:10.524Z:377files/PID97197/NRestarts0;activepublic184hashes;backup VERIFIED/privateRestore/BACKUP_CURRENT/timers đạt. Đây không phải offhost/RPO/RTO hoặc G5/G6 acceptance.

Không cần user chốt lại bố cục hoặc làm thao tác UI cho gói này. FILE_LINK vẫn chờ user về seller24F0…7580 tự kiểm gas/ký xuất bản cùngintent,khi quay lại hành trình;chưabuy/delivery/download/confirm/claim. Circle/admin mutations khác hoãn,username/social POST-V1;Safe3control signatures và user3human declaration kế thừa đúng context,không hỏi ký lại. NOT_FROZEN/G5OPEN/G6OPEN;acceptanceEligible=false/wholeProjectAccepted=false.

Proof: reports/evidence/workspace-ui/2026-10-18T06-43-43-002Z/CHECKS.json
SHA256: 3b7181c810fb149171305b8f83b4b83055e4285a5204dca6fc8aa62eeb169414
