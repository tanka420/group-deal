> **Phạm vi hiện hành 24/10/2026:** Đây là đặc tả xây lại lịch sử. Công việc hiện tại tiếp tục repository/bản nền VPS theo AGENTS.md, không khởi tạo codebase mới. Xem [trạng thái đã phát hành](../../reports/HOAN_THIEN_DU_AN_HIEN_TAI_2026-10-21.md) và [phạm vi G5/G6 còn mở](../../reports/PHAM_VI_G5_G6_CON_LAI_2026-10-24.md).

# GroupDeal tài liệu bàn giao xây dựng dự án mới

Ngày tổng hợp: 06/10/2026. Cập nhật chia file: 07/10/2026. Đối tượng sử dụng: chủ sản phẩm, thiết kế, lập trình viên, QA và người vận hành tiếp nhận GroupDeal để xây dựng từ đầu.

GroupDeal là nền tảng mua chung sản phẩm số: người bán công bố các ngưỡng tham gia và giá giảm tương ứng; người mua cam kết USDC, hưởng giá cuối của nhóm và nhận quyền sử dụng riêng theo điều khoản đã mua. Hợp đồng trên Arc Testnet giữ tiền và cưỡng chế quyền tài chính. Ứng dụng cung cấp toàn bộ hành trình bán, mua, giao hàng, hỗ trợ, tranh chấp và rút tiền.

Kết quả cần bàn giao là **một sản phẩm web hoàn chỉnh trên Arc Testnet với codebase mới**, dùng dịch vụ thật, sản phẩm giao được và giao dịch được xác minh. Bản xây mới có repository, database, deployment và hồ sơ nghiệm thu riêng. Trạng thái hoàn thành, địa chỉ hợp đồng, credential và dữ liệu của repository hiện tại không được tự chuyển sang dự án mới.

## Đọc và triển khai

| Thứ tự | File | Nội dung |
|---|---|---|
| 1 | [README](./README.md) | Mục tiêu bàn giao, thứ tự đọc và nguồn tham chiếu |
| 2 | [01 Sản phẩm và nghiệp vụ](./01_SAN_PHAM_VA_NGHIEP_VU.md) | Mục tiêu, vai trò, chức năng và cấu hình chiến dịch |
| 3 | [01B Tài chính và giao hàng](./01B_TAI_CHINH_VA_GIAO_HANG.md) | Giá/rebate/claim, principal, delivery và dispute |
| 4 | [01C Màn hình và chính sách](./01C_MAN_HINH_VA_CHINH_SACH.md) | Trạng thái, UX, tiện ích và quyết định còn mở |
| 5 | [02 Kiến trúc tổng thể](./02_KIEN_TRUC_VA_DU_LIEU.md) | Thành phần, stack, manifest và nguồn dữ liệu |
| 6 | [02B Contract và dữ liệu](./02B_CONTRACT_VA_DU_LIEU.md) | Protocol, authorization, accounting, bảng và constraints |
| 7 | [02C Giao dịch và tích hợp](./02C_GIAO_DICH_VA_TICH_HOP.md) | Operation, ví/funding, indexer, đối soát, API/SDK/webhook |
| 8 | [02D Bảo mật và vận hành](./02D_BAO_MAT_VA_VAN_HAN.md) | Secret, encryption, backup, runbook và bài học |
| 9 | [03 Lộ trình và yêu cầu](./03_LO_TRINH_VA_NGHIEM_THU.md) | Giai đoạn, trách nhiệm, R01–R17 và test tài chính |
| 10 | [03B Kiểm thử và nghiệm thu](./03B_KIEM_THU_VA_NGHIEM_THU.md) | Outage/recovery, live journeys, bằng chứng và bàn giao |
| 11 | [04 Prompt khởi tạo](./04_PROMPT_KHOI_TAO_DU_AN.md) | Bản giao việc rút gọn cho đội phát triển hoặc coding agent |

Bộ bàn giao có **11 file Markdown, mỗi file dưới 10.000 ký tự**, tính cả khoảng trắng và xuống dòng. Chín phần đặc tả giữ nguyên nội dung của ba file dài trước đây, chia tại ranh giới mục; không cắt bảng, ví dụ, sơ đồ hoặc quy tắc nghiệp vụ.

Gửi toàn bộ 11 file. Nếu công cụ nhận theo từng lượt, gửi theo thứ tự bảng và yêu cầu bên nhận chờ đủ tài liệu trước khi triển khai. Prompt là bản giao việc rút gọn, cần đi cùng toàn bộ đặc tả. Đội tiếp nhận nên tạo sổ quyết định cho các mục còn mở trước khi triển khai tính năng liên quan; phần đã xác định có thể làm ngay.

Ảnh thiết kế là tài liệu bổ sung trong thư mục `image`; chỉ gửi thêm nếu muốn giữ hướng thiết kế. Các nguồn repository ở cuối README dùng để truy vết, không bắt buộc gửi toàn bộ source cũ.

## Phạm vi đã xác định

- Thị trường đầu tiên là Việt Nam; tiếng Việt là ngôn ngữ chính, các luồng cốt lõi có tiếng Anh.
- Một tài khoản có thể là buyer và seller. Operator và Security Multisig có quyền riêng.
- Sản phẩm số phải có quyền phân phối và entitlement riêng theo order; phương thức giao phù hợp với sản phẩm thật của seller.
- Mạng nghiệm thu của bản đầu là Arc Testnet; settlement bằng USDC, phí nền tảng ban đầu bằng 0.
- Có marketplace, hồ sơ seller, dashboard buyer/seller/operator, giao hàng, rebate/refund/claim, dispute, support, review, thông báo và tích hợp seller.
- Có quản lý secret, audit, đối soát, giám sát, sao lưu, phục hồi và kiểm thử toàn hành trình.

Mainnet, thanh toán token khác, phí khác 0 và onramp là các phần mở rộng có quyết định và nghiệm thu riêng. Chúng không thay đổi điều kiện hoàn tất bản Testnet.

## Quy tắc đọc đặc tả

**Yêu cầu bắt buộc** được tổng hợp từ mục tiêu trong `PLAN.md` và yêu cầu xây mới. **Thiết kế đề xuất** là cách hiện thực hóa để đội kỹ thuật lựa chọn và ghi quyết định. **Quyết định còn mở** cần chủ sản phẩm hoặc người phụ trách kỹ thuật chốt trước khi bật tính năng tương ứng. Ví dụ tính tiền là dữ liệu minh họa cho kiểm thử, không phải số liệu kinh doanh.

Khi nguồn cũ mâu thuẫn, dùng mục tiêu xây mới và yêu cầu nghiệp vụ trong `PLAN.md` làm gốc. Ví dụ, chỉ dẫn tiếp tục sửa codebase/candidate cũ trong kế hoạch bảo trì không áp dụng cho bản xây mới; mục tiêu Mainnet trong báo cáo mở rộng không biến thành mạng nghiệm thu của bản đầu. Khả năng Arc/Circle/Reown phải được kiểm lại bằng tài liệu chính thức và môi trường thực tại thời điểm triển khai.

## Nguồn tham chiếu trong repository hiện tại

Các nguồn dưới đây giúp truy vết hoặc xem thêm thiết kế; đội tiếp nhận không cần tiếp tục lịch sử thực thi của chúng.

| Nguồn | Nội dung sử dụng |
|---|---|
| [Yêu cầu xây mới](../../PLAN.md) | Mục tiêu sản phẩm và các ràng buộc nghiệp vụ gốc |
| [README hiện tại](../../README.md) | Cấu trúc các thành phần và giới hạn nghiệm thu của bản hiện tại |
| [Kế hoạch hoàn thiện cũ](../../reports/KE_HOACH_HOAN_TAT_DU_AN.md) | Bài học về phân quyền, accounting, projection, delivery và nghiệm thu |
| [Kiến trúc Arc](../../reports/KIEN_TRUC_ARC_VA_PHAM_VI_TICH_HOP.md) | Phân chia settlement, ví và funding |
| [Định hướng sản phẩm](../../reports/BAO_CAO_DINH_HUONG_SAN_PHAM_VA_FRONTEND_03_10_2026.md) | Tách Product, Campaign, Order và ba khu vực sử dụng |
| [Phân tích thiết kế](../../reports/PHAN_TICH_ANH_VA_DINH_HUONG_THIET_KE_FRONTEND_03_10_2026.md) | Bố cục, responsive và ngôn ngữ thiết kế |
| [Ảnh tham chiếu](../../image/) | Năm mockup định hướng; số tiền, brand và số liệu trong ảnh không phải điều khoản mặc định |
| [Contract tham chiếu](../../contracts/contracts/GroupDealHub.sol), [candidate V2](../../contracts/contracts/GroupDealHubV2.sol) | So sánh các cách xử lý escrow và rebate; cần đặc tả và kiểm chứng lại khi viết mới |

Bộ tài liệu này tổng hợp yêu cầu để xây dựng. Nó không chứng nhận bản hiện tại đã hoàn tất, không chứng nhận live state và không thực hiện triển khai mới.
