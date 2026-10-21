# Việc anh cần làm để khép nghiệm thu GroupDeal

Cập nhật 21/10/2026, Asia/Saigon. Phạm vi là bản Arc Testnet theo PLAN. Các quyết định hoãn trước đây đã được mở lại. Agent đã triển khai phần nguồn có thể tự làm, kiểm build/guard/dữ liệu và chuẩn bị vận hành; dự án chưa được ghi G5/G6 đạt khi các bằng chứng người dùng/provider dưới đây còn thiếu.

Trạng thái mới21/10/2026: https://groupdeal.tech. Seller24F đã có username sellerlocal và đã liên kết GitHub tanka420, Discord tankaa420. Agent đã đối chiếu native, callback COMMITTED, ownership/audit, API public identity và UI Chrome. Không cần đăng nhập hoặc consent lại cho hai liên kết này. X vẫn tạm hoãn theo user và đã tắt cấu hình hoạt động. OneDrive upload/tải ngược đúng hash, lịch và giám sát đã bật. Runtime/ledger/95held giữ nguyên; Circle liveOTP/principal và các nhóm H3–H6 khác vẫn còn phạm vi.


Gói hiện hành: reports/evidence/social-links-live/2026-10-21T03-16-06-605Z/CHECKS.json. CURRENT_G5_PREPARATION_LATEST ở root reports/evidence là nguồn authoritative; CURRENT_SOCIAL_CONFIG_PREIMAGE_LATEST trước vẫn hợp lệ vì env không đổi.

## Những phần đã làm

| Phần | Kết quả có bằng chứng |
|---|---|
| Username | Seller cần username trước publication mới; buyer chọn tùy ý tại Tài khoản. Tên chọn một lần, duy nhất toàn hệ thống. Đơn và intent cũ vẫn phục hồi được. |
| Social | Có OAuth PKCE X/GitHub/Discord, kiểm đúng phiên/provider/origin, stable ID duy nhất, ngắt/chuyển phải xác thực lại; link công khai không phải dấu uy tín. GitHub/Discord đã liên kết thật và đối chiếu callback/ownership/audit/API/UI; X tạm hoãn theo user do chi phí. |
| UI | Tái dùng giao diện hiện hành; định danh dạng danh sách; đã kiểm fixture desktop/390px, buyer tùy chọn, VI/EN và Tab. Đã sửa thông báo lưu/lỗi đổi đúng locale. Chưa gọi đây là consent OAuth hoặc toàn bộ a11y live đã đạt. |
| Kiểm nguồn | 60 kiểm định danh, 35 case backup/probe/alert, 10 case nâng runtime và các regression auth/profile/product/wallet/SQLite phù hợp đã đạt. Không chạy lại full CI không cần thiết. |
| Runtime | Nâng qua snapshot/admission và đối soát cùng block HEALTHY, giữ ledger52flows/72reservations, 95held và các đơn cũ. Backup mới đã phục hồi riêng thành công. |
| OneDrive | Đã cài rclone, uploader chỉ thêm ciphertext/manifest và tải ngược so SHA-256, unit lịch và hỗ trợ cảnh báo. Microsoft đã consent; upload/tải ngược archive+manifest đúng hash, lịch offhost enabled và giám sát active. Giữ3backup managed cục bộ. |
| SDK | Gói SDK thật đã được cài offline vào consumer riêng trên Windows, gọi API live chỉ đọc và kiểm guard401. Chưa thay bằng chứng receiver/provider giao hàng thật. |
| Circle | Hai route EURC→USDC/cirBTC→USDC đã trả quote hợp lệ cho lượng minh họa. Quote này ngắn hạn, đã hết hạn; chưa có OTP, intent GroupDeal hoặc giao dịch mới. |
| Safe | 14 readback authority tại finalized block đạt. Khai báo T/A/N giữ và khôi phục riêng được giữ nguyên. Chữ ký18Oct chỉ là lịch sử; chưa fresh control cho candidate cuối. |

Đơn FILE_LINK #6 đã hoàn tất mua/giao2quyền/tải ZIP/confirm/buyer rút0,4USDC/seller rút1,6USDC, escrow0. Không làm lại đơn này hoặc đơn1–5. Một hành trình đã xong không thay các nhánh khác của ma trận nghiệm thu.

## Chuẩn bị chung — làm một lần

1. Mở đúng tab GroupDeal trên Chrome/OKX và kết nối tab đó với công cụ trình duyệt Codex nếu dùng. Báo URL và ví đang hiện trên trang. Phiên IAB và Chrome khác nhau; agent không được bắt anh đăng nhập lặp chỉ vì đang nhìn nhầm tab hoặc thiếu kết nối điều khiển.
2. Sau đợt nâng runtime, đăng nhập lại một lần khi agent đã chọn đúng tab/realm. Nếu có yêu cầu ví chưa rõ kết quả, giữ nguyên và gửi hash/trạng thái trước; không ký lại.
3. Không gửi OTP, seed, private key, OAuth secret/token hoặc khóa giải mã vào chat. Anh nhập trực tiếp ở ví/provider/private file tương ứng.

| Vai | Ví dùng trong hồ sơ hiện hành |
|---|---|
| Seller | 0x24F0c19a6E77cc687181500455BeE3550E617580 |
| Buyer external | 0x580cdb6a6354313f73ff16b160b15dcc914d21ae |
| Operator, realm quản trị riêng | 0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead |
| Safe owner T | 0x73307bdd39d875f98857ffce0fed1cdc62f50b6d |
| Safe owner A | 0x7366adbf19e511095e7737138498f625d737db22 |
| Safe owner N | 0xc289b853d90f2c604fd38458b1ce4b991156d18b |

## H1 — GitHub/Discord; X tạm hoãn theo yêu cầu người dùng

1. Seller0x24F0…7580 đã có username sellerlocal và hai liên kết: GitHub tanka420, Discord tankaa420. Không cần chọn tên, đăng nhập hoặc liên kết lại. [Hồ sơ seller](https://groupdeal.tech/seller/profile) đang hiển thị kết quả đã xác thực.
2. GitHub và Discord đã có biến private trên VPS và ứng dụng đã nạp. Không cần nhập lại nếu không có lỗi cụ thể. X tạm hoãn vì chi phí theo user; đã tắt cấu hình hoạt động, không yêu cầu nạp credit hoặc consent X. Callback GitHub/Discord chính xác: https://groupdeal.tech/seller/profile. Bảng sau giữ tham chiếu kỹ thuật cho từng provider.

| App | Cấu hình | Hai biến private backend |
|---|---|---|
| [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) | Homepage https://groupdeal.tech; scope read:user | GROUPDEAL_SOCIAL_GITHUB_CLIENT_ID / GROUPDEAL_SOCIAL_GITHUB_CLIENT_SECRET |
| [X OAuth2](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) | Tạm hoãn theo user; cấu hình hoạt động đã tắt | GROUPDEAL_SOCIAL_X_CLIENT_ID / GROUPDEAL_SOCIAL_X_CLIENT_SECRET |
| [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2) | OAuth2 application; identify | GROUPDEAL_SOCIAL_DISCORD_CLIENT_ID / GROUPDEAL_SOCIAL_DISCORD_CLIENT_SECRET |

3. Agent đã kiểm fingerprint và nạp4biến GROUPDEAL_SOCIAL_{GITHUB|DISCORD}_CLIENT_ID/_CLIENT_SECRET. Private backend.env vẫn ownerubuntu/mode600; không đưa vào VITE_ hoặc chat. Nếu cần đổi credential sau này, báo agent ghim preimage mới trước rồi chỉ sửa4biến này. X giữ trống đến khi user mở lại; không tự restart ngoài guard.
4. Hai consent GitHub/Discord đã hoàn tất và được agent xác minh. Các case hủy consent, ngắt-rồi-xác-thực-lại và cùng social ID ở account UAT khác vẫn cần gói UAT riêng theo ma trận; chưa coi fixture là đã kiểm live các case đó. Agent sẽ chuẩn bị target/account và trạng thái mong đợi trước; không tự ngắt hai liên kết chính đang hoạt động.

H1 không còn chờ câu trả lời “đã liên kết trong GroupDeal”; agent đã xác minh. Chỉ cần thao tác chính chủ khi có gói UAT riêng được chuẩn bị, không gửi secret/code/token.

## H2 — Kết nối OneDrive

**H2 đã hoàn tất phần kết nối/upload/lịch/giám sát**: lần đầu đã upload và tải ngược archive18.657.196bytes cùng manifest861bytes, kích thước/SHA-256 trùng. Timer chạy phút10 mỗi giờ; probe kiểm receipt thiếu/sai/quá150phút. Không cần consent lại. Các bước cấu hình bên dưới chỉ dùng khi cần cấu hình lại; không còn yêu cầu diễn tập phục hồi hoặc người nhập khóa.

Quyết định trực tiếp của người dùng21/10/2026: bỏ diễn tập phục hồi backup và đo RPO/RTO khỏi điều kiện nghiệm thu. Không còn yêu cầu chọn máy/thư mục phục hồi hoặc người nhập khóa. Đây là yêu cầu được miễn theo user, không phải bằng chứng đã phục hồi thành công. Giữ backup mã hóa, kiểm private-restore tự động hiện có, OneDrive consent/upload/tải ngược so hash, lịch và giám sát; không thay đổi các nghĩa vụ transaction recovery/reconciliation, G5/G6 khác.

1. Nếu shell cấu hình hiện tại đã được mở bằng SSH có forward53682, giữ nguyên. Nếu chưa có tunnel, mở một PowerShell khác trên Windows và chạy:

~~~powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:53682:127.0.0.1:53682 tan-picks
~~~

Giữ cửa sổ này mở. Nếu báo cổng đã dùng, không chạy thêm tunnel chồng; báo lỗi đã bỏ thông tin riêng để agent kiểm. Không cần cài rclone trên Windows.

2. Shell VPS hiện tại tiếp tục phiên rclone đang mở. Nếu chưa mở cấu hình thì dùng:

~~~sh
sudo -u ubuntu /usr/bin/rclone config --config /home/ubuntu/groupdeal/operations/offhost/rclone.conf
~~~

Remote tên gd_onedrive, storage onedrive, client_id/client_secret để trống; region1/global. Đoạn log người dùng gửi ngày21Oct đã chọn Advanced config=y và access_scopes=3: hợp lệ cho đọc/ghi OneDrive không duyệt SharePoint; không cần làm lại. Các trường khác đang để mặc định phù hợp. Tại encoding> nhấn Enter, các advanced prompt còn lại giữ mặc định. Lần tạo mới đơn giản có thể chọn Advanced config=n.

3. Khi hiện Use auto config? hoặc Use web browser to automatically authenticate rclone with remote?, chọn y vì đã có tunnel. VPS có thể báo không tự mở được trình duyệt nhưng vẫn hiện URL http://127.0.0.1:53682/auth?... và Waiting for code. Sao chép nguyên URL rclone vừa in sang Chrome trên Windows; không dùng URL tự đoán hoặc URL cũ. Tự đăng nhập đúng Microsoft account, đọc quyền và consent. Không gửi URL chứa state/code, token hoặc config vào chat. Chỉ mở http://127.0.0.1:53682 trống không thay được URL xác thực đầy đủ.

4. Sau khi Microsoft báo thành công, quay lại shell VPS. Chọn mục có nhãn OneDrive Personal or Business/onedrive (thường số1). Trong danh sách drive, chọn đúng drive cá nhân/doanh nghiệp của mình theo tên/URL; không đoán số vì có thể là0 hoặc1. Xác nhận Drive OK?/Is that okay?=y. Ở Keep this gd_onedrive remote?/y/e/d>, chọn y; về menu chính chọn q. Bảng xác nhận có thể chứa token: không chụp hoặc dán bảng đó.

5. Chỉ cần báo “Đã cấu hình gd_onedrive”. Agent kiểm quyền file/drive binding, chạy upload đầu, tải ngược archive+manifest so SHA-256/kích thước. Khi đạt mới bật lịch phút10 mỗi giờ và giám sát. File rclone.conf tồn tại chưa đủ chứng minh OAuth/drive đã cấu hình xong; hiện đã có receipt upload/round-trip đạt và lịch đã bật.

6. Truy cập [OneDrive trên web](https://onedrive.live.com/) bằng cùng tài khoản vừa consent, vào Tệp của tôi → GroupDeal → ArcTestnet → 5d27a82a-100e-41cb-b6a0-d8326e1538f1. Đường dẫn rclone: gd_onedrive:GroupDeal/ArcTestnet/5d27a82a-100e-41cb-b6a0-d8326e1538f1/. Thư mục backup được tạo trong lần upload thành công đầu tiên; trước đó có thể chưa thấy. Đây là thư mục riêng của tài khoản, không cần tạo link công khai.

H2 hiện không còn thao tác chính chủ đang chờ. Chỉ báo mã lỗi đã bỏ bí mật nếu OneDrive bị thu hồi quyền hoặc hết dung lượng; không gửi config/token/khóa.

## H3 — Operator, quyền tài khoản, sản phẩm và hộp thư

**Phần admin và bốn thay đổi quyền UAT đã được kiểm thật ngày21Oct.** Không cần tạo lại tài khoản, đăng nhập lại hoặc cấp website lần nữa.

1. Phiên operator e48B đã được đối chiếu với Hub; trang Phân quyền trả capability hợp lệ qua phiên ADMIN thật. Chrome profile4 đang giữ tab admin và UAT, tách kho phiên APP/ADMIN.
2. Account UAT usr_wallet_f92c8fc9-cb18-486c-b222-bebc9288b907, ví0x7477f3fd762e4DB846D5b17C656395B09Fb0f27c đã chạy cấp seller → thu hồi seller → hạn chế hoạt động mới → gỡ hạn chế. Agent đối chiếu4receipt/4audit/revision1–4. Hiện tài khoản không bị hạn chế và chưa có quyền seller cho hoạt động mới; vai trò seller trong hồ sơ giữ lịch sử. UAT vẫn đọc được dữ liệu khi bị hạn chế; chưa có intent mua/phát hành mới để chứng minh mọi guard live. Không dùng đơn thật hoặc replay đơn cũ để bổ sung proof.
3. **Rights/badge là phần H3 tiếp theo.** Đã chuẩn bị sản phẩmCSVStudio1.0FILE_LINK UAT mới riêng trong NEXT_PRODUCT_INPUT.json/NEXT_RIGHTS_PLAN.json của gói reports/evidence/contact-uat/2026-10-21T04-01-07-252Z. Giữ hai hồ sơ đangAPPROVED và đơn1–6. Đã chuyển APP từUAT sang seller0x24F0…7580; admin e48B vẫn hoạt động sau reload. Không cần đăng nhập lại. Agent điền hồ sơ, kiểm đúng ProductVersion/LicenseVersion và trình phạm vi cho chủ dự án xác nhận; anh tự ký quyết định nếu UI yêu cầu. Không tự gán badge hoặc dùng quyềnUAT đã thu hồi để phát hành.
4. **Contact và thư nghiệp vụ đã kiểm thật.** UAT tự OTP thành công, contactrevision1, notification email bật. TicketACCOUNT mới tkt_08656442-bae1-48f0-8530-eb6199561304 có phản hồi operator/revision2; outbox mớiSENT và anh xác nhận đã nhận trong inbox. Agent đối chiếu native metadata và UAT mở đúng ticket từ thông báo trong app. Không cần nhập email hoặc nhận OTP lại. Giữ ticketOPEN để tra cứu; chưa coi một ticket này là mọi lifecycle/ACL/attachment case đã đạt.

Bước cần người giữ ví tiếp theo: xem hồ sơ UAT quyền phân phối mới do agent chuẩn bị và tự ký quyết định khi UI yêu cầu. Seller24F và admin e48B đã đăng nhập đúng. Các bước ví/consent chỉ do anh thực hiện; không gửi OTP/seed/private key. Agent xử lý việc chuẩn bị form, kiểm nonce/binding, receipt/audit và cập nhật bàn giao.

## H4 — Circle và các nhánh giao dịch thật còn thiếu

1. Chọn tài khoản Circle/email thật đang sử dụng và tự OTP trong GroupDeal ở [Ví](https://groupdeal.tech/wallet). Agent phải xác minh Circle user/wallet/principal đúng; đăng nhập OKX không chứng minh embedded Circle đã đạt.
2. Chốt lượng muốn dùng và ngân sách/phí tối đa cho gói UAT mới trước khi tạo intent/giao dịch. Agent lấy quote mới, đọc chain/balance/allowance/nonce/pending/gas và trình bày giá/phí trước; quote minh họa đã lưu không được dùng để ký. Anh tự kiểm màn ví, chấp nhận điều khoản và tự ký. RPC estimate không phải trần phí của OKX.
3. Agent lập một gói tối thiểu cho những nhánh thật sự thiếu: early on/cap/rebuy/sold-out, quyền ví, partial/dispute/fallback/recovery hoặc Circle/bridge cần actor thật theo ma trận. Tái sử dụng receipt đúng phạm vi; không tạo giao dịch mới cho nhánh đã có proof phù hợp, không làm lại order1–6. Rủi ro/budget/call của từng giao dịch mới phải rõ trước khi anh ký.
4. Khi kiểm reload/tab/phiên/thiết bị khác, giữ cùng operation/intent/hash. Chỉ chuyển bước khi agent đọc chain và native khớp; nếu đã gửi, báo hash/trạng thái, không ký lại hoặc mua/rút lại. Báo thiết bị/trình duyệt thực sự đã dùng; không coi hai tab là cross-device.

Anh cần gửi lại: tài khoản/loại ví, lượng và ngân sách được chọn, trạng thái OTP, hash/trạng thái sau từng yêu cầu. Không gửi OTP/seed/private key. Agent chịu trách nhiệm điều phối, kiểm proof và sửa lỗi phát hiện.

## H5 — Receiver/provider độc lập cho SDK, webhook và giao quyền

1. Cung cấp host/endpoint HTTPS và aliasSSH do anh kiểm soát, độc lập với VPS GroupDeal, hoặc quyền triển khai tương ứng. Node receiver mẫu cần Node>=22.13 và SQLite inbox bền vững. Không đưa private key/token vào chat.
2. Chọn sản phẩm/provider giao quyền thật anh được phép vận hành, cùng cách nhập credential riêng tại host. Agent đã có gói SDK cài được và receiver mẫu; sẽ triển khai từ package đã ghim, không yêu cầu anh tự viết tích hợp.
3. Agent tạo subscription mới qua [Tích hợp seller](https://groupdeal.tech/seller/integrations), lưu secret riêng, kiểm raw-body HMAC/dedup, delivery/receipt thật và outage/retry/DLQ có kiểm soát trên đúng các job mới. HTTP202/inbox insert chưa tự chứng minh buyer dùng được entitlement; phải có business effect/provider proof tương ứng. Giữ95heldjobs cũ.
4. Anh tự login/ký giao hàng nếu sản phẩm cần receipt onchain, và tự kiểm entitlement đã dùng được. Agent lưu metadata/hash/ack đã bỏ bí mật, không lưu secret sản phẩm vào bằng chứng.

Anh cần gửi lại: host/HTTPS/quyền triển khai và provider/sản phẩm được chọn; credential nhập qua kênh riêng khi agent chuẩn bị xong.

## H6 — Safe và review cuối

1. T/A/N đã xác nhận mỗi người chỉ khôi phục ví của mình; không hỏi lại câu cũ “1 người”. Agent ghim candidate cuối sau các bước trên, recheck authority/nonce/modules/expiry rồi mới chuẩn bị challenge mới. Chữ ký và tệp OWNER18Oct đã hết hạn, không dùng như proof mới.
2. Với gói control-only mới, T(73307bdd…50b6d) và một trong A(7366adbf…7db22)/N(c289b853…6d18b) tự ký đúng message của mình. Không phải đăng nhập GroupDeal bằng hai ví. Trang [Safe owner control](https://groupdeal.tech/safe-owner-control/index.html) hiện tồn tại, nhưng phải chờ agent cấp/kiểm context mới trước khi dùng; không ký challenge cũ. Gửi JSON owner/signature của message mới, không seed/private key. Control-message không phải giao dịch hay Safe execution.
3. Nếu ma trận còn thiếu emergency/partial-allocation live, agent chuẩn bị gói Safe riêng cho campaign UAT mới, nêu nonce/calldata/budget và kết quả mong đợi. Đúng owner tự ký và tự gửi theo gói; không đổi owner/quorum hoặc cancel campaign đã hoàn tất để tạo proof.
4. Sắp người rà soát độc lập đúng source/manifest/evidence cuối. Agent chuẩn bị packet/review chỉ đọc; người có trách nhiệm nghiệm thu ký nhận G6 khi issue bắt buộc đã đóng. Không dùng chữ ký control hay nhãnT/A/N thay cho review G6.

## Điều kiện ghi “hoàn thành dự án”

Quyết định trực tiếp của người dùng21/10/2026: bỏ diễn tập phục hồi backup và đo RPO/RTO khỏi điều kiện nghiệm thu. Không còn yêu cầu chọn máy/thư mục phục hồi hoặc người nhập khóa. Đây là yêu cầu được miễn theo user, không phải bằng chứng đã phục hồi thành công. Giữ backup mã hóa, kiểm private-restore tự động hiện có, OneDrive consent/upload/tải ngược so hash, lịch và giám sát; không thay đổi các nghĩa vụ transaction recovery/reconciliation, G5/G6 khác.

- Đủ proof đúng tầng cho các nhánh trọng yếu của14luồng tại mục9 kế hoạch. Local/fixture được dùng cho negative phù hợp; nhánh cần actor/provider/live phải có bằng chứng tương ứng.
- Fresh readiness/reconcile/backup/offhost/roles và CI phù hợp trên cùng candidate, rồi review độc lập G6. Không hạ tiêu chí để ghi PASS.
- CURRENT, manifest/source/runtime, runbook và danh sách issue phản ánh kết quả thật. Hiện NOT_FROZEN/G5OPEN/G6OPEN, acceptanceEligible=false.

Anh có thể bắt đầu bằng H2 hoặc H1. Các bước hậu kiểm, triển khai, đọc chain, lập hồ sơ và sửa lỗi là phần agent thực hiện khi có quyền truy cập/consent/chữ ký cần thiết; không chuyển các việc đó thành bài tập cho anh.

## Kiểm UI cuối trong H1 — khoảng một phút

Trên Chrome thật, mở Tài khoản hoặc Hồ sơ seller rồi đặt Zoom200% trong menu Chrome. Dùng Tab đến ô username/nút thao tác, đổi VI/EN trong menu tài khoản và kiểm chữ/nút vẫn đọc và dùng được, không mất nội dung hoặc tràn ngang. Báo màn nào bị lỗi nếu có; sau đó trả Zoom100%. Agent đã kiểm fixture390px/VI/EN/Tab, nhưng chưa xác nhận physicalbrowserzoom200% trên phiên của anh. Không cần mua, ký giao dịch hoặc làm lại ma trận R5–R7 để kiểm mục nhỏ này.
