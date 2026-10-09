# Phân tích ảnh tham chiếu và định hướng thiết kế frontend GroupDeal

Ngày lập: 03/10/2026, múi giờ Asia/Saigon.

**Đầu mối thực thi:** [Kế hoạch thống nhất hoàn thiện GroupDeal v2.0](./KE_HOACH_HOAN_TAT_DU_AN.md). Tài liệu này giữ vai trò phân tích thiết kế và ảnh tham chiếu.

**Kết luận:** Chọn bộ ảnh trong `image` làm tham chiếu thị giác chính cho frontend GroupDeal. Nền sáng, xanh dương chủ đạo, cards trắng, nội dung sản phẩm nổi bật và ba khu vực buyer, vendor, operations phù hợp với hướng sản phẩm. Khi triển khai, giữ tinh thần và thứ bậc thông tin của ảnh, đồng thời sửa nội dung thanh toán, phí, trạng thái và quyền thao tác để khớp repository.

Tài liệu này cụ thể hóa phần thiết kế của [báo cáo định hướng sản phẩm và frontend](./BAO_CAO_DINH_HUONG_SAN_PHAM_VA_FRONTEND_03_10_2026.md). Bộ ảnh bổ sung căn cứ trực quan cho kế hoạch; các yêu cầu về dữ liệu đúng, entitlement thật, recovery và nghiệm thu end-to-end trong báo cáo trước vẫn áp dụng.

Phạm vi đợt này là đọc và phân tích cả năm PNG, đối chiếu các chi tiết nghiệp vụ với source. Chưa sửa frontend, dựng prototype hoặc chạy kiểm thử responsive bằng browser. Các nhận xét thẩm mỹ là đánh giá thiết kế; kích thước, token và bố cục dưới đây là đề xuất triển khai, không phải thông số đo từ Figma hay CSS gốc của ảnh.

## 1 Bộ ảnh đã xem

| Ảnh | Kích thước raster | Vai trò trong thiết kế |
|---|---|---|
| [Marketplace Landing Page](<../image/GroupDeal Marketplace Landing Page.png>) | 1536 × 1024 | Public homepage, tìm kiếm, khám phá và deal cards |
| [Deal Detail](<../image/deal detail.png>) | 1448 × 1086 | Buyer quyết định mua, thông tin sản phẩm và group pricing |
| [Join Deal](<../image/join deal.png>) | 1448 × 1086 | Xác nhận mua, thanh toán và trạng thái thành công |
| [Create Deal](<../image/create deal.png>) | 1448 × 1086 | Vendor wizard, pricing editor và live preview |
| [Admin Deal Detail](<../image/deal detail admin.png>) | 1448 × 1086 | Operations, participants, transactions và settlement |

Các ảnh rộng là mockup desktop. Khung điện thoại nhỏ trong Deal Detail và Create Deal là hình minh họa nằm trong mockup, chưa phải thiết kế mobile đầy đủ. Không thể dùng chúng làm bằng chứng responsive PASS hoặc kết luận UI đã usable trên thiết bị thật.

## 2 Ngôn ngữ thiết kế nên áp dụng

Bộ ảnh đẹp vì thứ bậc rõ và có sự lặp lại nhất quán. Giá xanh dương lớn dẫn mắt vào quyết định mua; progress rail giải thích lợi ích mua chung; card trắng phân chia từng công việc; nền xanh xám rất nhạt giúp nội dung nổi mà không tạo cảm giác dashboard crypto.

### 2.1 Những đặc điểm nên giữ

- **Nền sáng có chiều sâu nhẹ:** neutral pha xanh, cards trắng, border mảnh và shadow mềm. Hero có gradient nhạt và ảnh người dùng; các trang nghiệp vụ ít trang trí hơn.
- **Một màu hành động chính:** xanh dương cho CTA, link, current tier và navigation đang chọn. Dùng xanh lá cho thành công hoặc khoản tiết kiệm; amber cho chờ/cảnh báo; đỏ cho lỗi hoặc hạn cần chú ý.
- **Typography có thứ bậc:** tên sản phẩm, giá và tiêu đề màn hình rõ; body màu slate; metadata nhỏ hơn. Mức tiết kiệm có nền xanh nhạt, không cạnh tranh với giá hiện tại.
- **Sản phẩm được trình bày như sản phẩm thật:** gallery, thumbnail, seller identity, nội dung được nhận, compatibility, terms và reviews. Payment không chiếm phần đầu hành trình khám phá.
- **Các patterns thống nhất:** rounded cards, icon outline, badges, tabs, status timeline và progress rail dùng lại giữa buyer, vendor, admin.
- **Bố cục theo vai trò:** buyer có header và search; vendor/admin có sidebar để quản lý công việc. Có thể cùng một ứng dụng nhưng shell và navigation tách riêng.

Không nên biến hướng này thành toàn bộ nền trắng phẳng hoặc chỉ thay màu của giao diện hiện tại. Giá trị của ảnh còn nằm ở spacing, chiều rộng nội dung, thứ bậc, media chất lượng và lượng thông tin hợp lý trong mỗi vùng.

### 2.2 Các điểm cần thống nhất trong bộ ảnh

Landing dùng logo trong ô xanh, các ảnh khác dùng biểu tượng nhóm người và wordmark GroupDeal. Khi triển khai cần chọn một logo chính và quy tắc wordmark thống nhất. Khuyến nghị biểu tượng nhóm người đơn giản vì gắn trực tiếp với mua chung; cần tạo asset vector riêng phù hợp brand, không cắt chữ/logo từ PNG.

Header trong Landing, buyer và vendor có vị trí, padding và trạng thái tài khoản khác nhau. Giữ khác biệt navigation theo vai trò, nhưng dùng cùng logo, controls, height tokens và account menu. Public header có sign in; buyer đã đăng nhập có My Deals/Orders; vendor/admin có role context và khả năng chuyển khu vực theo quyền.

Có nhiều dấu xác minh cùng xuất hiện: blue check bên seller, green Verified Seller và role reseller màu xanh. Cần giảm sự trùng lặp và ghi rõ từng dấu xác minh chứng minh điều gì. Danh tính seller đã được kiểm tra không có nghĩa tất cả quyền phân phối sản phẩm đã được duyệt.

## 3 Phân tích từng màn hình

### 3.1 Marketplace Landing Page

**Nên giữ:** hero hai cột, headline ngắn, hai hành động Browse Deals/How It Works, search nổi bật, categories phía dưới và deal cards có giá, progress, deadline. Ảnh người sử dụng sản phẩm tạo cảm giác gần gũi; floating group cards giải thích cơ chế nhanh hơn một đoạn dài về settlement.

**Điều chỉnh khi làm thật:**

- Ảnh có sáu cards trên một hàng, metadata khá nhỏ. Nên ưu tiên card đọc rõ: đề xuất bốn cột ở vùng nội dung rộng 1280–1360px, ba hoặc hai cột ở vùng nhỏ hơn, một cột trên mobile hẹp. Đây là lựa chọn ban đầu để thử với dữ liệu thật, không phải áp đặt số cột ở mọi width.
- Top Deals dùng standard card; Ending Soon có thể dùng compact card/list. Cần thống nhất dữ liệu và CTA, tránh tạo nhiều biến thể chỉ khác trang trí.
- Categories hiện là hàng chip dài. Mobile dùng phần chọn category dễ chạm và filter sheet; không để người dùng phải kéo ngang toàn bộ trang. Có thể cho chip strip cuộn trong vùng riêng nếu có dấu hiệu điều hướng rõ.
- Sort phải có định nghĩa và backend hỗ trợ. Popular, Ending Soon và mức giảm giá chỉ dùng khi có dữ liệu tương ứng; không random ranking hoặc badge.
- “Save up to 70%”, “100% legitimate”, “10,000+”, “$1M+”, “100+ sellers” và rating trong ảnh là nội dung mẫu. Sản phẩm thật chỉ công bố số liệu và claim có căn cứ. Trên Testnet không trình bày volume test như doanh thu tiền thật.
- Các logo Figma, Notion, Adobe, Slack, ChatGPT và những thương hiệu khác chỉ là reference cho merchandising. Không mặc định repository có deal được phép phân phối các sản phẩm đó; catalog production cần sản phẩm và quyền đã được duyệt.
- Phải có search no-results, skeleton, lỗi catalog, category rỗng, pagination và deal sold-out/closed. Hình hiện mới thể hiện một homepage đầy dữ liệu.

Mobile đề xuất: header gọn → headline và CTA → search → categories/filters → deals. Media hero và floating cards có thể giảm hoặc chuyển thành một illustration nhỏ; không thu nhỏ cả hero desktop thành một ảnh chữ không đọc được.

### 3.2 Buyer Deal Detail

**Đây là màn tham chiếu tốt nhất trong bộ ảnh.** Main content bên trái và purchase panel bên phải giúp tách việc hiểu sản phẩm với việc quyết định tham gia. Giá 105, current tier, còn 13 buyer và giảm thêm 16 xuất hiện gần CTA, nên cơ chế mua chung dễ đọc.

Nên giữ gallery có thumbnails, seller identity, title, reviews có căn cứ, tabs nội dung và khối What's included. Purchase panel desktop sticky là pattern phù hợp. Mobile có sticky CTA, nhưng nội dung quan trọng vẫn phải xuất hiện trong page để người dùng hiểu trước khi chạm.

**Điều chỉnh:**

- “You commit up to $120” mâu thuẫn với người mới mua ở tier 105 trong code hiện tại. Hiển thị khoản cam kết thực của lần mua theo quantity; 120 chỉ làm reference price nếu có nguồn, hoặc giá nhóm ban đầu nếu đó là tier đầu.
- Cần hiện edition/plan, quantity, số seat/license, hạn dùng và điều kiện kích hoạt. Mua “Notion toolkit/template” khác mua subscription Notion AI; title, gallery và license policy phải mô tả đúng hàng hóa.
- “Lifetime access”, “regular updates” và “works with Notion Free & Plus” là điều khoản sản phẩm có thể ảnh hưởng quyết định mua. Chỉ hiện khi có trong snapshot license/policy được publish; giải thích phạm vi support và update nếu cần.
- Countdown đổi theo lifecycle: thời gian mua còn lại, chờ finalize, hạn giao hoặc cửa sổ tranh chấp. Không giữ nhãn Deal ends cho mọi trạng thái.
- PriceTierRail phải hiểu BUYER_COUNT và UNITS_COUNT. Không gọi số units là buyers; buyer count là campaign identity đủ điều kiện, không phải số người đã được chứng minh độc nhất.
- Ở current tier, marker thể hiện tier đang unlock. Nếu muốn thể hiện vị trí 37 trong khoảng 20–49, cần chỉ số tiến độ riêng; khoảng cách các điểm tier trong ảnh không tự chứng minh metric tuyến tính.
- Tabs có thể là anchor sections cho nội dung ngắn; không bắt người dùng mở Terms tab mới nhìn thấy quyền nhận, thời hạn giao và quy tắc rebate trọng yếu.
- Reviews bên phải đang lặp với Reviews tab. Có thể giữ rating summary nhỏ dưới purchase panel, còn review list chỉ có một nơi; không ép review card sticky dài làm CTA khuất.
- Trạng thái closed, hết inventory, quyền bị suspend, user đã tham gia, chưa đăng nhập, loading/error/not-found phải có hành động riêng. Không giữ Join CTA hoạt động với mọi campaign.

### 3.3 Buyer Join Deal

**Nên giữ:** ba bước ở cấp trải nghiệm, order summary riêng, giá/quantity dễ kiểm tra, payment details ở bước thanh toán, transaction timeline và technical details thu gọn.

Ảnh trình bày Confirm, Wallet Confirmation và Success Preview cùng lúc. Nên hiểu đó là bảng tổng hợp các trạng thái thiết kế. UI thật chỉ mở bước đang thực hiện; bước đã hoàn thành có summary chỉnh sửa được khi an toàn; không hiển thị You're in trước khi đã xác minh commitment.

Các câu trong ảnh như “authorization, not an immediate charge”, “only charged when the deal ends” và “automatically rebated to your wallet” không mô tả đúng contract hiện tại. `commitToBuy` chuyển USDC vào escrow trong transaction tham gia. Rebate được phân bổ theo rule và buyer chủ động claim; hoàn về ví cần có giao dịch được xác minh.

**Ví dụ nên dùng cho người mới, quantity 1, không early rebate:**

| Nội dung | Hiển thị phù hợp |
|---|---|
| Giá nhóm hiện tại | 105 USDC |
| Tiền sản phẩm đưa vào escrow khi tham gia | 105 USDC theo giá được khóa khi giao dịch thực thi |
| Nếu đạt tier tiếp theo | Giá cuối 89 USDC |
| Rebate dự kiến của order này | 16 USDC |
| Phí mạng | Ước tính từ giao dịch thật, hiển thị riêng |
| Khi campaign chốt | Xem giá cuối và số tiền được phân bổ; claim khi có thể rút |

Giá nhóm có thể giảm trong lúc buyer review. Dùng kiểm tra giá/terms và receipt để xác định số thực chuyển, giữ các protections trong checkout hiện có; không thêm giả định protocol hỗ trợ một bid cap tùy ý. Quantity và early rebate phải làm summary tính lại chính xác.

CTA nên đổi theo action hiện tại: tiếp tục thanh toán, nạp tiền, chuyển mạng, cấp quyền nếu cần, xác nhận mua hoặc xem đơn. Funding, approval, commit, receipt verification và indexer sync là các bước con của Transaction; ba bước UX không có nghĩa luôn chỉ có một lần ký.

Trong ảnh phí ghi “0.0012 ARC” cạnh “ARC Testnet”, với biểu tượng màu tím cần được kiểm lại. Arc dùng USDC làm gas token; network là Arc Testnet, tiền là USDC, không tạo một đơn vị ARC không khớp cấu hình. Không hardcode $0.25 hoặc tổng $120.25. [Thông số chính thức của Arc](https://docs.arc.io/arc/references/connect-to-arc).

Thêm trường hợp user từ chối ký, thiếu tiền, quote hết hạn, sai mạng, transaction reverted, mất kết nối, đã broadcast nhưng chưa rõ kết quả và receipt đã thành công nhưng indexer chậm. Refresh hoặc Back không tự gửi lệnh mua lần nữa. Success dùng order/receipt xác minh; con số 38 chỉ đúng nếu projection tại thời điểm đó thực sự là 38.

### 3.4 Vendor Create Deal

**Nên giữ:** sidebar vendor, wizard Product → Rights → Pricing → Fulfillment → Review, completed step summary, tier editor và preview dùng cùng business components của trang buyer. Đây là hướng cải thiện trực tiếp form dài trong `SellerDashboard.tsx` hiện tại.

Ảnh đang ở Pricing, các bước Product và Rights đã làm được thu thành card summary. Cách này hợp lý nếu card mở ra chỉnh sửa hoặc quay về bước đó; không dựng cả năm form dài trên một trang rồi gọi là wizard.

**Điều chỉnh:**

- “Expected conversion 8–15%”, GMV 2,800–6,300 và forecast không có căn cứ từ repository. Bỏ trong v1 nếu chưa có analytics; thay bằng thông tin kiểm tra hữu ích như inventory, margin scenario do seller nhập hoặc trạng thái draft. Một kịch bản tính toán phải có giả định rõ, không gọi là dự báo.
- “After 15% platform fee” và payout 85% sai với contract v1 buộc `platformFeeBps == 0`. Payout còn phụ thuộc rebate, early incentive, delivery và dispute; không trình bày doanh thu chắc chắn trước khi đủ điều kiện phân bổ.
- Start date riêng trong ảnh chưa được contract hỗ trợ: campaign hiện bắt đầu tại block tạo, end = start + duration. Có thể thêm scheduled publishing ở backend với workflow riêng, nhưng không hiển thị một tính năng đổi thời điểm onchain chưa có.
- UI nhập range 1–19/20–49/50–99/100+ nên lưu thresholds 1/20/50/100 và tự suy ra upper bounds. Tránh để seller chỉnh cả hai đầu dẫn đến gap hoặc overlap. Contract hiện yêu cầu 2–5 tiers, threshold tăng, price giảm; form cần validate đúng và hiển thị lỗi tại field.
- Cho chọn metric trước khi tạo tiers; nhãn Buyer range đổi thành số units/seat khi dùng UNITS_COUNT. Inventory là số units, không mặc định cùng nghĩa với giới hạn buyer.
- Không tùy ý kéo reorder tier rồi publish một danh sách trái thứ tự. Nếu có drag handle như ảnh, cần kiểm tra lại thứ tự và có cách thao tác bằng keyboard; có thể bỏ drag nếu giá trị thấp.
- Rights “Ready for review” chỉ thể hiện đã nộp, chưa phải được duyệt. Role là claim của vendor cho đến khi có quyết định. Có thể tiếp tục soạn draft, nhưng publish bị chặn cho tới khi đạt policy.
- Evidence filename chỉ hiện với seller sở hữu hồ sơ hoặc reviewer có quyền; không nằm trong public preview/API. “Within 1 business day” chỉ dùng khi team có SLA vận hành thực.
- Preview cho draft mới phải có nhãn Xem trước. Số 37 buyers, deadline 2d 14h và reviews chỉ là scenario minh họa nếu chưa publish, không làm người xem hiểu có buyer thật. Preview mode tương tác được nhưng không gọi checkout/publish mutation.
- Cần Save draft, autosave có trạng thái, resume sau reload, unsaved-change handling và khả năng kiểm tra lại khi sửa pricing/terms làm dry-run cũ mất hiệu lực.

Desktop rộng: form và live preview cạnh nhau. Khi vùng nội dung sau sidebar không đủ rộng, preview chuyển sang tab/drawer hoặc section phía dưới; không làm form/input co quá nhỏ chỉ để giữ ba cột.

### 3.5 Admin Deal Detail

**Nên giữ:** sidebar theo nhóm công việc, deal summary đầu trang, action bar và tabs Overview/Participants/Transactions/Settlement/Refunds/Disputes/Audit. Tổng quan có metrics, các item gần đây và link đi sâu; cách này rõ hơn một portal gộp mọi công việc vào cùng màn hình.

**Các điểm cần sửa về quyền và dữ liệu:**

- Pause Deal cần định nghĩa action. Contract hiện không có hàm pause riêng cho campaign. “Ẩn khỏi marketplace” hoặc “ngừng cấp buy authorization mới” là thao tác offchain có phạm vi hạn chế; không bảo đảm ngăn authorization đã cấp hoặc tương đương hủy campaign. Emergency cancel là action riêng có security authority, tác động tiền và confirmation riêng.
- GMV 3,885 = 37 × 105 trong ảnh không nhất thiết là tổng tiền buyer đã commit. Các order trước có locked price khác, quantity khác và early allocation khác. Tính gross bằng tổng order, không lấy current price nhân buyer count.
- Với ví dụ tuần tự, mỗi identity mua một unit, buyer thứ 20 vẫn khóa 120 trước khi mở tier 105; buyer 21–37 khóa 105. Tổng committed gross của 37 order là 4,185, còn 37 × 105 = 3,885 là giá trị toàn nhóm tại giá hiện tại. Không dùng hai đại lượng thay thế nhau.
- Estimated rebates 592 = 37 × 16 cũng chỉ đúng với một tập order đều khóa 105 và quantity 1. Dự báo phải tính theo locked price/quantity/early rebate của từng order, cap theo contract và tách order hiện hữu với những order giả định sẽ tham gia sau.
- Platform fee 10% khác 15% ở vendor và khác 0% của v1. Ngoài ra các số hiển thị trong ảnh chưa cộng trừ nhất quán: 3,885 − 388 = 3,497, không phải 3,109. Thực hiện tính toán bằng đơn vị integer USDC và quy tắc làm tròn thống nhất, không sửa lệch số bằng layout.
- “Pending commitments: 5 awaiting payment” nên là payment intents chưa xác minh, không được tính vào participants đủ điều kiện/tier. Commitment onchain đã thành công thì tiền hàng đã chuyển vào escrow; trạng thái chờ fulfillment là một chiều khác.
- Timeline Deploy Deal → Observe Result → Revert / Settle không khớp tên action thực. Hub hiện tạo campaign, nhận commitments, finalize, record delivery, confirm/dispute và claim. Revert là lỗi transaction, không phải bước kế tiếp bình thường của settlement.
- Refund requests, refund allocation và khoản đã claim là ba khái niệm khác nhau. Admin chỉ hiển thị hoặc thực hiện action có thẩm quyền; một ticket support không tự phân bổ refund.
- Period Last 7 days phải áp dụng cho đúng metric và ghi rõ phạm vi. Campaign totals, số dư escrow và claimable không được âm thầm lọc theo khoảng thời gian giao dịch rồi gọi là tổng toàn deal.
- Overview ưu tiên exceptions: entitlement chưa giao, proof thiếu artifact, sắp hết SLA/dispute, projection lệch chain, claim đang reconcile. Những chỉ số này hỗ trợ quyết định tốt hơn chỉ hiển thị GMV đẹp.
- Audit có thứ tự mới nhất, actor/capability/action/result và deep link. Export có authorization, field allowlist và không xuất secret/evidence ngoài phạm vi được phép.

Hành động admin cần ẩn hoặc disable theo capability và state, giải thích lý do khi cần. Không coi mọi account có nhãn Admin đều có quyền ký, phân xử hoặc thực hiện security cancellation.

## 4 Design tokens đề xuất

Các giá trị này là điểm khởi đầu để dựng UI và kiểm tra, chưa phải palette đo chính xác từ ảnh. Giữ CSS custom hiện có, chuyển hardcoded dark colors theo từng component sang semantic tokens; chỉ sửa `:root` sẽ chưa đủ vì nhiều inline styles.

| Nhóm | Đề xuất ban đầu | Cách dùng |
|---|---|---|
| Page background | `#F5F8FD` | Nền neutral pha xanh nhẹ |
| Surface | `#FFFFFF` | Cards, panels và dialogs |
| Subtle surface | `#EEF4FF` | Selected navigation, icon background và info panel |
| Text primary | `#101A33` | Title, body trọng yếu, số tiền |
| Text secondary | `#4B5B78` | Mô tả và thông tin hỗ trợ |
| Border | `#DFE7F3` | Card/divider; controls cần contrast phù hợp riêng |
| Brand/action | `#0866E8` | CTA và navigation/link chính |
| Brand hover | `#0758C9` | Hover/pressed được phân biệt rõ |
| Success | `#087A48` trên nền `#E8FAEF` | Tiết kiệm, xác minh đúng phạm vi và success |
| Warning | `#945500` trên nền `#FFF4DB` | Pending và cảnh báo |
| Danger | `#C52D3C` trên nền `#FFF0F1` | Error, destructive và deadline cần xử lý |
| Radius | 8 / 12 / 16 / 24px | Controls, card, panel và hero theo kích thước |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px | Grid, padding và khoảng cách có nhịp |
| Body | 16px, line-height khoảng 1.5–1.65 | Đặc biệt trên mobile |
| Controls | Tối thiểu 44px theo chuẩn sản phẩm | Primary button/input/menu tap area |
| Container | Khoảng 1280–1360px cho public/buyer | Operations dùng content width riêng khi cần |

Font trong ảnh không thể xác định chắc chắn từ raster. Đề xuất dùng Plus Jakarta Sans sẵn có cho body và heading, giảm sự khác nhau giữa Outfit và body hiện tại. Chỉ giữ monospace ở transaction identifier hoặc kỹ thuật nâng cao. Không thêm Inter chỉ vì ảnh trông giống một sans serif cụ thể.

Giá dùng tabular numerals khi có thể; currency, quantity và decimal precision thống nhất. Body/supporting text phải đủ contrast; chữ nhỏ thông thường cần ít nhất 4.5:1 theo WCAG AA, với quy tắc khác cho large text và các ngoại lệ của tiêu chí. [WCAG Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Palette phải kiểm cả hover, disabled, error, focus và các bề mặt thực, không chỉ mẫu hex.

Chuẩn tap target 44px là lựa chọn sản phẩm để dễ thao tác. WCAG 2.2 AA Target Size Minimum quy định 24px với các ngoại lệ; không đồng nhất mọi target dưới 44px với lỗi AA. [WCAG Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## 5 Responsive cần thiết kế riêng

Giữ các vùng quan trọng của ảnh ở desktop, nhưng thay đổi cấu trúc khi thiếu không gian. Không scale toàn trang, không thu body text và không dùng `overflow-x: hidden` để che phần bị tràn.

| Màn hình | Desktop rộng | Tablet hoặc vùng content hẹp | Mobile |
|---|---|---|---|
| Landing | Hero hai cột, grid card thoáng | Giảm cột, rút gọn navigation | Hero gọn, search rõ, filter sheet, card dễ đọc |
| Deal Detail | Nội dung + sticky purchase panel | Stack nếu hai cột làm nội dung quá chật | Thông tin quyết định lên sớm, ladder gọn/dọc, sticky CTA |
| Join | Active step + order summary | Summary thu gọn, hai vùng xếp lại | Summary ngắn trước action; form/payment một cột |
| Vendor Create | Sidebar + form + live preview | Sidebar gọn, preview tab/drawer | Step indicator ngắn, input một cột, tier thành field groups |
| Admin Detail | Sidebar + tabs + dashboard grid | Giảm cột và rút action bar | Summary/action ưu tiên, drawer nav, detail sections và record cards |

Các quyết định chi tiết:

- Public/buyer mobile header dùng logo, search toggle, notification/account khi phù hợp. Main navigation qua menu hoặc bottom navigation gọn; không giữ tất cả links trong một hàng nhỏ.
- Chỉ một vùng action chính ở cạnh dưới. Nếu dùng bottom navigation và purchase CTA, thiết kế stack có safe-area và padding đủ, không che nội dung hoặc focus.
- Detail media cần đủ nhận diện nhưng không đẩy giá và benefit xuống nhiều màn hình. Buyer vẫn phải thấy plan, quantity và rule trọng yếu trước xác nhận.
- Ladder mobile ưu tiên current price, next price và số còn thiếu; phần tất cả tiers mở rộng được. Không ép 4–5 tier labels dài vào 320px.
- Tier editor mobile đổi từng hàng thành nhóm threshold/price rõ ràng, có validation và thao tác thêm/xóa dễ chạm. Giữ summary toàn bộ tiers trước publish.
- Admin tabs có thể cuộn trong vùng tab riêng hoặc dùng selector khi hẹp; cần thể hiện tab đang chọn. Không cuộn ngang cả page.
- Participants/transactions mobile thành record cards với status, amount và action chính, mở disclosure cho field phụ. Một số bảng đối soát thật sự cần so sánh hai chiều có thể giữ scroll riêng; không chuyển mọi bảng bằng một quy tắc máy móc.
- Nội dung tiếng Việt, tên sản phẩm dài, amount lớn, lỗi provider và deadline quá hạn phải wrap được. Không hardcode height chỉ vừa nội dung tiếng Anh trong ảnh.
- Sticky elements phải hoạt động với bàn phím ảo, màn hình ngang và zoom; dialogs có focus management, labels và error messages. Skeleton giữ kích thước gần nội dung để giảm layout shift.

Kiểm các width 320/375/430/768/1024/1280/1440, thêm zoom và text dài. WCAG Reflow yêu cầu hỗ trợ nội dung ở độ rộng tương đương 320 CSS px cho trang cuộn dọc, với ngoại lệ cho nội dung cần bố cục hai chiều. [WCAG Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Ảnh static chưa chứng minh các điều kiện này.

## 6 Components và dữ liệu cần để dựng theo ảnh

### 6.1 Cấu trúc frontend

| Nhóm | Components chính | Lưu ý |
|---|---|---|
| Shell | PublicHeader, BuyerShell, VendorShell, OperationsShell | Chung brand/controls, khác navigation và permission |
| Catalog | SearchBar, CategoryFilter, DealCard, DealGrid, CatalogState | Standard/compact card khi có nhu cầu thật |
| Deal | ProductGallery, SellerIdentity, LicenseSummary, PriceDisplay, PriceTierRail, DealDeadline, PurchasePanel | Một nguồn logic dùng cho public và preview |
| Join | JoinStepper, CommitmentReview, OrderSummary, PaymentStep, TransactionTimeline, JoinResult | Stepper không giữ success mẫu trong flow thật |
| Vendor | DealWizard, DraftStatus, ProductStep, RightsStep, TierEditor, FulfillmentStep, ReviewStep, DealPreview | Draft persist và validation theo dependency |
| Operations | DealSummary, DealTabs, MetricCard, ExceptionQueue, ParticipantList, SettlementSummary, AuditTimeline | Metrics/capability/state từ API có kiểu |
| Shared | Button, Field, Dialog, Drawer, Tabs, Badge, Skeleton, EmptyState, ErrorState | Accessibility và responsive là hành vi của component |

PriceTierRail chỉ render dữ liệu đã được domain layer tính đúng: metric, current tier, next tier, progress, quantity và order context. Không tạo công thức tiền khác nhau giữa landing, detail, join, preview và admin.

### 6.2 Dữ liệu ảnh đang đòi hỏi mà repository còn thiếu hoặc cần chuẩn hóa

- Product media/gallery, category, plan, license policy, reference price có nguồn và policy snapshot.
- Vendor identity và RightsVerification theo scope; reviewer/evidence/status lifecycle.
- Draft có persistence, validation version và publish intent để phục hồi khi indexer/API đến khác thứ tự.
- Search/filter/sort/pagination cho catalog, vendor lists và operations lists.
- Order-level amounts: locked price, gross, rebate/refund allocated, cumulative claimed, claimable và transaction history.
- Entitlement inventory/delivery job, trạng thái provider, hướng dẫn kích hoạt và support/dispute deadline.
- Notification deep links, unread state, trạng thái email/webhook delivery khi cần cho operations.
- Metrics định nghĩa rõ và audit mới nhất; analytics forecast chỉ bổ sung sau khi có dữ liệu và phương pháp.

Có thể dựng layout bằng typed fixtures riêng khi API đang bổ sung. Fixtures phải có nhãn trong môi trường thiết kế/test, không phát tán mock data trong component hoặc hiển thị thành dữ liệu production. Không lấy ảnh PNG làm frontend nguyên khối vì chữ, controls, routes và responsive cần thật sự hoạt động.

## 7 Những màn cần mở rộng cùng ngôn ngữ thiết kế

Bộ ảnh đủ làm điểm xuất phát cho thiết kế, nhưng chưa bao phủ hành trình sau mua và vận hành. Các màn bổ sung dùng cùng tokens, cards, controls, status và shell:

1. **My Deals và Orders:** My Deals nhóm theo campaign để theo dõi giá; Orders quản lý từng lần mua và entitlement.
2. **Order Detail:** license/seat và hướng dẫn, delivery timeline, final price, khoản có thể claim, xác nhận nhận hàng, dispute/support và lịch sử giao dịch.
3. **Notifications và Account:** deep link đến đối tượng, ví liên kết, security và cảnh báo principal của order đã khóa.
4. **Vendor Products, Rights, Fulfillment và Settlements:** không chỉ tạo deal; phải quản lý giao đủ license, lỗi provider, retry và claim payout.
5. **Operations queues:** hồ sơ quyền, delivery exceptions, dispute sắp hết hạn, reconciliation, transaction recovery và audit.

Đặc biệt Order Detail cần được thiết kế sớm sau bốn master screens. Đây là nơi buyer kiểm chứng lời hứa “mua chung, license riêng, giá cuối và hoàn chênh lệch”, nên ảnh đẹp ở đầu funnel chưa đủ cho trải nghiệm hoàn chỉnh.

## 8 Thứ tự triển khai và nghiệm thu

1. Chốt tokens, logo, content rules và các correction về payment/fees/action. Dựng primitives và shells, chuyển dần inline dark styles.
2. Làm Buyer Deal Detail và PriceTierRail trước vì có business components dùng lại rộng nhất; thử desktop/mobile với nhiều tiers, quantity và lifecycle.
3. Làm Join như state machine thật, tích hợp checkout hiện có và các failure/recovery states. Sửa projection tài chính và delivery nền theo báo cáo trước trước khi nghiệm thu hành trình này.
4. Làm Vendor wizard và preview tái sử dụng detail components; nối draft, rights, validation và prepare/finalize delivery.
5. Làm Admin Deal Detail và API đối soát/capability; không thêm nút nghiệp vụ chưa có hành vi hợp lệ.
6. Mở rộng Landing/catalog theo cùng DealCard/pricing data; tiếp tục Order Detail và một luồng mua–giao–claim xuyên suốt. Layout Landing có thể làm song song về mặt công việc khi primitives đã ổn, nhưng không cản ưu tiên tính đúng đắn của checkout.
7. Hoàn thiện các màn còn lại và kiểm tra responsive, accessibility, browser, entitlement thật và live acceptance trên cùng candidate.

Nghiệm thu thiết kế cần đạt cả hai lớp:

- **Thị giác:** giống tinh thần bộ ảnh ở bố cục, màu, typography, spacing, card, gallery và status patterns; giữ đẹp khi viewport/nội dung thay đổi.
- **Sản phẩm:** giá/rebate đúng order, không hiện thành công trước receipt, license thật có thể nhận, navigation/deep link hoạt động, draft phục hồi, action đúng quyền và error có đường xử lý.

Không dùng số liệu mẫu để làm UI trông hoàn chỉnh. Không lấy pixel matching của một mockup desktop thay cho usability mobile hoặc correctness của settlement.

## 9 Kết luận áp dụng

**Áp dụng bộ ảnh làm hướng thiết kế chính.** Ưu tiên Deal Detail làm chuẩn về thương mại, Join làm chuẩn về xác nhận/thanh toán, Create Deal làm chuẩn về wizard và Admin Detail làm chuẩn về quản trị. Landing mở rộng cùng hệ thống để tạo cảm giác marketplace thống nhất.

Mức bám sát cao nhất nên nằm ở ngôn ngữ thị giác và hierarchy. Copy, số tiền, phí, forecasting, trạng thái và quyền thao tác phải điều chỉnh theo sản phẩm thực. Frontend hoàn thiện cần đẹp như hướng ảnh, đọc rõ trên mobile và khiến người dùng hiểu đúng chuyện gì xảy ra với tiền và license ở từng bước.

## 10 Nguồn mã để đối chiếu

- [Design tokens và CSS hiện tại](../frontend/src/index.css), [routes và shell hiện tại](../frontend/src/App.tsx).
- [Buyer Deal Detail](../frontend/src/pages/CampaignDetailPage.tsx), [checkout protections](../frontend/src/services/checkout.ts), [wallet và campaign actions](../frontend/src/context/Web3Context.tsx).
- [Seller form và delivery](../frontend/src/pages/SellerDashboard.tsx), [operator portal](../frontend/src/pages/OperatorPortal.tsx), [buyer orders](../frontend/src/pages/BuyerDashboard.tsx).
- [Contract v1](../contracts/contracts/GroupDealHub.sol), [event projection](../backend/src/services/indexerService.ts), [schema hiện tại](../backend/src/db/store.ts).
- [Báo cáo định hướng đầy đủ](./BAO_CAO_DINH_HUONG_SAN_PHAM_VA_FRONTEND_03_10_2026.md).
