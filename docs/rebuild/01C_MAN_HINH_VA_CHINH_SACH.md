# GroupDeal trạng thái màn hình và chính sách

Phần 3 của đặc tả sản phẩm, gồm mục 10–13. Quy tắc tiền, principal, giao hàng và dispute nằm trong [Tài chính và giao hàng](./01B_TAI_CHINH_VA_GIAO_HANG.md).

[Mục lục](./README.md) · [Phần trước](./01B_TAI_CHINH_VA_GIAO_HANG.md)

## 10 Vòng đời phải biểu diễn riêng

| Chiều trạng thái | Các trạng thái cần có về ý nghĩa |
|---|---|
| Nội dung và publication | Draft, kiểm quyền phân phối, delivery test, sẵn sàng publish, đang publish, đã xác minh publication, archive |
| Campaign tài chính | Được tạo/chưa có commit, đang nhận commit, đã finalise, đã hủy |
| Delivery của order | Chờ giao, đang giao/retry, đã giao có bằng chứng, vi phạm SLA |
| Giải quyết order | Chờ buyer, đã xác nhận, đang tranh chấp, đã phân xử, settlement sau timeout |
| Tiền | Chưa phân bổ, buyer/seller allocation, đã rút lũy kế, còn có thể rút |
| Giao dịch | Chuẩn bị, chờ duyệt/ký, gửi chưa rõ kết quả, có tx, chờ receipt, confirmed, reverted, replaced, reconciling |

Tên enum cụ thể có thể được thiết kế mới, nhưng không gộp các chiều thành một trạng thái mơ hồ. Order có thể đã giao, đang dispute và đồng thời có rebate claimable. Publication trong app khác trạng thái contract. Archive không xóa quyền đã mua.

## 11 Luồng màn hình và thiết kế

### Ngôn ngữ thiết kế

Dùng phong cách marketplace SaaS với thông tin tài chính rõ: nền sáng hơi xanh, card trắng, CTA xanh dương, màu trạng thái nhất quán, media sản phẩm và khoảng cách thoáng. Buyer dùng header/search; seller và operator có khu vực quản lý riêng với sidebar. Thống nhất brand và các component dùng chung.

Price ladder hoặc progress rail là component trung tâm, dùng lại trên deal detail, buyer, seller và operator. Nó phải thể hiện metric thực, tier đang mở, tier tiếp và số còn thiếu. Rating, badge, số người, GMV và mức tiết kiệm phải có dữ liệu và định nghĩa; nội dung mẫu trong mockup không thành cam kết sản phẩm.

### Các màn và hành vi chính

| Khu vực | Màn hình | Nội dung và hành động cần thiết |
|---|---|---|
| Public | Trang khám phá/catalog | Search/filter/sort/pagination, giá hiện tại, metric, deadline, seller, empty/error/loading |
| Public | Deal detail | Media, edition/license, seller, rights badge đúng scope, tiers, quantity, số tiền cam kết, cách giao, SLA, terms và CTA |
| Public | Seller profile | Hồ sơ, các campaign được phép công khai, metrics có định nghĩa, review đủ điều kiện, follow |
| Buyer | Join deal | Tối đa ba bước cấp cao: xác nhận quantity/terms → ví/funding/duyệt giao dịch → kết quả hoặc theo dõi pending |
| Buyer | My deals và orders | Tách đang tham gia với order sau mua; status, deadline, giá khóa/final, hành động tiếp theo |
| Buyer | Order detail và thư viện | Entitlement, principal, timeline, allocation/claimed/claimable, confirm/dispute/claim/support/review |
| Buyer | Account/security | Contact, phiên đăng nhập, ví liên kết và lựa chọn ví; giải thích principal đã ghim khi liên quan |
| Seller | Overview | Campaign cần xử lý, giao hàng sắp hết hạn, dispute, tồn kho, claimable; không giả forecast |
| Seller | Product studio | Product/version/license/rights, tài nguyên và phương thức delivery |
| Seller | Tạo campaign | Wizard: sản phẩm/quyền → giá và limits → giao hàng/policy → preview/test/publish; lưu nháp |
| Seller | Campaign/order detail | Metrics, order, delivery, support, timeline, ledger và seller claim; capabilities theo trạng thái |
| Seller | Integrations/profile | Payout proof, webhook endpoint/secret, delivery test, SDK và chia sẻ |
| Operator | Hàng đợi | Seller/rights review, support, dispute, deadline và phân công |
| Operator | Campaign/order/dispute detail | Terms gốc, bằng chứng theo quyền, breakdown tiền và hành động authority cho phép |
| Operator | Vận hành | Fixed-block reconciliation, indexer lag, provider, queues/DLQ, audit, cảnh báo và recovery |
| Dùng chung | Notifications/support | Inbox, preferences, đọc/chưa đọc, thread theo order, attachment có ACL |

Desktop deal detail dùng nội dung và panel mua bên cạnh; mobile đưa giá/quyền/CTA lên rõ, ladder gọn và sticky CTA không che nội dung. Seller form mobile chia field group thay vì thu nhỏ bảng. Operator mobile ưu tiên deadline và action, record cards hoặc bảng cuộn trong vùng riêng khi cần so sánh.

Mỗi màn có loading, empty, validation, forbidden, unavailable, stale và recovery phù hợp. Hỗ trợ bàn phím, focus visible, dialog focus/return focus, screen reader labels, nội dung tiếng Việt dài và zoom. Kiểm viewport 320/375/430/768/1024/1280/1440; control tương tác hướng tới vùng chạm 44px theo chuẩn sản phẩm.

### Nội dung phải đúng với chứng cứ

- Khi timeout sau gửi transaction, hiển thị đang kiểm tra và cho resume operation; không kết luận đã thất bại để gửi lại.
- Receipt đúng nhưng projection chưa bắt kịp: hiển thị giao dịch đã xác minh, dữ liệu order đang đồng bộ.
- Tiền claimable: viết “Có thể rút”; chỉ viết đã rút khi có claim receipt đúng.
- Seller identity badge và product rights badge giải thích scope riêng; submitted review không hiện thành approved.
- Số dư USDC, commitment và gas có đơn vị rõ; không cộng hai biểu diễn số dư của cùng một tài sản.

## 12 Chức năng hỗ trợ và tích hợp

Thông báo email và in-app cho sự kiện mua, tier/finalise, delivery, SLA, dispute, resolution và claim. Contact để gửi email phải được xác minh; email là thông tin hỗ trợ, không là bằng chứng settlement.

Support thread gắn account/order, có attachment riêng tư, phân quyền và retention. Buyer của order đã giao được đánh giá một lần; seller phản hồi, operator moderation có audit. Metrics seller phải có tử số, mẫu số và khoảng thời gian, như tỷ lệ giao đúng hạn hoặc tỷ lệ dispute.

Link/QR/ảnh/widget tôn trọng visibility. Widget chỉ đọc dẫn về campaign. Follow seller/campaign và preferences không được làm lộ nội dung unlisted hoặc gửi thông tin account khác.

Public read API có version/schema/rate limit và allowlist field. Seller webhook có chữ ký, timestamp, event ID, retry, dedup và dead-letter. SDK đi cùng tài liệu và ví dụ receiver chạy được, không giữ khóa người mua.

## 13 Quyết định cần chốt trước tính năng liên quan

| Quyết định | Phần đã xác định | Phần cần chốt |
|---|---|---|
| Buyer cancellation | Không được tăng giá lại cho buyer khác | Có cho hủy không, cửa sổ, quantity/tồn kho/slot và allocation |
| Early rebate | Mặc định tắt; một unit đầu, slot theo chain, fixed hoặc percentage | Cơ sở percentage, cap, rounding và nội dung giải thích cho buyer |
| Rights review | Khác identity badge; evidence riêng tư | Tiêu chuẩn review, người duyệt, hạn hiệu lực, xử lý thu hồi khi campaign đang chạy |
| Delivery evidence | Entitlement thật, SLA và bằng chứng đúng order | Signer/authority cho record delivery, schema từng adapter và xử lý tranh cãi bằng chứng |
| Product policies | Snapshot quyền đã mua phải giữ nguyên | Hạn license, update/support, tải lại, activation, revoke và cách xử lý refund từng loại |
| Security/operations | Phân quyền, multisig, xác thực mạnh, giám sát/backup | Principal độc lập, threshold, step-up, RPO/RTO, retention và tải nghiệm thu |
| Mở rộng | Testnet/USDC/fee 0 là baseline | Điều kiện Mainnet, token khác, fee khác 0 và onramp |

Ghi quyết định bằng văn bản có version trước khi đưa vào contract/API/UI. Các chức năng không phụ thuộc quyết định đó tiếp tục được triển khai.
