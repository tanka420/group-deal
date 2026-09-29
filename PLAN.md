GROUPDEAL — YÊU CẦU XÂY DỰNG DỰ ÁN MỚI

MỤC TIÊU

Xây GroupDeal từ đầu thành sản phẩm web hoàn chỉnh, có thể triển khai và vận hành cho người dùng trên Arc Testnet. Testnet là mạng blockchain được chọn cho phiên bản này; nó không phải lý do để làm bản mẫu, dùng dữ liệu giả hoặc bỏ bớt chức năng.

Sản phẩm phải chạy được toàn bộ hành trình: seller tạo và vận hành chiến dịch; buyer dùng ví để cam kết USDC trên Arc Testnet; giá thay đổi theo số người hoặc đơn vị tham gia; hệ thống quyết toán, giao quyền truy cập sản phẩm số, xử lý rebate, refund, tranh chấp, claim và đối soát. Operator có công cụ để thực hiện các tác vụ vận hành trong quyền hạn được cấp.

Hãy tạo codebase mới. Không tiếp tục các candidate, task packet, commit hoặc trạng thái thực thi của repo GroupDeal cũ.

1. NGƯỜI DÙNG VÀ GIÁ TRỊ SẢN PHẨM

GroupDeal giúp seller bán sản phẩm số theo giá nhóm: seller công bố trước các ngưỡng tham gia và mức giá giảm tương ứng. Buyer biết mức giá tối đa khi tham gia và được hưởng mức giá cuối thấp hơn nếu chiến dịch đạt ngưỡng cao hơn.

Mỗi order phải nhận quyền truy cập riêng theo điều khoản seller đã công bố, chẳng hạn license, seat, khóa truy cập, file, khóa học hoặc gói dịch vụ. Thiết kế giao hàng cho sản phẩm thực tế của seller; không mặc định chỉ giao bản demo. Không dùng chung tài khoản, mật khẩu hoặc entitlement trái quyền.

Thị trường đầu tiên là Việt Nam. Giao diện chính bằng tiếng Việt; các luồng cốt lõi có tiếng Anh. Một tài khoản có thể đồng thời là buyer và seller.

2. CHỨC NĂNG BUYER

Buyer có thể:

- Đăng ký và đăng nhập bằng email OTP.
- Dùng ví Circle User-Controlled EOA hoặc liên kết ví EVM bên ngoài.
- Xem trang chiến dịch, điều khoản, bảng giá, số lượng tham gia, thời gian còn lại, thông tin seller và cách giao sản phẩm.
- Xem tổng tiền cam kết và gas trước khi phê duyệt giao dịch.
- Theo dõi giao dịch từ lúc gửi đến khi có kết quả được xác nhận.
- Xem order, giá cuối, quyền truy cập đã giao, rebate/refund và số tiền có thể claim.
- Xác nhận đã nhận sản phẩm, mở tranh chấp, bổ sung bằng chứng, rút claim.
- Liên hệ hỗ trợ và đánh giá seller cho order đủ điều kiện.

Các trạng thái pending, thất bại, giao dịch bị revert, provider ngừng hoạt động và indexer chậm phải được hiển thị đúng; không báo thành công tài chính khi chưa có bằng chứng onchain cần thiết.

3. CHỨC NĂNG SELLER

Seller có thể:

- Tạo hồ sơ seller và chứng minh quyền kiểm soát ví nhận tiền.
- Tạo nháp, cấu hình, thử luồng giao sản phẩm rồi xuất bản chiến dịch.
- Chọn chiến dịch công khai hoặc chỉ truy cập qua link.
- Cấu hình tier, giá, số lượng, tồn kho, thời gian, SLA, phương thức giao hàng, chính sách hủy và early-supporter rebate.
- Theo dõi buyer, đơn hàng, tier đã mở, hạn giao, tranh chấp và tiền có thể rút.
- Giao entitlement qua license key mã hóa, file/link bảo vệ, kích hoạt tài khoản, webhook/API hoặc phương thức phù hợp với sản phẩm.
- Trả lời support, cung cấp bằng chứng giao hàng và phản hồi đánh giá.
- Dùng link, QR, ảnh chia sẻ và widget chỉ đọc để đưa khách hàng tới chiến dịch.

Có hai loại xác minh riêng: danh tính/tư cách seller và quyền phân phối của sản phẩm hoặc chiến dịch. Badge phải thể hiện đúng điều đã được xác minh, không được ngầm bảo đảm chất lượng sản phẩm.

4. QUY TẮC CHIẾN DỊCH

Mỗi chiến dịch có 2–5 tier, ngưỡng tăng dần và giá giảm dần. Seller chọn chỉ số tier là số tài khoản buyer đủ điều kiện hoặc số đơn vị đã thanh toán. Hệ thống dùng đúng tên chỉ số đó trong giao diện.

Seller đặt giới hạn mua theo tài khoản, có thể đặt giới hạn tồn kho. Chiến dịch kéo dài từ 24 giờ đến 30 ngày, mặc định 7 ngày; hết tồn kho có thể tự đóng. Lưu mốc thời gian chuẩn theo UTC.

Trước cam kết đầu tiên, seller có thể chỉnh sửa hoặc rút chiến dịch. Sau cam kết đầu tiên, khóa các điều khoản ảnh hưởng quyền và tiền: metric, tier, giá, hạn chót, tồn kho, entitlement, SLA, chính sách hoàn/hủy, early rebate, phí và ví nhận tiền. Đính chính không vật chất được lưu thành bản bổ sung có lịch sử, không thay điều khoản gốc.

Tier đã mở khóa không được lùi để tăng giá của những buyer còn lại. Việc buyer hủy hợp lệ không được làm các buyer khác phải trả giá cao hơn.

5. CAM KẾT, GIÁ CUỐI VÀ EARLY REBATE

Khi mua, buyer khóa số USDC bằng giá tier hiện tại nhân số lượng. Gas là khoản riêng.

Khi chiến dịch đóng, tier thấp nhất đã mở khóa xác định giá cuối chung cho mọi buyer. Người cam kết ở giá cao hơn nhận rebate bằng phần chênh lệch.

Early-supporter rebate là tùy chọn và mặc định tắt. Seller có thể chọn số slot và rebate dạng phần trăm hoặc cố định. Rebate chỉ áp dụng cho đơn vị đầu tiên của mỗi buyer đủ điều kiện. Slot được xác định theo thứ tự cam kết onchain đã xác nhận, không theo lúc buyer mở trang checkout. Nếu buyer yêu cầu phải còn slot, giao dịch phải thất bại khi slot đã hết; không âm thầm thực hiện với lợi ích thấp hơn.

Dùng phép tính số nguyên theo đơn vị nhỏ nhất của USDC. Không dùng floating point trong logic tài chính.

6. DANH TÍNH, VÍ VÀ QUYỀN TÀI CHÍNH

Mỗi account có một campaign identity riêng cho từng chiến dịch. Nhiều ví của một account không tạo ra nhiều buyer count. Một ví EVM bên ngoài chỉ được liên kết chủ động với một GroupDeal account tại một thời điểm, được cưỡng chế bằng ràng buộc dữ liệu nguyên tử.

Cam kết có tiền đầu tiên phải đồng thời ghim ví tham gia làm buyer principal bất biến cho campaign identity đó. Ví khác, dù liên kết cùng account, không được mua thêm hoặc thực hiện quyền tài chính thay principal đã ghim. Đổi email, liên kết lại ví, khôi phục hay đình chỉ account không được chuyển rebate, refund hoặc claim cho một principal khác.

Authorization mua phải ràng buộc chain, campaign/contract, điều khoản đã công bố, campaign identity, ví, hành động, nonce, số lượng và hạn dùng. Contract phải chống replay và kiểm tra đúng các ràng buộc đó.

Không đưa email, account ID, license key hoặc định danh có thể liên kết người dùng giữa các chiến dịch lên chain. “Tài khoản mua đủ điều kiện” không được mô tả là đã xác minh một con người duy nhất.

7. GIAO HÀNG, REFUND VÀ TRANH CHẤP

SLA giao hàng là 24 hoặc 48 giờ sau khi chiến dịch được finalise. Seller phải hoàn thành bài kiểm tra giao hàng trước khi xuất bản. Entitlement bí mật được bảo vệ ở offchain và không xuất hiện trong log hoặc sự kiện onchain.

Nếu không có bằng chứng giao đúng hạn, khoản tiền sản phẩm còn chờ của order được phân bổ lại cho buyer; seller không được nhận khoản đó. Sau khi giao, buyer có 48 giờ để xác nhận hoặc mở tranh chấp. Buyer có thể xác nhận sớm; nếu hết cửa sổ mà không có tranh chấp, tiền của order trở thành claimable cho seller.

Tranh chấp chỉ giữ đúng khoản tiền của order liên quan. Operator chỉ được phân bổ chính xác khoản đang tranh chấp giữa buyer principal và seller principal của order đó. Không được chỉ định người nhận khác, thay giá/tier/phí hoặc ảnh hưởng order khác.

Buyer principal phải có đường mở tranh chấp trực tiếp onchain trong thời hạn hợp lệ khi ứng dụng/backend hoặc dịch vụ tiếp nhận bằng chứng không hoạt động. Với ví nhúng, cần cơ chế khẩn cấp do buyer kiểm soát, chỉ có quyền mở một tranh chấp cho một order trong đúng cửa sổ thời gian; cơ chế này không được rút, chuyển hay phân bổ tiền.

8. CLAIM, HỦY CHIẾN DỊCH VÀ BẢO TOÀN TIỀN

Rebate, refund và seller proceeds là các khoản claimable theo campaign/order, rút theo cơ chế pull. Claim không hết hạn. Không chuyển quyền claim khi account hoặc ví thay đổi.

Mỗi order luôn phải thỏa:
buyer allocation + seller gross allocation + still unallocated = committed gross

Không được phân bổ hoặc rút quá số đã cam kết. Retry, timeout, giao dịch cạnh tranh và thao tác lặp không được tạo tiền hoặc thanh toán hai lần.

Việc hủy toàn chiến dịch do sự cố nghiêm trọng phải thuộc quyền Security Multisig, có lý do và bằng chứng kiểm toán. Với mỗi order đủ điều kiện, chỉ phần chưa phân bổ được trả về buyer. Không đảo một khoản đã phân bổ cuối cùng hoặc thu hồi khoản seller đã rút.

Phí nền tảng ban đầu bằng 0 và được khóa theo từng campaign. Thiết kế dữ liệu có phiên bản để có thể bổ sung chính sách phí sau này mà không thay đổi campaign đã xuất bản.

9. NGUỒN SỰ THẬT VÀ KIẾN TRÚC

Arc contract là nguồn sự thật cho điều khoản tài chính, cam kết, số lượng/tier, giá cuối, claim, phân bổ, tranh chấp và settlement. Database và indexer phục vụ tìm kiếm, giao diện và vận hành; mọi dữ liệu tài chính ở đó phải truy ngược được về chain, dựng lại được từ sự kiện đã xác nhận và được đối soát với contract.

Danh tính, nội dung sản phẩm, xác minh seller, entitlement, bằng chứng giao hàng, support và bằng chứng tranh chấp chi tiết nằm ở offchain.

Mỗi campaign ghim phiên bản logic tài chính và điều khoản gốc. Không cho phép nâng cấp âm thầm thay đổi kinh tế của campaign đang hoạt động. Finalise, refund, dispute và claim phải có cơ chế xử lý theo từng phần; không bắt một giao dịch lặp qua toàn bộ buyer của chiến dịch.

10. VẬN HÀNH, TÍCH HỢP VÀ TRẢI NGHIỆM

Xây dashboard buyer, seller và operator; email và thông báo trong ứng dụng; support thread theo order; trang hồ sơ seller; chỉ số giao đúng hạn, refund, dispute và campaign hoàn tất. Buyer của order đã giao được đánh giá một lần; seller có thể phản hồi.

Cung cấp public read API, event schema, seller webhook có chữ ký và chống replay, SDK cơ bản cùng tài liệu tích hợp. Webhook cần retry, idempotency và dead-letter.

Hệ thống cần cấu hình môi trường, quản lý secret, phân quyền, audit log, giới hạn tốc độ, giám sát, cảnh báo, sao lưu, phục hồi, migration, kiểm tra dependency và quy trình xử lý sự cố. Seller và operator dùng xác thực mạnh cho thao tác nhạy cảm. Dữ liệu cá nhân và entitlement được giảm thiểu, mã hóa và có chính sách lưu/xóa rõ ràng.

11. KIỂM THỬ VÀ NGHIỆM THU

Xây reference accounting model độc lập với contract. Kiểm thử unit, tích hợp, end-to-end, thuộc tính và fuzz cho tier, rebate, claim, hủy, giao hàng, tranh chấp, rút tiền, conservation và làm tròn.

Kiểm thử các trường hợp cạnh tranh khi hết tồn kho hoặc early slot; hai ví cùng tranh principal; authorization sai campaign, ví, chain, terms hoặc nonce; giao dịch pending/revert; provider, indexer, backend và dịch vụ giao hàng ngừng hoạt động; dữ liệu được phục hồi từ chain.

Chỉ nghiệm thu khi một người bán có thể tạo chiến dịch và giao sản phẩm, buyer có thể mua bằng ví trên Arc Testnet, các khoản tiền được quyết toán đúng, buyer/seller có thể claim, dispute và refund hoạt động, operator xử lý được trường hợp thực tế, và hệ thống đối soát cùng giám sát hoạt động trên bản đã triển khai. Màn hình đẹp, mock API hoặc các bài test riêng lẻ không đủ để gọi là hoàn thành.

GHI CHÚ KHI TRIỂN KHAI

- Mạng của bản này là Arc Testnet. Hãy kiểm tra khả năng và tài liệu Arc/Circle hiện hành trước khi chọn cách tích hợp; đừng giả định API hoặc hành vi của provider từ tài liệu cũ.
- Test USDC dùng cho logic và giao dịch trên Testnet; hệ thống nội bộ không được ghi nó thành doanh thu tiền thật. Đây là ghi chú cho triển khai/kế toán, không phải yêu cầu thêm màn hình cảnh báo.
- Entitlement phải được giao đúng điều khoản seller công bố. Không thêm quy tắc “chỉ được giao demo” vào sản phẩm mới.
- Mọi thao tác có ảnh hưởng đến tiền hoặc quyền người dùng phải được cưỡng chế ở contract/backend; ẩn nút trong UI không phải kiểm soát quyền.
- Chữ ký, secret, email, license key và bằng chứng riêng tư không được lọt vào chain, log, webhook công khai hoặc tài liệu kiểm thử.
- Giữ trạng thái chưa chắc chắn là pending/reconciling cho đến khi có bằng chứng chain; không tự suy diễn giao dịch thành công hoặc thất bại từ một lỗi HTTP.
- Nếu một quyết định kinh doanh chưa được nêu, chẳng hạn chính sách phí khác 0, không tự kích hoạt trong lúc lập trình. Ghi rõ quyết định cần có và tiếp tục những phần không phụ thuộc vào nó.