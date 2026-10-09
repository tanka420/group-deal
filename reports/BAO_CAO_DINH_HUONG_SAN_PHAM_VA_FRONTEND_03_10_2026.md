# Báo cáo đánh giá đề xuất frontend và hướng hoàn thiện GroupDeal

Ngày lập: 03/10/2026, múi giờ Asia/Saigon.

**Đầu mối thực thi:** [Kế hoạch thống nhất hoàn thiện GroupDeal v2.0](./KE_HOACH_HOAN_TAT_DU_AN.md) đã hợp nhất các đề xuất trong báo cáo này với lỗi, bằng chứng và phụ thuộc toàn dự án.

**Kết luận:** Nên nhận định hướng UX của brief, nhưng cần viết lại kế hoạch thực thi thành kế hoạch hoàn thiện sản phẩm xuyên suốt frontend, API, dữ liệu và vận hành. React/Vite và cơ chế tài chính hiện có có thể tiếp tục sử dụng. Phần cần mở rộng nhất là mô hình sản phẩm và quyền phân phối, giao entitlement đáng tin cậy, dữ liệu settlement và recovery, cùng ba khu vực buyer, vendor và operations rõ ràng.

Bốn màn hình mẫu là bước thiết lập ngôn ngữ thiết kế tốt. Tuy nhiên, trước khi triển khai chúng phải xử lý các sai lệch dữ liệu tài chính và thống nhất định nghĩa giá, cam kết, hoàn tiền, giao hàng. Hoàn thành bốn màn hình chưa đồng nghĩa hoàn thành GroupDeal.

## 1 Phạm vi và căn cứ

Báo cáo đối chiếu brief người dùng cung cấp với mã nguồn trong repository, đặc biệt các trang, component, context, CSS, lớp checkout của frontend; schema, routes, authorization, delivery, indexer của backend; và `GroupDealHub.sol`. Các tài liệu `PLAN.md`, `README.md`, kế hoạch hoàn tất và báo cáo ngày 03/10/2026 được dùng để kiểm tra mục tiêu và tình trạng đã ghi nhận.

Baseline mã nguồn: nhánh `codex/arc-candidate`, commit `e80e5dd9369eccd96a54189e74ae2a7861cf2198`; working tree sạch trước đợt phân tích. Lệnh `npm --prefix frontend run typecheck` đã chạy lại và PASS. Các kết quả build/test trước đó trong báo cáo cũ là bằng chứng lịch sử, không được trình bày như kiểm thử mới của đợt này.

Đây là đánh giá mã nguồn và đề xuất triển khai. Chưa chạy nghiệm thu giao dịch live, thử license với nhà cung cấp thật, kiểm thử người dùng hoặc xác nhận responsive bằng browser tại toàn bộ các kích thước. Các lỗi dưới đây được phân biệt thành sai lệch trực tiếp trong code và rủi ro luồng cần tái hiện bằng kiểm thử tích hợp. Đợt này chỉ bổ sung báo cáo; chưa sửa ứng dụng hay triển khai Phase 1.

Mục tiêu trong repository hiện là sản phẩm đầy đủ trên Arc Testnet. Kế hoạch hiện có cũng mở hướng checkout token khác và Arc Mainnet; đó là lộ trình riêng, không phải thay đổi mạng cho candidate đang chạy.

## 2 Hiện trạng frontend và khả năng tái sử dụng

### 2.1 Stack đã phát hiện

| Lớp | Hiện trạng trong source | Hướng phù hợp |
|---|---|---|
| Framework | React 18, TypeScript, Vite; package manifest dùng Vite `^8.3.1` | Giữ stack; chưa có căn cứ bắt buộc chuyển Next.js |
| Router | Hash router tự viết trong `App.tsx`, kết hợp `currentTab` và `selectedCampaignId` | Bổ sung router chuẩn với nested routes, URL trạng thái và compatibility cho link cũ |
| Styling | CSS custom, CSS variables và rất nhiều inline styles | Giữ CSS custom; chuẩn hóa tokens, styles theo component và breakpoint |
| Component library | Không có thư viện UI tổng quát; icon Lucide | Dùng primitives gọn; chọn thư viện hỗ trợ accessibility cho dialog/menu nếu cần |
| State | React Context cho auth, ví, ngôn ngữ; state cục bộ trong các trang | Giữ context phiên và ví; tách server data, form state và transaction lifecycle |
| API/data | `fetch` phân tán, nhiều `any`, một số chỗ đọc token trực tiếp từ localStorage | API client có kiểu, xử lý lỗi thống nhất, hooks theo domain và cache có kiểm soát |
| Wallet/payment | Circle User-Controlled Wallet, Reown, ethers, viem, App Kit Bridge | Tái sử dụng adapters và kiểm tra an toàn hiện có; thay cách trình bày |
| Kiểm thử | Playwright, một project Desktop Chrome; nhiều API/SDK/RPC fixture | Giữ test nền; bổ sung responsive, keyboard và luồng dữ liệu thật |
| Design tokens | Nền tối, glass cards, indigo/cyan, glow/gradient; Outfit, Plus Jakarta Sans, JetBrains Mono | Chuyển mặc định sang nền sáng và trạng thái trung tính; giữ font sẵn có nếu phù hợp |

Brief nói không tự thay stack là đúng. Tuy nhiên, thay hash router tự viết bằng một router chuẩn có lý do cụ thể: số màn hình tăng, cần deep link, route guard, Back/Forward, tab/filter có URL và trang không tìm thấy. Đây là thay đổi có giới hạn, không phải viết lại framework. [React Router có hướng tích hợp declarative trong ứng dụng Vite](https://reactrouter.com/start/declarative/installation).

Với nhiều màn hình cùng đọc campaign/order, đề xuất dùng TanStack Query cho server state để tránh tự lặp cơ chế cache, polling và invalidation. Cần khóa phiên bản tương thích và kiểm tra package thực tế khi triển khai. Không cần thêm Redux chỉ để quản lý dữ liệu API. [Tài liệu TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview).

### 2.2 Routes và component đang có

| URL hiện tại | Trang/chức năng | Hạn chế chính |
|---|---|---|
| Trang đầu, `#explore` | `ExplorePage` | Danh mục đơn giản; chưa có search/sort/filter đầy đủ hoặc merchandising sản phẩm |
| `#campaign-{id}` | `CampaignDetailPage` | Có ladder, seller badges, mua/chia sẻ; thiếu nội dung sản phẩm đầy đủ, review công khai và sticky CTA mobile |
| `#orders` | `BuyerDashboard` | Orders, entitlement, claim, review, support và dispute cùng một trang; thiếu chi tiết có URL riêng |
| `#seller` | `SellerDashboard` | Campaigns, fulfillment, webhook và create trong một component; form tạo thực tế chưa là wizard |
| `#operator` | `OperatorPortal` | Disputes, badges, reconciliation, audit; chưa có Admin Deal Detail hoặc queue vận hành đầy đủ |
| `#docs` | `DeveloperDocs` | Có nội dung tích hợp; nên chuyển khỏi primary buyer navigation |

Các component hiện có gồm `Header`, `AuthModal`, `SellerRegisterModal`, `FundingModal`, `PreTxModal`, `TxTrackerModal`, `ShareModal`. Nên giữ chức năng và tách UI khỏi logic dịch vụ khi cải tổ; không xóa rồi làm lại lớp thanh toán.

Các nền tảng đáng giữ: principal pinning, authorization EIP-712, số tiền ở base units, RPC đọc có failover và chain check, kiểm receipt và event mua, chờ order được index, payment lock giữa các tab, checkpoint checkout/bridge, exact approval và kiểm ngân sách gas. Backend đã có support thread, review, seller response API, notification/email outbox, signed webhooks, DLQ, audit và reconciliation. Những phần này cần được hoàn thiện và đưa vào trải nghiệm đầy đủ, không nên tính lại toàn bộ là chức năng mới.

## 3 Đánh giá brief

### 3.1 Những định hướng nên giữ

1. Định vị marketplace sản phẩm số hợp pháp, nhấn mạnh quyền sử dụng riêng của từng buyer.
2. Buyer thấy sản phẩm, giá nhóm, tiến độ và quyền lợi; blockchain nằm trong bước thanh toán và chi tiết kỹ thuật.
3. Buyer, vendor và operations có navigation và bố cục riêng.
4. Deal Detail là màn hình trọng tâm; price ladder dùng lại ở nhiều khu vực.
5. Wizard tạo deal, preview tức thời, thiết kế mobile-first và có trạng thái ngoài happy path.
6. Quyền phân phối là phần bắt buộc; verified seller và verified rights cần phân biệt.
7. Làm bốn màn hình mẫu trước để kiểm tra thiết kế và patterns.

Đây là định hướng phù hợp hơn giao diện hiện tại vốn đặt Arc, escrow, gas, AES và technical metrics khá nổi bật ngay trong hành trình khám phá.

### 3.2 Những điểm cần sửa hoặc mở rộng

| Nội dung brief | Nhận định | Điều chỉnh đề xuất |
|---|---|---|
| Chỉ frontend, không redesign backend | Hợp lý khi bảo vệ settlement, nhưng chưa đủ cho Products, Rights, Settlements, Refunds và wizard thật | Cho phép mở rộng offchain schema/API có migration; giữ nguyên kinh tế campaign hiện hữu |
| Current price 105, maximum commitment 120, rebate 31 nếu final 89 | Có thể đúng với buyer đã khóa 120; không đúng mặc định với người mới mua ở 105 | Tách giá tham chiếu, giá đang khóa, khoản thực chuyển và rebate theo từng order |
| Join tối đa ba bước | Tốt ở cấp trải nghiệm | Bước thanh toán chứa các bước con khi cần auth, funding, approve và commit; không hứa tối đa ba chữ ký |
| Mỗi mục trong danh sách screens là một page | Dễ tạo quá nhiều page và navigation | Chia theo công việc; giao dịch, rebate, support có thể là section/tab trong Order Detail với deep link |
| Deal có trạng thái `disputed`, `settled` | Dễ hiểu nhầm toàn deal khi chỉ một order tranh chấp | Tách campaign lifecycle, fulfillment, allocation/claim và tranh chấp; hiển thị số order đang tranh chấp |
| Plans trên Deal Detail | Repository chưa có mô hình plan riêng | Xây Product/Plan; phiên bản đầu mỗi campaign gắn một plan, các plan khác dẫn sang campaign tương ứng |
| Luôn có reference price/review/verified badge | Chưa chắc dữ liệu đủ hoặc đã được kiểm chứng | Chỉ hiển thị dữ liệu có căn cứ; không lấy tier đầu làm giá bán lẻ hoặc tạo rating mẫu |
| Price rail ngang | Rõ trên desktop nhưng dễ chật trên mobile | Mobile ưu tiên giá hiện tại/tiếp theo và ladder dọc mở rộng; rail vẫn có bản đọc bằng văn bản |
| Bốn master screens là toàn Phase 1 | Hợp lý cho nghiệm thu UI | Cần thêm nền nghiệp vụ trước đó và một lát cắt end-to-end qua Order Detail sau đó |
| Component dùng một lần thì không tạo abstraction | Đúng với business abstraction | Vẫn được tách một phần lớn hoặc phức tạp để cô lập trách nhiệm, accessibility và kiểm thử |
| Inter bắt buộc | Là lựa chọn thẩm mỹ, không phải điều kiện sản phẩm | Plus Jakarta Sans đã có; có thể dùng cho cả body và heading để giảm số font |

Không nên mang cơ chế thành công/thất bại của sản phẩm tham khảo sang GroupDeal. Ví dụ điều khoản GroupGets có funding goal tối thiểu; contract GroupDeal hiện chốt tier tốt nhất đã đạt khi hết hạn, không có quy tắc tự hủy chỉ vì chưa đạt tier tiếp theo. Chỉ tham khảo cách giải thích tiến độ. [Điều khoản GroupGets](https://groupgets.com/policies/terms-of-service).

## 4 Những vấn đề cần xử lý trước khi mở rộng UI

P0 trong bảng là ưu tiên xử lý tính đúng đắn trước khi nghiệm thu tài chính/giao hàng; không đồng nghĩa đã chứng minh mất tiền trên deployment live.

| Ưu tiên | Bằng chứng trong mã nguồn | Ảnh hưởng | Việc cần làm |
|---|---|---|---|
| P0 | Contract phát `FundsClaimed(..., 2)` cho seller ở `GroupDealHub.sol:741`; indexer kiểm `claimType === 1` ở `indexerService.ts:644` | Projection không ghi seller đã claim; UI có thể tiếp tục báo số tiền rút được và mời gửi lệnh thừa, dù contract chặn rút lặp | Đồng bộ enum/event schema; kiểm cả event, calldata, số tiền và trạng thái contract; regression test seller claim thật qua indexer |
| P0 | Contract theo dõi `buyerClaimedAmount`; DB/UI chủ yếu dùng boolean `buyerClaimed` | Buyer claim rebate trước, sau đó được phân bổ refund bổ sung có thể không thấy nút claim phần mới | Lưu cumulative allocated/claimed và tính `claimable = allocated - claimed`; refresh đúng sau mọi event; không dùng boolean thay số tiền |
| P0 | Contract cap tổng rebate tại committed gross; nhánh `CampaignFinalized` của indexer cộng rebate rồi gán mà không cap | Early rebate lớn cộng giảm tier có thể làm projection lớn hơn số tiền đã commit | Dùng cùng công thức bảo toàn, đối chiếu `getOrderDetails` tại block xác định; test giá cuối rất thấp và early rebate lớn |
| P0 | `SellerDashboard` gửi `recordDeliveryOnchain` trước API lưu secret; `fulfillOrder` yêu cầu DB còn `PENDING`, trong khi indexer có thể đã đổi sang `DELIVERED` | Rủi ro race: bằng chứng delivery đã lên chain nhưng ciphertext chưa được lưu; buyer không lấy được license dù đồng hồ tranh chấp đã bắt đầu | Quy trình prepare/finalize delivery bền vững, idempotent; stage entitlement trước ký, reconcile sau receipt, retry không giao trùng; test indexer chạy trước API và backend down |
| P0 | `deliveryService.ts` dùng thời gian server để ghi delivery/dispute deadline; publish API cũng ghi lại start/end bằng thời gian server; indexer có dữ liệu event | Projection có thể lệch cửa sổ pháp lý/nghiệp vụ so với chain khi API chậm hoặc ghi đè | Thời gian tài chính lấy từ event/block đã xác minh; chỉ UI countdown dùng clock server đã đồng bộ |
| P1 | Rights hiện là boolean trong seller profile; publish và buy authorization chưa có hồ sơ quyền theo product/plan | Badge không chứng minh seller được phân phối mọi sản phẩm | Xây hồ sơ quyền có scope, evidence, reviewer và version; cưỡng chế policy ở API publish/authorize; kiểm hạn quyền và suspension |
| P1 | `testDeliveryFlow` tạo hai key mẫu bằng hậu tố, tạo metadata signed link/invite và kiểm cấu trúc URL | Test hiện chưa chứng minh kho license thật không cấp trùng, link có authorization hoặc invitation đã được nhà cung cấp chấp nhận | Adapter test phải đi qua kho/host/provider hoặc sandbox tương ứng; đo cấp trùng và retry bằng dữ liệu persist thật |
| P1 | `OrderRecord.txHash` bị delivery/confirm và indexer ghi đè; checkout tìm order qua `txHash` | Một field không đại diện ổn định cho lịch sử giao dịch; recovery mua có thể mất liên kết receipt gốc | Tách `commitmentTxHash`, `deliveryTxHash`, transaction records và lịch sử claim; lookup order theo commitment event ổn định |
| P1 | Indexer `CampaignCreated` chuyển draft ID sang chain ID và xóa key draft; frontend vẫn gọi publish bằng draft ID trả về trước khi ký | Rủi ro publish receipt đã thành công nhưng API trả 404 nếu indexer đã xử lý trước | Giữ stable local draft ID và mapping tới chain campaign; publish/reconcile idempotent theo intent, seller, terms và receipt; test cả hai thứ tự API/indexer |
| P1 | ShareModal nhúng endpoint `widget-data` vào iframe; endpoint trả JSON và `campaignUrl` là localhost/path chưa có router tương ứng | Widget chưa là giao diện nhúng hoàn chỉnh; link chia sẻ/integration không nhất quán | Tạo route widget render HTML, origin từ cấu hình, canonical deal URL và metadata chia sẻ |
| P1 | Hash listener không đặt lại `currentTab` cho `#explore`/hash rỗng; fetch detail lỗi vẫn rơi vào `loading || !campaign`; CTA chỉ disable khi committing | Back/Forward sai trang; lỗi/not-found có thể hiển thị tải vô hạn; deal đóng vẫn cho mở confirm rồi thất bại về sau | Router chuẩn, error/not-found rõ ràng và action availability theo trạng thái/tồn kho/thời gian/quyền |
| P1 | Deal Detail viết quá SLA thì contract tự kích hoạt refund 100%; seller modal viết không ai ngoài buyer có thể đọc nội dung | Lời hứa mạnh hơn triển khai: breach cần action onchain và claim; backend giữ khóa giải mã, mức bảo mật còn phụ thuộc access control và secret management | Viết đúng allocation/claim và phạm vi bảo vệ; sửa cả copy, i18n, metadata, tooltip và success states |

Ví dụ lỗi số tiền cần test: order commit 100, final product charge theo tier là 20, early rebate là 90. Rebate tính thô là 80 + 90 = 170, nhưng contract cap tại 100. Projection phải phản ánh cap này; UI không được trình bày 170 là khoản rút được.

Ví dụ partial claim: commit 105, final 89, rebate 16; buyer rút 16. Sau đó delivery breach phân bổ refund 89. Buyer phải còn rút được 89, bất kể cờ `buyerClaimed` trước đó từng là true.

Với delivery race, cần tái hiện cả hai thứ tự event/API. Việc chỉ chạy test hàm encrypt/decrypt hoặc khẳng định một boolean `atomicAllocationVerified` chưa đủ nghiệm thu. Một số checklist trong kế hoạch cũ đã tích wizard/adapters, trong khi triển khai được đọc vẫn có form dài và adapter test mô phỏng. Nên cập nhật trạng thái bằng kết quả hành trình thực tế khi bắt đầu implementation, bảo toàn bằng chứng cũ theo phạm vi của chúng.

## 5 Mô hình sản phẩm cần có

### 5.1 Tách các thực thể đang bị gộp vào campaign

| Thực thể đề xuất | Nội dung chính | Mục đích |
|---|---|---|
| Vendor/Business | Hồ sơ, liên hệ, payout verification, trạng thái vận hành | Định danh đối tác; badge danh tính tách khỏi quyền phân phối |
| Product | Mô tả, ảnh, category, compatibility, tính năng, support và FAQ | Nội dung dùng lại cho nhiều đợt deal |
| ProductPlan/LicensePolicy | Edition, số seat, hạn sử dụng, phạm vi sử dụng, hạn/điều kiện kích hoạt, vùng áp dụng | Buyer biết chính xác mình mua quyền gì |
| RightsVerification | Vendor, product/plan scope, vai trò khai báo, evidence riêng tư, thời hạn, reviewer, quyết định và lịch sử | Kiểm quyền theo từng sản phẩm và phiên bản |
| Campaign/Deal | Một plan snapshot, tiers, metric, tồn kho, hạn chốt, SLA, terms/logic version, payout principal | Tách nội dung marketing khỏi điều khoản đã công bố |
| Commitment/Order | Buyer principal, quantity, locked price, gross và commitment receipt | Một campaign có nhiều order; mua thêm không tạo buyer count mới cho cùng identity |
| Entitlement/FulfillmentJob | Một hoặc nhiều entitlement theo quantity, inventory reservation, delivery attempt, trạng thái và hướng dẫn | Giao đủ license/seat của từng order, không chỉ một chuỗi chung |
| Transaction/Claim | Loại action, chain/contract, order IDs, tx hashes, allocated/claimed amount, receipt và thời gian | Đối soát và recovery rõ ràng |
| SupportCase/Dispute | Thread, evidence riêng tư, hạn tranh chấp, verdict và kết quả phân bổ | Hỗ trợ thông thường tách khỏi thao tác đóng băng tiền |

Đề xuất giai đoạn đầu: **một campaign gắn một plan và một nhóm pricing tiers**. Nếu người dùng chọn plan khác, chuyển tới campaign tương ứng và giải thích tiến độ của nhóm đó. Không tự gộp các edition có đơn giá khác nhau vào một pool đang dùng contract một đơn giá.

Khi publish, lưu snapshot nội dung/quyền/license policy mà buyer đã chấp thuận. Thay Product sau đó không thay quyền của order cũ. Bổ sung điều khoản theo version cho campaign mới; không viết lại terms của campaign có commitment. Schema/migration phải có cách đọc campaign cũ thiếu product/rights metadata mà không tự gán verified.

Đề xuất terms schema cho campaign mới bao gồm hash của product/plan/license-policy snapshot bên cạnh các thông số tài chính hiện có. Contract nhận `termsHash` nên có thể ghim nội dung này mà chưa cần đổi công thức settlement, nhưng canonical serialization, backend authorization, SDK và dữ liệu lưu trữ phải thống nhất version. Không coi một mô tả catalog có thể sửa tùy ý là toàn bộ điều khoản buyer đã mua.

Quyền phân phối là yêu cầu sản phẩm và quy trình kiểm duyệt; báo cáo này không kết luận seller cụ thể có quyền pháp lý chỉ từ một badge. Evidence phải được reviewer kiểm tra theo phạm vi công bố và không đưa ra public API.

### 5.2 Cách diễn đạt giá và tiền hoàn

Định nghĩa thống nhất cho mọi UI và API:

- **Giá nhóm hiện tại:** đơn giá tier đã unlock, có timestamp nguồn dữ liệu.
- **Khoản cam kết của lần mua:** đơn giá được khóa khi transaction được thực thi nhân quantity; transfer USDC vào escrow.
- **Mức tiền hàng tối đa đã xác nhận:** giới hạn cho lần mua đang review, tách khỏi gas. Contract hiện không nhận một tham số cap tùy ý; giữ các kiểm tra giá/terms, exact approval và tính chất tiers chỉ giảm. Không quảng cáo tính năng đặt bid/cap tùy ý khi chưa có protocol hỗ trợ.
- **Giá cuối:** tier tốt nhất được chốt sau campaign; không gọi tier tiếp theo là giá chắc chắn.
- **Rebate theo order:** chênh lệch locked price và final price nhân quantity, cộng early rebate hợp lệ, cap tại committed gross.
- **Refund:** khoản hoàn vì breach, dispute hoặc cancel theo allocation của contract; khác rebate giảm giá.
- **Có thể rút:** tổng phân bổ cho buyer trừ tổng đã rút. “Đã hoàn về ví” chỉ dùng sau claim được xác minh.
- **Giá tham chiếu:** nguồn, ngày và cùng edition/thời hạn/quyền sử dụng; thiếu căn cứ thì bỏ. Tier đầu chỉ được gọi là giá nhóm ban đầu.

Ví dụ với quantity 1, không có early rebate:

| Buyer | Đã khóa | Giá hiện tại | Final giả định | Rebate của buyer |
|---|---:|---:|---:|---:|
| Người mới mua ở tier hiện tại | 105 | 105 | 89 | 16 |
| Người đã mua trước đó | 120 | 105 | 89 | 31 |

“Giảm thêm 16 nếu đạt tier tiếp theo” là lợi ích so với giá nhóm hiện tại. “Bạn nhận lại 31” chỉ đúng với order khóa 120 trong ví dụ này. Nếu 120 là giá tham chiếu bán lẻ, không được lấy 120 − 89 làm số tiền hoàn cho người mới chuyển 105.

Gas/phí funding trình bày riêng trước ký. “Không trả hơn mức cam kết” phải ghi rõ đó là tiền sản phẩm, không hứa tổng gas/funding không biến động. Phí platform v1 bằng 0; không tự bật phí, coupon hoặc referral bằng tiền nếu chưa có chính sách và logic hỗ trợ.

Contract khóa đơn giá trước khi tăng metric và unlock tier do lần mua đó. Buyer cuối cùng giúp mở tier mới vẫn có thể chuyển khoản theo giá trước unlock rồi được rebate khi chốt. Preview “sau khi bạn tham gia” phải phân biệt giá nhóm mới với khoản thực cam kết của transaction này; receipt/event quyết định số thực tế.

### 5.3 Trạng thái phải chia theo chiều nghiệp vụ

| Chiều trạng thái | Nguồn và cách dùng |
|---|---|
| Campaign lifecycle | DRAFT/PUBLISHED/ACTIVE/FINALIZED/CANCELLED được map từ DB/contract; `ending soon`, `closed awaiting finalization` là display state có căn cứ |
| Fulfillment | Chờ campaign chốt, sẵn sàng giao, có proof nhưng artifact chưa sẵn sàng, đã giao, confirmed, breach; không báo license sẵn sàng chỉ từ proof |
| Payment transaction | Chờ ví, đã broadcast, pending, receipt xác minh, chờ indexer, complete, rejected, reverted, unknown/reconciling |
| Allocation và claim | Chưa phân bổ, đã phân bổ, có thể rút, đang rút, đã rút, cần kiểm tra; thể hiện amount cumulative |
| Dispute | Cửa sổ còn mở, đang tranh chấp, cần thông tin, đã phân xử; order dispute không đổi toàn campaign thành disputed |
| Rights/moderation | Pending, needs information, approved, rejected, suspended, expired theo scope; tách khỏi lifecycle tài chính |

“Settled” ở mức deal nên có định nghĩa tổng hợp và counters riêng: bao nhiêu order đã phân bổ, bao nhiêu còn dispute/fulfillment, bao nhiêu tiền còn claim. Chưa rút tiền không có nghĩa chưa phân bổ; claim không tự hết hạn. “Upcoming” chỉ triển khai khi có lịch publish/start thực sự; contract hiện bắt đầu tại thời điểm tạo campaign.

## 6 Trải nghiệm buyer cần triển khai

### 6.1 Khám phá và quyết định mua

Home ưu tiên sản phẩm và deal đang mở. Bổ sung tìm kiếm, category, sort rõ nghĩa, filters trạng thái/giá/license và phân trang. Deal card có ảnh, title, quyền/plan ngắn gọn, seller, giá hiện tại, metric đúng loại, tier tiếp theo và thời gian kết thúc. Không dùng volume test USDC làm tuyên bố doanh thu tiền thật hoặc lấy mức giảm tối đa tiềm năng gọi là mức tiết kiệm đã đạt.

Deal Detail desktop có nội dung chính và purchase panel sticky. Mobile đưa tên sản phẩm, seller, giá và tiến độ lên sớm; giới hạn chiều cao media để không đẩy toàn bộ thông tin quyết định xuống dưới. Sticky CTA gồm giá và hành động; thứ tự ảnh/seller/title trong brief là điểm khởi đầu, cần điều chỉnh theo độ dài tên và media thực tế.

Nội dung bắt buộc: buyer nhận gì, edition/seat/thời hạn/license scope, hướng dẫn và hạn kích hoạt, hệ điều hành/tích hợp, seller và phạm vi verification, metric/tier, deadline, SLA bắt đầu từ thời điểm campaign được finalize, dispute window, claim/refund rules. FAQ/reviews xuất hiện khi có dữ liệu; không thêm các block rỗng chỉ để đủ mẫu.

PriceTierRail nhận metric và quantity context; ở BUYER_COUNT cần ghi “tài khoản mua đủ điều kiện”, không khẳng định số người độc nhất. Mua thêm của một identity tăng units nhưng không tăng buyer count. Ở UNITS_COUNT phải ghi số license/đơn vị, không đổi nhãn thành buyers. Khi đạt tier cuối, show đã đạt mức giá tốt nhất; không còn CTA hứa mở tier mới.

### 6.2 Join với ba bước cấp cao

1. **Xác nhận:** plan, quantity, giá hiện tại, tổng tiền hàng tối đa của lần mua, mức thấp hơn có điều kiện, rebate minh họa, SLA và điều khoản. Giữ lựa chọn khi cần đăng nhập/xác thực lại.
2. **Thanh toán:** ví/nguồn tiền, khoản thiếu, funding nếu cần, gas và phí dự kiến, approve và mua. Các bước con có tiến độ; buyer hiểu hành động ví sắp ký mà không phải đọc EIP-712/RPC/nonce. Nạp tiền thành công nhưng deal hết hạn phải nói rõ tiền vẫn ở ví và chưa tạo order.
3. **Đã tham gia:** chỉ sau receipt/event đúng và order được đồng bộ; có thể hiện trạng thái trung gian “Đã nhận giao dịch, đang cập nhật đơn”. Hiển thị tiến độ mới từ dữ liệu xác nhận, View My Deal và Share Deal. Không tự cộng một buyer từ số cũ trên client.

Guest vẫn xem được marketplace. Khi nhấn Join, ưu tiên luồng email dễ hiểu, ví ngoài là lựa chọn cho người đã có ví; không ép kết nối ví trước khi biết sản phẩm. Giữ hai phương thức auth hiện có. Phiên GroupDeal và phiên ký Circle là hai trạng thái khác nhau; hết phiên ký thì xác thực lại tại bước cần ký, không bắt đăng xuất hoặc tạo tài khoản mới.

Recovery phải mở được từ account/activity và Order Detail, không chỉ từ modal trong một tab. Bổ sung payment intents persist phía server, lưu hashes và provider operation IDs phù hợp, reconcile receipt và order, chống gửi lặp. Khi trạng thái chưa rõ, ưu tiên “kiểm tra lần thanh toán này”; lỗi HTTP không làm phát sinh nút mua lại tự động.

### 6.3 Sau mua là phần cốt lõi

**My Deals** gom theo campaign để buyer theo dõi tiến độ và tổng các lần mua. **Orders** liệt kê từng commitment/fulfillment. Hai mục có vai trò khác nhau; không nhân bản cùng một danh sách dưới hai tên.

Order Detail phải có financial summary theo order, timeline với deadline chính xác, entitlement theo quantity, copy/download/activation và hướng dẫn, trạng thái license, confirm receipt, support, dispute và claim. Buyer không phải đọc contract để biết bước tiếp theo. Chỉ hiện confirm khi có sản phẩm để kiểm tra; trước confirm giải thích việc phân bổ tiền và tác động tới quyền tranh chấp.

Claim có thể gộp các order cùng campaign và cùng pinned principal theo contract hiện có, với batching có giới hạn gas. Không hứa một transaction cho mọi campaign/ví. Sai ví thì chỉ dẫn về đúng principal; đổi active wallet hoặc khôi phục tài khoản không chuyển quyền nhận tiền.

Support thread không thay open dispute. Màn hình phải nhắc deadline và có hành động bảo vệ quyền trước khi hết cửa sổ. Fallback khẩn cấp cho Circle cần được thiết kế và chứng minh hoạt động; việc contract có `emergencyOpenDisputeWithSignature` hoặc UI chép tên hàm chưa chứng minh buyer có thể sử dụng khi backend/provider gặp sự cố.

Notifications cần trang riêng, unread/read, link chính xác tới deal/order/case, preference và trạng thái gửi email. Ratings dựa vào order đủ điều kiện, một review/order theo rule hiện có; seller response API cần UI và review công khai cần API tổng hợp/moderation.

## 7 Trải nghiệm vendor và rights cần triển khai

Vendor có dashboard tác vụ: deal đang mở thật sự, đơn có thể giao sau finalize, deadline gần nhất, lỗi delivery, dispute cần phản hồi, khoản đã phân bổ/có thể claim. Không lấy mọi campaign làm số “đang mở”, hoặc mọi order PENDING làm “chờ giao ngay”.

Wizard gồm Product → Rights → Pricing → Fulfillment → Review. Mỗi bước có validation, lưu nháp bền vững, resume sau reload và giữ draft khi publish transaction chưa rõ. Desktop preview song song; mobile preview qua section/toggle để tránh buộc cuộn qua toàn bộ bản preview sau mỗi bước.

Các trường cần mở đầy đủ: thêm/xóa 2–5 tiers, threshold tăng/price giảm, metric, max/account, tồn kho hoặc không giới hạn, duration, visibility PUBLIC/UNLISTED, early rebate/slots theo logic đang hỗ trợ, delivery method và SLA. Backend hiện chỉ cập nhật một số metadata của draft; cần API update draft đầy đủ và tính lại terms/dry-run validity khi cấu hình liên quan đổi.

Validation pricing phải kiểm cả khả năng đạt tier: với UNITS_COUNT, threshold cuối không vượt inventory; với BUYER_COUNT, số buyer tối đa cũng chịu giới hạn tổng units. Có giải thích hậu quả và ngăn cấu hình bất khả thi theo policy đã xác định. Chính sách UX đề xuất là tier đầu threshold 1 để tránh biểu đồ ngụ ý cần đạt một minimum goal chưa tồn tại.

Rights không chỉ là dropdown chọn vai trò. Seller nêu scope được cấp, chủ quyền/đơn vị cấp, edition/plan, thời hạn, vùng phân phối và tài liệu. “Authorized Reseller” hoặc “Vendor” là khai báo, không tự tạo trạng thái approved. Review có request more information, approve, reject, suspend, expiry và audit. Suspension xử lý listing/commitment mới, còn quyền của order cũ theo điều khoản và thẩm quyền hiện hữu; không tự xóa license hoặc thu hồi tiền đã quyết toán.

Policy này kiểm soát marketplace và việc cấp authorization mới; `createCampaign` hiện có thể được gọi trực tiếp onchain, còn authorization đã ký có cửa sổ hiệu lực riêng. Không tuyên bố suspension có thể thu hồi tức thì mọi authorization cũ khi contract chưa có cơ chế đó. Campaign đồng bộ chỉ từ chain nhưng thiếu catalog/rights hợp lệ phải đi vào queue đối soát, không tự được đưa lên marketplace. Nếu kinh doanh cần chặn tức thì ở protocol, đó là yêu cầu riêng phải đánh giá với authority và campaign version.

Fulfillment cần key inventory/import bảo mật, unique allocation, reservation, batch jobs, retry và failure queue. Với quantity lớn hơn 1 phải giao đủ quyền được mua. File link cần endpoint thật kiểm access/expiry; invitation cần provider acceptance/status; webhook fulfillment cần callback và correlation chứng minh giao quyền thực tế. Không cấp quyền bằng một chuỗi mẫu dùng chung cho mọi order.

Entitlement chuẩn bị trước ký phải được stage mã hóa và không expose cho buyer trước điều kiện giao. Chỉ retry finalize artifact sau receipt hợp lệ; không cấp key mới hoặc ghi delivery lại khi kết quả cũ chưa rõ. Mỗi adapter cần test kết quả ở đầu nhận. SLA/window lấy từ chain; cảnh báo deadline không tự phân bổ tiền ở DB.

Business/Profile, settlement/claim history, hỗ trợ buyer và seller reply review cần UI riêng. Integrations/Webhook nằm trong vendor; merchant metrics và breakdown giúp vận hành, còn lịch chi trả cố định kiểu ngân hàng không áp dụng cho pull claim. Có thể tham khảo cách [Groupon Merchant tách lịch sử thanh toán và chi tiết từng khoản](https://www.groupon.com/merchant/working-with-groupon/how-it-works/groupon-payments-and-promotional-programs).

## 8 Trải nghiệm operations và quyền hành động

Operations dùng sidebar và work queues; ưu tiên đối tượng cần xử lý và deadline. Tách marketplace review khỏi transaction/chain operations, dù có thể chung shell trong cùng codebase. “Ba surfaces độc lập” không cần ba ứng dụng deploy riêng ở giai đoạn đầu.

Admin Deal Detail có summary: campaign, product/plan snapshot, seller/rights, lifecycle, tier/metric, deadlines, escrow/allocation/claim counters và tình trạng đồng bộ. Tabs: Overview, Participants, Transactions, Settlement, Refunds, Disputes, Audit. Tab được deep link; tải khi mở, có pagination, không tải mọi dữ liệu trong một lần.

Queue cần có: quyền cần duyệt/thiếu thông tin; campaign đã hết hạn chờ finalize; delivery gần/quá SLA; order hết cửa sổ cần settle; giao dịch unknown; refund/claim lỗi; dispute gần hạn; reconciliation sai lệch; webhook/email DLQ. Mỗi action có eligibility/reason từ backend, thao tác vẫn kiểm quyền ở contract/API.

**Phải tách authority:** marketplace reviewer, support, financial operator, system administrator và Security Multisig là capability khác nhau. Repository hiện có roles buyer/seller/operator và quyền contract riêng; bổ sung permission scopes từng bước. Không suy ra mọi account `operator` có thể emergency cancel; nút hủy phải đi qua security authority/Safe đúng quy trình, không gửi bằng ví operator thường.

Arbitration cần xem số unallocated thật, amount buyer/seller chính xác bằng base units, evidence và rationale, preflight + review trước ký. Slider phần trăm chỉ là tiện ích; không giới hạn phân xử vào bội số 5% hoặc làm tròn bằng floating point. Xử lý state đã thay đổi, receipt thành công nhưng API chưa lưu, và retry metadata idempotent.

Dashboard vận hành phải thể hiện độ mới, block/source của dữ liệu và cảnh báo sai lệch có hành động. Một kết quả conservation PASS không được viết thành bảo đảm tuyệt đối “không rò rỉ tiền” trên toàn hệ thống. Audit cần filter/pagination và thứ tự newest-first thay vì chỉ lấy 200 mục đầu.

## 9 Route map và cấu trúc component đề xuất

### 9.1 Routes theo công việc

| Khu vực | Routes đề xuất |
|---|---|
| Public | `/`, `/deals`, `/deals/:dealId`, `/vendors/:vendorId`, `/terms`, `/privacy`, `/help`, `/docs`, `/embed/deals/:dealId` |
| Join | `/deals/:dealId/join`, `/checkout/:intentId`, `/checkout/:intentId/success` |
| Buyer | `/my-deals`, `/my-deals/:dealId`, `/orders`, `/orders/:orderId`, `/notifications`, `/account`, `/account/security`, `/account/payments` |
| Support/refund | Sections hoặc nested routes của `/orders/:orderId`; `/support/cases/:caseId` cho case thực sự cần URL riêng |
| Vendor | `/vendor`, `/vendor/products`, `/vendor/products/:productId`, `/vendor/deals/new`, `/vendor/deals/:dealId`, `/vendor/orders`, `/vendor/orders/:orderId`, `/vendor/entitlements`, `/vendor/settlements`, `/vendor/disputes`, `/vendor/business`, `/vendor/rights`, `/vendor/integrations` |
| Operations | `/admin`, `/admin/deals`, `/admin/deals/:dealId`, `/admin/commitments`, `/admin/orders`, `/admin/settlements`, `/admin/refunds`, `/admin/vendors`, `/admin/products`, `/admin/rights`, `/admin/disputes`, `/admin/chain`, `/admin/users`, `/admin/audit`, `/admin/settings` |

Đây là route map đích, không phải lệnh tạo tất cả trang ngay. Payout History có thể là tab Settlements; các mục nhỏ có thể nằm trong Account. Route chỉ xuất hiện trong navigation khi đã có chức năng dùng được.

Tab, filter, sort và page lưu trong query parameters. Link `#campaign-{id}`, `#orders`, `#seller`, `#operator`, `#docs` được chuyển sang URL mới; bao gồm notification và SDK/widget. Với BrowserRouter phải cấu hình hosting fallback, giữ `/api` tách khỏi SPA và có 404 thực ở app. Nếu host chưa hỗ trợ rewrite, dùng router hash chuẩn tạm thời, không tiếp tục parser tab thủ công.

### 9.2 Hierarchy và trách nhiệm

```text
AppProviders
  AuthProvider / ExternalWalletProvider / Web3Provider / LanguageProvider
  QueryClientProvider / Router / AppErrorBoundary

PublicShell và BuyerShell
  BuyerHeader / BuyerMobileNav / NotificationEntry / AccountMenu
  DealDetailPage
    ProductSummary / SellerTrust / LicenseSummary
    PriceTierRail / NextTierBenefit / DealRules / Reviews
    StickyPurchasePanel / MobileStickyCTA
  JoinDealPage
    CommitmentReview / PaymentStep / JoinSuccess
  OrderDetailPage
    OrderTimeline / EntitlementPanel / FundsSummary / SupportPanel

VendorShell
  VendorSidebar / VendorMobileDrawer
  CreateDealWizard
    ProductStep / RightsStep / PricingStep / FulfillmentStep / ReviewStep
    DealPreview

AdminShell
  OperationsSidebar / WorkQueue / ActionReview
  AdminDealDetailPage
    DealSummary / DetailTabs / ResponsiveDataList / AuditTimeline
```

Shared UI: Button, Card, Dialog/Sheet, Menu, Tabs, FormField, StatusBadge, Money, Skeleton, EmptyState, ErrorState, Pagination và ResponsiveDataList. Shared business components: PriceTierRail, DealCard, SellerTrust, TransactionStatus, FinancialSummary, Timeline. Shell riêng cho từng vai trò; không tạo một AppShell nhận hàng chục flag để xử lý cả ba.

`domain/pricing` chứa hàm pure cho tier/progress/benefit và Money; `services` chứa API, wallet, checkout; hooks quản lý data/action. Component không gọi RPC trực tiếp hay tự suy diễn allocation. Local fixtures có kiểu đặt riêng, được đánh dấu chế độ fixture trong công cụ phát triển, không hiển thị thành dữ liệu live.

## 10 Responsive accessibility và hiệu năng

### 10.1 Tiêu chuẩn giao diện

Nền sáng trung tính, card trắng, border vừa đủ rõ, một màu brand. Success/saving dùng xanh; pending/warning dùng amber; error/destructive dùng đỏ. Badge có chữ/icon; không dùng màu làm thông tin duy nhất. Radius 12–16px và shadow nhẹ là hợp lý. Không chỉ đổi CSS variables: nhiều inline màu nền tối và chữ màu cố định phải được chuyển sang token tương ứng.

Body mobile và input tối thiểu 16px theo chuẩn sản phẩm; metadata nhỏ hơn chỉ ở vị trí phụ và vẫn đọc được. Font hiện có đủ để bắt đầu: Plus Jakarta Sans cho body/heading, mono chỉ dùng tiền khi cần và dữ liệu kỹ thuật. Định dạng tiền dùng tabular numerals, giữ base units ở logic, tránh tính totals bằng `Number` và rounding hai chữ số làm mất thông tin claim nhỏ.

### 10.2 Responsive theo nhiệm vụ

| Dải màn hình | Buyer | Vendor | Operations |
|---|---|---|---|
| Dưới 640 | Một cột, CTA sticky có safe-area, filters sheet, payment sheet/full page | Wizard một cột, preview toggle/section, controls đủ lớn | Drawer navigation, priority cards, detail disclosure, actions qua review sheet |
| 640–1023 | Bố cục theo chỗ thực có, có thể một cột detail với summary gọn | Form rộng hơn, preview dưới hoặc qua toggle | Sidebar thu gọn, bảng giảm cột theo mức ưu tiên |
| 1024–1279 | Detail hai cột khi tên/nội dung không bị chật | Form + preview khi đủ chiều rộng | Sidebar và data table ưu tiên tác vụ |
| Từ 1280 | Max width nội dung khoảng 1280–1360 | Preview dễ đọc, không kéo form vô hạn | Có thể rộng hơn buyer cho dữ liệu cần so sánh, giữ line length phần prose |

Các breakpoint chỉ là điểm khởi đầu. Phải kiểm tra 320, 375, 430, 768, 1024, 1280 và 1440 CSS px, cả landscape, bàn phím ảo, text dài tiếng Việt/Anh và browser zoom. Không dùng `overflow-x: hidden` để che lỗi. `minmax(280px, 1fr)` trong card có padding lớn và grid hai cột inline là những nơi cần kiểm tra, không tự coi là responsive đạt.

Sticky CTA chừa bottom space và `safe-area-inset-bottom`, tránh chồng mobile nav, keyboard hoặc che focus. Có thể bỏ sticky khi không đủ diện tích/zoom hoặc chuyển trạng thái hợp lý khi deal đóng. Table mobile giữ ID, trạng thái, amount/deadline và action quan trọng trong card; link mở đủ chi tiết. Những bảng so sánh thực sự cần hai chiều có thể scroll trong vùng có nhãn, không cấm mọi horizontal scroll một cách máy móc.

### 10.3 Accessibility có thể nghiệm thu

Mục tiêu đề xuất là WCAG 2.2 AA cho phạm vi ứng dụng; 44px là quy tắc tap target của sản phẩm, không mô tả nhầm thành mọi yêu cầu AA. [SC 2.5.8 có mức tối thiểu và các ngoại lệ riêng](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Thực hiện keyboard navigation và focus-visible, labels gắn control, error summary/error theo field, heading landmarks, thông báo trạng thái bằng live region có giới hạn, không đọc countdown mỗi giây, và reduced motion. Các modal/menu tự viết hiện chưa có một primitive dùng chung đảm bảo trap/restore focus, Escape và semantics; phải bổ sung và kiểm thao tác thực tế. [W3C Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Kiểm reflow tại 320 CSS px và text zoom; kiểm sticky header/footer không che phần tử đang focus. Quy tắc này có căn cứ từ [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) và [Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Automated audit hỗ trợ nhưng không thay keyboard/screen-reader testing.

### 10.4 Hiệu năng và khả năng mở rộng

Tách bundle theo route/surface, lazy-load wallet/funding khi có thể mà không phá session đã khởi tạo. Có image dimensions/aspect ratio, responsive thumbnails, pagination API, cache và polling khi tab visible; không đưa mọi order/ciphertext/audit vào danh sách. Cache key gắn account/chain/contract và xóa dữ liệu riêng tư khi chuyển phiên. Không retry tự động mutation tài chính chỉ vì timeout.

Trang public cần title/description/canonical và ảnh chia sẻ theo từng sản phẩm/deal, với chiến lược render kiểm chứng được bằng crawler/share preview. Có thể prerender hoặc render riêng nội dung public/metadata bằng backend hiện có; chưa cần di chuyển cả buyer/vendor/admin sang framework khác chỉ để làm SEO. Tách thông tin public khỏi account data và kiểm URL chính thức trong SDK/widget.

Review việc dùng `nodePolyfills()` tổng quát và bundle wallet theo dependency thực tế; chưa bỏ polyfill trước khi chứng minh SDK vẫn hoạt động. Không cài thêm UI framework/font/state library đồng loạt. Sau baseline đo hiệu năng, đề xuất mục tiêu field p75: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1; đây là mục tiêu nghiệm thu đề xuất, chưa phải số đo GroupDeal.

Các ngưỡng trên theo [Core Web Vitals thresholds của web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds). Lab test cần cấu hình thiết bị/mạng có thể lặp lại; field performance chỉ có thể xác nhận khi có dữ liệu người dùng đủ phạm vi.

Persistence hiện dùng SQLite WAL nhưng phần lớn state là `app_state.state_json`, và `save()` ghi lại state cùng các bảng uniqueness. Đây chưa phải mô hình relational để query/pagination lớn. Khi bổ sung Product/Rights/Entitlement/Transaction, ưu tiên bảng và index riêng, migration/repository rõ ràng, load test và kiểm contention. Có thể giữ SQLite trong triển khai một instance nhỏ; PostgreSQL trở thành lựa chọn khi cần nhiều writer/worker hoặc số liệu chứng minh cần, không chuyển database theo cảm tính. Không scale nhiều backend instance ghi whole-state hiện tại mà chưa kiểm tính nhất quán.

## 11 API và thay đổi file cần thiết

### 11.1 API thiếu hoặc cần hoàn thiện

Các tên sau là đề xuất interface, chưa phải endpoint đã tồn tại:

| Nhóm | Công việc cần có |
|---|---|
| Catalog | Query search/filter/sort/pagination, Product/Plan, seller public profile, review aggregate và dữ liệu detail |
| Rights | Tạo hồ sơ theo product/plan, upload evidence riêng tư, review decisions, expiry/suspension, audit và publish/authorize policy |
| Draft | CRUD cấu hình đầy đủ, version/optimistic concurrency, save/resume, validation và dry-run gắn config version |
| Buyer | My Deals aggregate, order detail có ownership, timeline, entitlement summary, cumulative funds và action eligibility |
| Checkout | Durable intent/action records, receipt/provider lookup, reconcile trạng thái unknown; không lưu private key/OTP/secret signing vào intent |
| Fulfillment | Prepare artifact, inventory reservation, finalize theo receipt, retry idempotent, provider adapter/callback và failure queue |
| Settlement | Allocation/claimed/claimable breakdown, transaction history, batch eligibility; không tự đánh dấu refunded bằng worker DB |
| Operations | Deal/order/commitment query, deadlines queues, detail tabs, permission scopes và sensitive action review |
| Integrations | DLQ UI/replay theo quyền, widget render, canonical URL và public event schema thống nhất |

Chuẩn hóa response gồm dữ liệu domain, timestamp/block nguồn tài chính, trạng thái sync và action availability. Dùng decimal/base-unit strings cho tiền, typed errors có code và message người dùng hiểu. Frontend filter không thay kiểm quyền hay việc xác minh receipt. Query list và detail không trả license/evidence secret ngoài nhu cầu được cấp quyền.

### 11.2 Các file Phase 1 dự kiến

| Phần | File/thư mục dự kiến | Mục đích |
|---|---|---|
| Routing | Sửa `frontend/src/App.tsx`; thêm `router/`, `layouts/BuyerShell.tsx`, `VendorShell.tsx`, `AdminShell.tsx` | Route chuẩn, legacy links, shells và guards |
| UI foundation | Sửa `index.css`, `index.html`, `components/Header.tsx`; thêm `styles/`, `components/ui/` | Tokens sáng, typography, spacing, focus, dialog/sheet và responsive |
| Domain/API | Thêm `domain/money.ts`, `domain/pricing.ts`, `types/`, `services/api.ts`, `hooks/` | Giá/state có kiểu, API/error thống nhất |
| Master buyer | Refactor `pages/CampaignDetailPage.tsx`, `PreTxModal.tsx`, `TxTrackerModal.tsx`; thêm `features/deals/`, `features/checkout/` | Detail + Join dùng cùng pricing và giữ logic payment an toàn |
| Master vendor | Tách create khỏi `SellerDashboard.tsx`; thêm `features/vendor/create-deal/` và `DealPreview` | Wizard, draft/resume, tiers, rights, fulfillment |
| Master admin | Tách `OperatorPortal.tsx`; thêm `features/admin/deal-detail/` | Summary/tabs, read models và action eligibility |
| Shared business UI | Thêm `PriceTierRail`, `Money`, `StatusBadge`, `TransactionStatus`, `FinancialSummary`, `ResponsiveDataList` | Reuse thực sự giữa surfaces |
| Backend nền | Sửa store/indexer/delivery/campaign/order/operator routes; thêm catalog/rights/intent/transaction/entitlement modules và migrations | Sửa P0 và phục vụ workflows thật |
| Kiểm thử | Bổ sung regression backend/indexer; bổ sung Playwright master screens và các trạng thái quan trọng | Đúng số tiền, recovery, keyboard, responsive và deep link |

Không tạo contract mới để đổi màu, router hoặc product metadata. Nếu sau này cần custom bid cap, deferred charge, minimum funding goal, multiple plan pricing chung pool, fees hay auto payment khác pull claim, phải có spec/version và đánh giá protocol riêng cho campaign mới.

## 12 Phạm vi tính năng và thứ tự thực thi

### 12.1 Phân loại phạm vi

| Mức | Nội dung | Lý do |
|---|---|---|
| Bắt buộc trước nghiệm thu sản phẩm | P0 projection/delivery; pricing rules; Product/Plan/Rights; wizard thật; buyer order/entitlement/claim/support/dispute; seller fulfillment; operations queues; responsive/a11y; recovery và thông báo | Hoàn thành một giao dịch mua có quyền sử dụng và bảo vệ đầy đủ |
| Bổ sung tiếp theo để marketplace sử dụng tốt | Search/filter/sort, seller storefront/reputation, public reviews/response, save/follow deal, thông báo unlock/ending, batch fulfillment/claim, widget thật, analytics funnel | Giúp buyer tìm được deal, kéo thêm buyer và giúp seller vận hành |
| Khi có nhu cầu được chứng minh | Watchlist nâng cao, compare plans, organization seats, team permissions, renewal/expiry reminders, seller API onboarding, catalog import và advanced reporting | Mở rộng đúng nhu cầu mà không tạo thêm nghiệp vụ tài chính ngầm |
| Lộ trình riêng | Mainnet + token swap/bridge được hỗ trợ, fiat/onramp thực, paid referral/coupon, fee khác 0, multi-plan pool | Phụ thuộc provider, policy, authority và protocol/acceptance riêng |

Với group-buy, chia sẻ/follow và notification unlock là phần hỗ trợ giá trị cốt lõi, không chỉ tính năng phụ cho đẹp. Tuy nhiên, notification không được spam và không hứa user chắc chắn được giá thấp nhất. Share referral có thể ghi attribution; trả thưởng bằng tiền cần quyết định kinh tế riêng.

### 12.2 Các giai đoạn đề xuất

| Giai đoạn | Đầu ra | Điều kiện chuyển tiếp |
|---|---|---|
| 0 Thống nhất nghiệp vụ và sửa nền | Pricing/state contract, P0 fixes, cumulative funds, delivery idempotency, read-model timestamps, typed API; schema Product/Plan/Rights/Draft | Regression phản ánh code thật; đối soát đúng các case partial claim/early rebate/claim seller/delivery race |
| 1 Thiết lập bốn master screens | Buyer Deal Detail, Buyer Join, Vendor Create Deal, Admin Deal Detail; tokens, shell, common patterns | Đạt UI/responsive/a11y và dùng rules đúng; fixture chỉ phục vụ layout riêng, không gọi là nghiệm thu sản phẩm |
| 2 Hoàn thành một hành trình xuyên suốt | Product + approved rights → draft → publish → join → finalize → entitlement → confirm/dispute/breach → claim | Browser/API/indexer/contract nối được; Order Detail, notification và failure recovery hoạt động |
| 3 Hoàn thiện ba surfaces | Catalog, My Deals/Orders, Account, vendor fulfillment/settlements/business/integrations, operations queues/settings cần thiết | Navigation không dead end; đủ empty/error/permissions; API pagination và workflow thật |
| 4 Nghiệm thu và vận hành | Candidate cố định, live Arc Testnet journeys, backup/restore, monitoring, dependency/CSP review, independent sign-off | Bằng chứng trên cùng candidate theo G5/G6; không lấy mocked tests thay live product acceptance |
| 5 Mở rộng theo số liệu | Growth, organization/renewal, provider/token/mainnet roadmap | Chỉ mở feature khi có nhu cầu, capability và tiêu chí nghiệm thu riêng |

Trong giai đoạn 1 có thể làm layout trên fixture khi API mới đang được xây, nhưng phải ghi rõ sự phân biệt này trong acceptance. Không để Phase 1 UI bị kẹt vì mọi endpoint phải xong cùng lúc, cũng không coi frontend fixture là sản phẩm hoạt động.

Không có cơ sở cam kết số ngày chính xác từ một brief. Nên ước lượng lại theo từng gói sau giai đoạn 0, khi schema/API, số adapter và phạm vi browser đã chốt. Cắt nhỏ pull requests theo domain để review được và tránh một lần thay toàn bộ frontend lẫn luồng ví.

## 13 Nghiệm thu cần vượt mức bốn màn hình đẹp

### 13.1 Logic và dữ liệu

- BUYER_COUNT và UNITS_COUNT cho đúng tiến độ; mua thêm không đếm trùng identity; tier cuối và tier threshold crossing chính xác.
- Preview rebate theo locked price, quantity và early allocation; cap và rounding đúng, gas riêng.
- Seller claim event type 2; partial buyer claim rồi refund bổ sung; claim không chuyển principal; DB/API/UI khớp contract tại block kiểm tra.
- Campaign hết hạn chưa finalize khác đã chốt; SLA bắt đầu từ finalizedAt; 48h từ delivery event, không từ lúc người dùng mở trang.
- Sold-out và early-slot race; cùng identity hai ví; terms/auth sai/expired; ví/người dùng đổi trong lúc flow; funding xong deal đã đóng.
- Delivery prepare/record/finalize bị ngắt ở từng điểm; indexer đến trước API; callback/retry/reload không cấp license trùng hoặc mất artifact.
- Publish được index trước API xác nhận vẫn tìm đúng draft/campaign, không báo thất bại rồi tạo campaign thứ hai.
- Confirm/dispute/claim thành công trên chain nhưng API lỗi vẫn reconcile được; unknown không thành success/failure tùy tiện.
- Publish và buy authorization từ chối product/rights không đạt policy; draft edit làm mất hiệu lực dry-run/terms review liên quan.

### 13.2 UX responsive và accessibility

- Bốn master screens tại 320/375/430/768/1024/1280/1440; thêm Order Detail và fulfillment/support ở giai đoạn end-to-end.
- Không clip content, CTA, tiers hay dropdown khi text dài, lỗi dài, keyboard mở và zoom; tap targets ≥44px theo chuẩn sản phẩm.
- Table/card giữ thông tin và action trọng yếu; forms/error messages đọc được; sticky không che focus/nội dung.
- Keyboard-only và screen reader cho dialog, menu, wizard, tabs, payment states; focus trở về vị trí đúng.
- Loading/empty/error/not-found/forbidden/disabled/offline/stale-data; có retry phù hợp và không gửi mutation tài chính lặp.
- Deep link, reload, Back/Forward, filter/tab state, logout và legacy links; notification đưa tới đúng đối tượng.
- Chromium/WebKit/Firefox có phạm vi kiểm rõ; Circle/Reown thử trên browser/mobile wallet được hỗ trợ, gồm app switching và quay về trang.

### 13.3 Bằng chứng sản phẩm và vận hành

Một buyer phải tự đọc màn hình và nói đúng: mua quyền gì; hiện cam kết bao nhiêu; điều gì làm giá giảm; khi nào nhận; nhận lại tiền bằng cách nào; làm gì khi license lỗi. Thử usability với nhóm nhỏ có cả người chưa dùng ví và seller; số mẫu là lựa chọn kiểm tra thực tế, không phải chứng minh thống kê.

Nghiệm thu live cần buyer, seller, operator và security principals đúng thẩm quyền, receipt/event, projection, entitlement thực và đối soát trên cùng candidate. Diễn tập email/webhook retry, provider/indexer/backend outage và restore. Người kiểm thử tự xác nhận thao tác ví; không dùng secret trong báo cáo hoặc giả lập signing để chứng minh live.

Các gate G1/G4/G5/G6 đang mở không tự đóng khi đổi UI. Các lỗi nguồn phát hiện trong báo cáo cần có regression và bằng chứng mới trước khi giữ lại tuyên bố PASS cho phần bị ảnh hưởng.

## 14 Mở rộng thanh toán phù hợp với lộ trình

Giữ payment architecture cho phép thêm nguồn tiền nhưng buyer luôn hiểu tổng tiền hàng/fee/recipient. Trên candidate Testnet, chỉ show route có capability thực: USDC Arc và các tuyến USDC bridge được cấu hình. Theo tài liệu hiện tại, App Kit Swap chủ yếu hỗ trợ mainnet, ngoại lệ Arc Testnet; không suy từ Bridge support rằng Swap cũng hỗ trợ các mạng Sepolia. [Ma trận capability chính thức](https://docs.arc.io/app-kit/references/supported-blockchains).

Mainnet 5042 và Testnet 5042002 có cấu hình/deployment khác nhau. Arc sử dụng cùng số dư USDC qua native view cho gas và ERC-20 view; UI giữ một số dư, không cộng đôi. [Thông số mạng và wallet integration chính thức](https://docs.arc.io/arc/references/connect-to-arc).

Khi mở token khác/mainnet, cần quote server bảo vệ credentials, route/token allowlist, min received/slippage/deadline, recovery bền vững và proof theo từng bước; audit custody/allowance/authority và acceptance riêng. Fiat/thẻ, gas sponsorship hoặc thanh toán tự động là khả năng tương lai phải kiểm provider và mô hình vận hành, không thêm lời hứa “thanh toán như thẻ” trước khi thực sự có.

## 15 Quyết định triển khai đề xuất

**Chấp nhận brief như định hướng thiết kế và thông tin. Điều chỉnh brief thành kế hoạch sản phẩm theo những quyết định sau:**

1. Giữ React/Vite, CSS custom đã chuẩn hóa và các payment safeguards; bổ sung router/data layer có mục đích.
2. Bảo toàn settlement/principal/immutable terms/pull claim của campaign hiện có; cho phép mở rộng offchain domain và API để sản phẩm đầy đủ.
3. Chốt cách hiển thị giá/cam kết/rebate theo order; phân biệt allocation với đã nhận tiền, proof delivery với entitlement dùng được.
4. Sửa sai lệch claim/projection và delivery race trước nghiệm thu; thiết kế Product/Plan/Rights/Draft/Entitlement/Transaction theo version.
5. Tách ba surfaces trong một ứng dụng modular; phân quyền operations theo capability, không gộp vendor với admin hoặc operator với Safe.
6. Làm bốn master screens để thiết lập thiết kế, sau đó nối ngay Order Detail và một luồng mua–giao–quyết toán hoàn chỉnh.
7. Mở rộng catalog, social sharing/follow, trust, fulfillment và operations theo ưu tiên trên; giữ cửa phát triển organization/renewal/payment sources khi có nhu cầu.
8. Chỉ gọi hoàn thành khi logic, responsive, accessibility, recovery, entitlement thật và live acceptance cùng đạt; số lượng màn hình hoặc build PASS không đủ.

GroupDeal nên phát triển thành marketplace mua chung sản phẩm số có thể tin cậy và vận hành được. Repository hiện có nền tảng tài chính để tiến tới mục tiêu đó, nhưng còn cần một lớp sản phẩm và vận hành đầy đủ; phần việc quan trọng là làm cho lời hứa trên màn hình khớp quyền, dữ liệu và hành động thực tế của người dùng.

## 16 Các nguồn mã chính để kiểm tra lại

- [Framework và dependencies](../frontend/package.json), [routes hiện tại](../frontend/src/App.tsx), [design tokens và responsive](../frontend/src/index.css).
- [Buyer Deal Detail và checkout](../frontend/src/pages/CampaignDetailPage.tsx), [payment safeguards](../frontend/src/services/checkout.ts), [wallet actions](../frontend/src/context/Web3Context.tsx).
- [Buyer orders và claim UI](../frontend/src/pages/BuyerDashboard.tsx), [seller form và giao hàng](../frontend/src/pages/SellerDashboard.tsx), [operations hiện tại](../frontend/src/pages/OperatorPortal.tsx).
- [Điều khoản và claim trong contract](../contracts/contracts/GroupDealHub.sol), [event projection](../backend/src/services/indexerService.ts), [schema và persistence](../backend/src/db/store.ts).
- [Delivery service](../backend/src/services/deliveryService.ts), [draft và publish API](../backend/src/routes/campaignRoutes.ts), [buy authorization](../backend/src/services/authorizationService.ts), [public widget data](../backend/src/routes/publicRoutes.ts).
- [Cấu hình browser test](../frontend/playwright.config.ts), [G4 tests hiện tại](../backend/test/gate_g4_verification.test.ts), [kế hoạch hoàn tất đang áp dụng](./KE_HOACH_HOAN_TAT_DU_AN.md).
