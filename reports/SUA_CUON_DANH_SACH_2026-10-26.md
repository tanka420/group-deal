# Sửa cuộn danh sách và bố cục hoạt động ví — 26/10/2026

Đã phát hành frontend `cec316099f670edecf255e40f9cc0c71016f6ea7` lên [GroupDeal](https://groupdeal.tech/wallet) lúc 2026-10-26T04:21:05.663Z. Backend giữ nguồn `8c32212fdb051cdb01f98226932f3a61afa3e9bf`. Preview local tại `http://127.0.0.1:5173` cũng dùng cùng artifact frontend.

## Thay đổi

- Hoạt động ví nằm dưới Số dư thanh toán trên desktop và điện thoại.
- Ba tab mua bán, gửi/hoán đổi và lịch sử/phục hồi có vùng danh sách cuộn riêng, giới hạn ở mức nhỏ hơn giữa 60% chiều cao màn hình và 40rem. Thẻ ngoài giãn theo nội dung; phần phục hồi và các thao tác chi tiết không bị cắt.
- Bộ lọc, nhãn và phân trang nằm ngoài vùng cuộn. Giữ phân trang 20 bản ghi, các guard tài khoản/principal và luồng xử lý hiện có.
- Danh sách đơn, sản phẩm, chiến dịch, hồ sơ vận hành, tài nguyên, hỗ trợ, ví/phiên liên kết và seller đang theo dõi dùng khung cuộn thống nhất. Các dòng cách nhau 12–16px; không đổi các thẻ duyệt catalog hoặc nội dung hướng dẫn thành danh sách cuộn.
- Cập nhật hai test bố cục cũ vốn yêu cầu ví xếp hai cột theo yêu cầu mới xếp dọc. Không đổi API hoặc hành vi ký/gửi giao dịch.

## Kiểm tra

- Typecheck và build production đạt. 13 ca browser liên quan đạt; hai ca khoảng cách bảng được chạy lại sau sửa CSS. Có kiểm tiếng Việt/Anh, 375/1440px, chữ 200%, phân trang 20/20/5 và 20/4, cuộn tới dòng cuối, mở chi tiết phục hồi, thao tác bàn phím và lọc dữ liệu.
- Tám kiểm tra trên chính bundle production với API SQL fixture cô lập đạt cho ví, đơn hàng, sản phẩm và chiến dịch ở 375/1440px. Các request ghi bị chặn; không dùng dữ liệu live.
- Probe quét 55 khổ từ 375 đến 1440px không phát hiện trang tràn ngang. P1/P2/P6 của bộ đo bỏ qua nền gradient nút; P3/P7 đọc sai màu paint của logo — đã đối chiếu ảnh thực tế. P4/P8/P9 là nhãn tab xuống dòng theo bố cục có sẵn; P5 là link footer dài xuống dòng. Nội dung vẫn đọc đủ; giữ brand và cách xuống dòng hiện có.
- [CI của đúng commit](https://github.com/tanka420/group-deal/actions/runs/40264398957) đạt 78/78 bước, completeScope=true; đã đối chiếu artifact kết quả tải từ GitHub với source commit.
- Triển khai 186 tệp; 185 tệp public trên HTTPS khớp SHA-256 với artifact và 13 kiểm tra route/biên HTTP đạt. Preview local cũng khớp 185 tệp và 9 route. Ví xếp dọc, không tràn ngang ở 375/1440px trên cả local và HTTPS.
- Artifact tar SHA-256: `d433426d35c4440ec971c8d036d2cbdc29a175cec0d4926c8e6aa2bf2ade1e0f`. Hai định danh public Circle/Reown khớp cấu hình VPS hiện có.

## Phạm vi vận hành và bàn giao

Backend không restart; PID và NRestarts giữ nguyên trong kiểm tra trước/sau. Không đổi nginx, cấu hình provider, biến môi trường hoặc launcher. Giữ các asset cũ và bản sao entry files để có thể phục hồi frontend.
Người dùng đã dừng phần UAT còn lại để tự kiểm tra và báo vấn đề. Thay đổi UI này không miễn ca nghiệm thu hoặc tự chuyển G5/G6 thành đạt. Không ký/gửi giao dịch, gửi email/webhook, đổi quyền, tác động đơn 1–7 hay giải phóng 95 hold. Báo cáo review gốc chưa commit được giữ nguyên hash.

Receipt VPS: `/home/ubuntu/groupdeal/operations/FRONTEND-RELEASE.json`. Bằng chứng kỹ thuật, ảnh và preimage riêng ở `.cache/wallet-list-release-2026-10-26/`; không đưa dữ liệu riêng vào Git.
