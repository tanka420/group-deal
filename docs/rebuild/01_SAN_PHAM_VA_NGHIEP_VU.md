# GroupDeal mục tiêu sản phẩm và chức năng

GroupDeal giúp người bán sản phẩm số mở đợt bán theo giá nhóm và giúp người mua hưởng giá cuối thấp hơn khi có thêm người hoặc đơn vị tham gia. Người mua chuyển USDC vào hợp đồng khi cam kết; sau khi chốt chiến dịch, nhận quyền sử dụng sản phẩm và rút phần tiền được phân bổ cho mình. Bản đầu phải hoàn thành toàn bộ hành trình trên Arc Testnet.

[Mục lục](./README.md) · [Phần tiếp](./01B_TAI_CHINH_VA_GIAO_HANG.md)

## 1 Mục tiêu và giá trị sản phẩm

Người bán chủ động công bố sản phẩm, quyền được nhận, điều kiện sử dụng, cách giao và các mức giá. Người mua nhìn thấy số tiền thực phải cam kết, khả năng giảm thêm và thời hạn xử lý. GroupDeal cung cấp escrow, giao hàng theo order, cơ chế hỗ trợ và giải quyết tranh chấp có giới hạn quyền rõ ràng.

Một entitlement là quyền truy cập được giao cho một order: license key, số seat, tài nguyên tải xuống, lời mời kích hoạt tài khoản, quyền học khóa học hoặc gói dịch vụ. Quantity phải có đơn vị rõ như license/seat/gói. Không mặc định quantity luôn tương ứng một mã khóa; cần mapping theo điều khoản sản phẩm.

Sản phẩm phục vụ thị trường Việt Nam trước, có tiếng Việt đầy đủ và tiếng Anh cho các hành trình cốt lõi. Arc là hạ tầng settlement; thông tin sản phẩm, giá nhóm và quyền người mua là trọng tâm trải nghiệm.

Test USDC được dùng cho nghiệp vụ và giao dịch của bản Testnet. Số liệu thử nghiệm cần được phân loại đúng trong báo cáo nội bộ, không ghi thành doanh thu tiền thật.

Các yêu cầu của bản đầu bao gồm chức năng người dùng, dịch vụ giao thật, vận hành và nghiệm thu. Có thể triển khai theo giai đoạn, nhưng một lát cắt chạy được chưa đủ để gọi toàn dự án hoàn tất.

## 2 Vai trò và giới hạn quyền

| Vai trò | Công việc được thực hiện | Giới hạn bắt buộc |
|---|---|---|
| Khách chưa đăng nhập | Duyệt catalog công khai, xem sản phẩm, seller và điều khoản | Không xem entitlement, bằng chứng riêng tư hoặc dữ liệu buyer |
| Buyer | Đăng nhập, chọn ví, cam kết mua, xem order, nhận entitlement, xác nhận, dispute, claim, support, review | Quyền tài chính thuộc buyer principal đã ghim cho chiến dịch |
| Seller | Quản lý hồ sơ, sản phẩm, quyền phân phối, tồn kho, campaign, giao hàng, support và seller claim | Chỉ tài nguyên của mình; không sửa điều khoản đã khóa hoặc đổi người nhận tiền của campaign cũ |
| Operator | Review seller/quyền phân phối, hỗ trợ, theo dõi vận hành, phân xử dispute | Chỉ phân bổ khoản đang tranh chấp giữa hai principal của order; không tự sửa giá, phí, ví hoặc order khác |
| Security Multisig | Xử lý hủy khẩn cấp và các quyền an ninh được đặc tả | Hủy chỉ hoàn phần chưa phân bổ; có lý do, giao dịch và audit |
| Dịch vụ hệ thống | Cấp authorization, index sự kiện, giao hàng, gửi thông báo, đối soát | Không được tự ký thay user hoặc dùng database làm nguồn quyết định tiền |

Một account có thể có cả quyền buyer và seller. Quyền operator phải được cấp riêng. Role trong ứng dụng và authority ký trên contract phải được đối chiếu; một người có màn hình operator chưa tự có quyền gọi mọi hàm contract.

Seller và operator cần xác thực mạnh cho thao tác nhạy cảm. Cách step-up, thời hạn xác thực lại và danh sách thao tác áp dụng phải được chốt trong thiết kế bảo mật.

## 3 Các khái niệm phải tách riêng

| Khái niệm | Ý nghĩa |
|---|---|
| Product | Sản phẩm gốc của seller, thông tin mô tả, media, loại quyền sử dụng và cách hỗ trợ |
| Product version | Phiên bản nội dung và điều khoản sử dụng được lưu để truy vết |
| Rights review | Khai báo và xét quyền phân phối; khác với xác minh danh tính seller |
| Campaign | Một đợt bán của product với tier, thời hạn, tồn kho, delivery SLA và điều khoản tài chính |
| Order | Một cam kết mua đã được xác nhận; lưu quantity, giá khóa, principal và snapshot quyền đã mua |
| Campaign identity | Định danh account trong một campaign; nhiều ví cùng account không thành nhiều buyer |
| Principal | Địa chỉ ví có quyền tài chính đã ghim; khác với ví đang được chọn trong UI |
| Operation | Một lần thực hiện hành động có lifecycle riêng như publish, buy, delivery hoặc claim |
| Allocation | Số tiền đã phân bổ quyền cho buyer hoặc seller; chưa có nghĩa đã chuyển về ví |
| Claim | Giao dịch rút phần đã được phân bổ về đúng principal |

Một campaign có nhiều order. Một account có thể mua nhiều lần trong cùng campaign từ đúng principal đã ghim, trong giới hạn tổng quantity. Các lần mua là các order riêng nhưng buyer count chỉ tăng một lần cho campaign identity đó.

## 4 Chức năng theo vai trò

### Buyer

- Đăng ký và đăng nhập bằng email OTP; tạo hoặc khôi phục Circle User-Controlled EOA, hoặc liên kết ví EVM ngoài đã chứng minh quyền kiểm soát.
- Tìm kiếm, lọc và xem deal; biết sản phẩm, seller, edition, license/seat, điều khoản, giá, metric, tier, thời hạn và cách nhận hàng.
- Chọn quantity; kiểm tra giới hạn account, tồn kho, principal, số USDC cam kết và gas trước khi duyệt.
- Theo dõi giao dịch, khôi phục operation khi tải lại trang hoặc đổi thiết bị; nhận biết pending, revert, provider lỗi và indexer chậm.
- Xem thư viện sản phẩm, order, entitlement, giá cuối, rebate, refund, allocation, đã rút và còn có thể rút.
- Xác nhận nhận hàng, mở dispute, bổ sung bằng chứng, tạo support thread, claim và đánh giá order đủ điều kiện.
- Quản lý thông báo, contact đã xác minh, ví liên kết và phiên đăng nhập.

Đăng nhập trực tiếp bằng ví là luồng bổ sung được repository hiện tại hỗ trợ. Nếu giữ ở bản mới, phải dùng challenge có nonce dùng một lần, chain/address/origin/purpose và thời hạn; việc nối ví không tự là bằng chứng đăng nhập.

### Seller

- Tạo hồ sơ và chứng minh quyền kiểm soát payout wallet.
- Tạo product, phiên bản license, media, yêu cầu sử dụng và khai báo quyền phân phối; gửi bằng chứng riêng tư để review.
- Chuẩn bị tài nguyên giao, tồn kho hoặc adapter; thử nhận hàng từ góc buyer trước publish.
- Tạo, lưu, sửa và xem trước draft campaign; cấu hình PUBLIC hoặc UNLISTED.
- Quản lý các campaign, order, tier, tồn kho, hạn giao, dispute, support, review và tiền có thể rút.
- Giao entitlement theo order, xử lý retry và cung cấp bằng chứng; claim khoản đã được phân bổ.
- Chia sẻ link, QR, ảnh và widget chỉ đọc; cấu hình webhook và dùng SDK.

### Operator

- Có hàng đợi review seller và quyền phân phối với bằng chứng, kết luận, người xử lý và lịch sử.
- Xem campaign/order/timeline, hạn SLA và cửa sổ dispute; truy về receipt và trạng thái tài chính.
- Tiếp nhận support; phân xử dispute thành buyer share và seller share đúng khoản được giữ.
- Theo dõi đối soát, RPC/indexer, delivery, email/webhook outbox và dead-letter; thực hiện retry/redrive theo quyền.
- Có audit cho thao tác nhạy cảm và quy trình phối hợp Security Multisig khi có sự cố.

## 5 Cấu hình và vòng đời chiến dịch

| Thuộc tính | Yêu cầu |
|---|---|
| Tier | 2–5 tier; threshold tăng nghiêm ngặt, price giảm nghiêm ngặt, price lớn hơn 0 |
| Metric | `BUYER_COUNT`: số account/campaign identity đủ điều kiện có cam kết; `UNITS_COUNT`: số đơn vị đã thanh toán |
| Giới hạn account | Cưỡng chế trên tổng quantity của account trong campaign |
| Tồn kho | Có thể giới hạn; không bán vượt tồn kho, kể cả hai giao dịch cạnh tranh |
| Thời gian | Từ 24 giờ đến 30 ngày; mặc định 7 ngày; lưu UTC và hiển thị múi giờ rõ |
| Đóng do hết hàng | Có thể tự đóng khi hết tồn kho theo điều khoản đã công bố |
| SLA giao hàng | 24 hoặc 48 giờ từ mốc finalise |
| Early rebate | Tùy chọn, mặc định tắt; nếu bật, chọn fixed hoặc percentage và số slot |
| Phí nền tảng | Bằng 0 trong bản đầu; policy/version khóa theo campaign |
| Visibility | PUBLIC có thể được khám phá; UNLISTED chỉ tiếp cận qua link theo policy |
| Snapshot | Ghim phiên bản logic tài chính, product/license, terms và payout wallet |

`BUYER_COUNT` không có nghĩa hệ thống đã xác minh mỗi account là một con người duy nhất. `UNLISTED` là giới hạn khả năng khám phá trong app/API, không bảo đảm giữ bí mật các giao dịch trên blockchain công khai.

Draft được sửa đầy đủ. Campaign đã publish nhưng chưa có cam kết có thể được chỉnh/rút qua workflow thực sự được contract hỗ trợ. Nếu contract không hỗ trợ đổi tại chỗ, hủy bản chưa có cam kết và publish campaign mới có liên kết phiên bản.

Ngay sau cam kết có tiền đầu tiên, khóa metric, tiers/prices, deadline, inventory, quyền được nhận, SLA, refund/cancel policy, early rebate, phí và payout wallet. Đính chính không vật chất có lịch sử và không thay snapshot gốc. Việc sửa product sau này hoặc archive product không làm mất quyền của order cũ.

Tier đã mở không lùi để tăng giá. Campaign kết thúc ở tier tốt nhất đã mở. Chưa đạt tier giảm tiếp không tự trở thành chiến dịch thất bại: yêu cầu gốc chưa đặt funding goal.

