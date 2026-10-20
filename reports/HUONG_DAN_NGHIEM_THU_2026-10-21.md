# Việc anh cần làm để khép nghiệm thu GroupDeal

Cập nhật 21/10/2026, Asia/Saigon. Phạm vi là bản Arc Testnet theo PLAN. Các quyết định hoãn trước đây đã được mở lại. Agent đã triển khai phần nguồn có thể tự làm, kiểm build/guard/dữ liệu và chuẩn bị vận hành; dự án chưa được ghi G5/G6 đạt khi các bằng chứng người dùng/provider dưới đây còn thiếu.

## Những phần đã làm

| Phần | Kết quả có bằng chứng |
|---|---|
| Username | Seller cần username trước publication mới; buyer chọn tùy ý tại Tài khoản. Tên chọn một lần, duy nhất toàn hệ thống. Đơn và intent cũ vẫn phục hồi được. |
| Social | Có OAuth PKCE X/GitHub/Discord, kiểm đúng phiên/provider/origin, stable ID duy nhất, ngắt/chuyển phải xác thực lại; link công khai không phải dấu uy tín. Ba OAuth app live còn cần tài khoản chính chủ. |
| UI | Tái dùng giao diện hiện hành; định danh dạng danh sách; đã kiểm fixture desktop/390px, buyer tùy chọn, VI/EN và Tab. Đã sửa thông báo lưu/lỗi đổi đúng locale. Chưa gọi đây là consent OAuth hoặc toàn bộ a11y live đã đạt. |
| Kiểm nguồn | 60 kiểm định danh, 35 case backup/probe/alert, 10 case nâng runtime và các regression auth/profile/product/wallet/SQLite phù hợp đã đạt. Không chạy lại full CI không cần thiết. |
| Runtime | Nâng qua snapshot/admission và đối soát cùng block HEALTHY, giữ ledger52flows/72reservations, 95held và các đơn cũ. Backup mới đã phục hồi riêng thành công. |
| OneDrive | Đã cài rclone, uploader chỉ thêm ciphertext/manifest và tải ngược so SHA-256, unit lịch và hỗ trợ cảnh báo. Chưa có OAuth Microsoft nên chưa upload và lịch offhost giữ disabled. Giữ3backup managed cục bộ. |
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

## H1 — Username và tài khoản X/GitHub/Discord

1. Dùng seller mở [Hồ sơ seller](https://groupdeal.thanhtan.top/seller/profile), chọn username muốn dùng lâu dài rồi lưu. Username 3–30 ký tự thường/số/dấu _, bắt đầu bằng chữ, chọn một lần. Buyer có thể chọn tại [Tài khoản](https://groupdeal.thanhtan.top/account); không bắt buộc để mua.
2. Trong tài khoản developer chính chủ, tạo ba OAuth app theo bảng dưới. Từng seller không phải liên kết đủ3dịch vụ; nhưng để kiểm nền tảng hỗ trợ cả3, cần cấu hình app và consent của cả3provider. Callback chính xác cho cả3: https://groupdeal.thanhtan.top/seller/profile. Không dùng wildcard.

| App | Cấu hình | Hai biến private backend |
|---|---|---|
| [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) | Homepage https://groupdeal.thanhtan.top; scope read:user | GROUPDEAL_SOCIAL_GITHUB_CLIENT_ID / GROUPDEAL_SOCIAL_GITHUB_CLIENT_SECRET |
| [X OAuth2](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) | Web/confidential client; users.read tweet.read | GROUPDEAL_SOCIAL_X_CLIENT_ID / GROUPDEAL_SOCIAL_X_CLIENT_SECRET |
| [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2) | OAuth2 application; identify | GROUPDEAL_SOCIAL_DISCORD_CLIENT_ID / GROUPDEAL_SOCIAL_DISCORD_CLIENT_SECRET |

3. Nhập giá trị thật qua SSH/private editor vào backend/.env của runtime: /home/ubuntu/groupdeal/releases/47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a/backend/.env, giữ ownerubuntu/mode600 và các dòng khác. Không thêm VITE_, không gửi nội dung vào chat. Agent phải ghim preimage/cấu hình trước, kiểm diff riêng6biến rồi restart theo quy trình; anh chỉ cần báo đã nhập xong. Không chạy app local bằng file này.
4. Khi agent xác nhận cấu hình đã hoạt động, tự bấm xác thực từng provider, đăng nhập/đồng ý quyền tại provider và quay lại đúng tab. Agent kiểm link/ID/thời điểm và hồ sơ công khai. Kiểm một lần hủy consent, ngắt rồi xác thực lại; dùng tài khoản UAT riêng để chứng minh không thể gắn cùng social ID sang account khác khi chưa ngắt. Seller chỉ có UNLISTED chưa xuất hiện ở hồ sơ public theo policy hiện hành; agent dùng campaign UAT PUBLIC riêng để kiểm, không đổi campaign5 đã xong.

Anh cần gửi lại: username đã chọn, provider nào đã cấu hình/cấp quyền, kết quả UI hoặc mã lỗi đã bỏ bí mật. Không gửi secret/code/token.

## H2 — Cấp quyền OneDrive và chọn nơi phục hồi

1. Trên Windows mở PowerShell, chạy:

~~~powershell
ssh -L 53682:127.0.0.1:53682 tan-picks
~~~

2. Trong shell VPS vừa mở, chạy:

~~~sh
sudo -u ubuntu /usr/bin/rclone config --config /home/ubuntu/groupdeal/operations/offhost/rclone.conf
~~~

3. Chọn tạo remote mới tên gd_onedrive, storage Microsoft OneDrive/onedrive. Để trống clientID/secret để dùng ứng dụng rclone; không advanced. Chọn đúng cloud/tài khoản. Với SSH tunnel đang mở, chọn Yes cho auto config/dùng trình duyệt. Mở URL loopback cổng53682 mà rclone hiện trên máy Windows, tự đăng nhập Microsoft, đọc quyền và consent. Chọn đúng drive, xác nhận lưu và thoát. Không gửi URL/code/token/config vào chat.
4. Báo “Đã cấu hình gd_onedrive”. Agent tự kiểm quyền file/drive binding, chạy lần đầu, so hash tải ngược, bật lịch phút10 mỗi giờ và bật giám sát offhost sau khi đạt. Hiện chưa bật dọn remote; cần theo dõi dung lượng. Local giữ3bản managed, không xóa archive ngoài policy.
5. Chọn nơi diễn tập phục hồi ngoài VPS và cách người giữ khóa nhập khóa giải mã qua kênh riêng. Có thể chọn máy Windows hiện tại/thư mục cô lập nếu anh đồng ý, hoặc một máy/VM riêng. Không cần gửi khóa vào chat và không sao chép .env/signer key/provider token sang nơi thử. Agent chuẩn bị restore có auth barrier, tắt mọi outbound worker và không promote writer; đo RPO/RTO theo mốc incident/điểm dữ liệu/ready đã công bố. Upload/hash hoặc drill cùng VPS chưa thay phép đo này.

Anh cần gửi lại: “Đã cấu hình gd_onedrive”, máy/thư mục phục hồi được chọn và người giữ khóa sẵn sàng nhập qua kênh riêng. Nếu dùng host khác, cung cấp aliasSSH/quyền truy cập đã cấu hình, không gửi private key.

## H3 — Operator, quyền tài khoản, sản phẩm và hộp thư

1. Dùng ví operator đăng nhập [Quản trị](https://groupdeal.thanhtan.top/admin) đúng realm quản trị và tự ký login. Agent đọc capability trước khi chuẩn bị thay đổi. Quyền admin live đã được anh mở lại; không cần xin lại ngoại lệ FILE_LINK.
2. Dành một tài khoản UAT do anh kiểm soát cho [Người dùng](https://groupdeal.thanhtan.top/admin/users). Agent chuẩn bị grant/revoke seller và restrict/restore trên tài khoản này, đọc rõ target/action/reason; anh tự ký step-up khi UI yêu cầu. Không dùng account thật khác hoặc dữ liệu đơn đã xong để thử hạn chế quyền.
3. Agent chuẩn bị đúng sản phẩm/rights/campaign UAT mới cần thiết; anh xác nhận quyền phân phối thật, tự upload tài nguyên/ảnh khi cần và tự ký quyết định tại [Xác minh](https://groupdeal.thanhtan.top/admin/verifications). Kiểm quyền mới bị chặn đúng chỗ, còn nghĩa vụ cũ vẫn xử lý được. Không duyệt mù hoặc tự gán badge.
4. Dùng email/hộp thư anh có thể tự mở để xác minh contact và nhận thông báo nghiệp vụ thật; bật preference trong Tài khoản, thực hiện ticket/reply của chính mình theo màn agent chuẩn bị, rồi xác nhận đã nhận. Không gửi OTP/mail token/nội dung riêng. SMTP test hoặc outbox SENT chưa đủ để khẳng định đã tới inbox nghiệp vụ.

Anh cần gửi lại: đã đăng nhập operator, accountUAT được chọn, inbox nào anh tự kiểm được (chỉ cung cấp khi cần gửi đúng người) và kết quả nhận thư/step-up. Agent xử lý UI, kiểm ACL/audit/outbox và receipt; anh không phải tự gọi API.

## H4 — Circle và các nhánh giao dịch thật còn thiếu

1. Chọn tài khoản Circle/email thật đang sử dụng và tự OTP trong GroupDeal ở [Ví](https://groupdeal.thanhtan.top/wallet). Agent phải xác minh Circle user/wallet/principal đúng; đăng nhập OKX không chứng minh embedded Circle đã đạt.
2. Chốt lượng muốn dùng và ngân sách/phí tối đa cho gói UAT mới trước khi tạo intent/giao dịch. Agent lấy quote mới, đọc chain/balance/allowance/nonce/pending/gas và trình bày giá/phí trước; quote minh họa đã lưu không được dùng để ký. Anh tự kiểm màn ví, chấp nhận điều khoản và tự ký. RPC estimate không phải trần phí của OKX.
3. Agent lập một gói tối thiểu cho những nhánh thật sự thiếu: early on/cap/rebuy/sold-out, quyền ví, partial/dispute/fallback/recovery hoặc Circle/bridge cần actor thật theo ma trận. Tái sử dụng receipt đúng phạm vi; không tạo giao dịch mới cho nhánh đã có proof phù hợp, không làm lại order1–6. Rủi ro/budget/call của từng giao dịch mới phải rõ trước khi anh ký.
4. Khi kiểm reload/tab/phiên/thiết bị khác, giữ cùng operation/intent/hash. Chỉ chuyển bước khi agent đọc chain và native khớp; nếu đã gửi, báo hash/trạng thái, không ký lại hoặc mua/rút lại. Báo thiết bị/trình duyệt thực sự đã dùng; không coi hai tab là cross-device.

Anh cần gửi lại: tài khoản/loại ví, lượng và ngân sách được chọn, trạng thái OTP, hash/trạng thái sau từng yêu cầu. Không gửi OTP/seed/private key. Agent chịu trách nhiệm điều phối, kiểm proof và sửa lỗi phát hiện.

## H5 — Receiver/provider độc lập cho SDK, webhook và giao quyền

1. Cung cấp host/endpoint HTTPS và aliasSSH do anh kiểm soát, độc lập với VPS GroupDeal, hoặc quyền triển khai tương ứng. Node receiver mẫu cần Node>=22.13 và SQLite inbox bền vững. Không đưa private key/token vào chat.
2. Chọn sản phẩm/provider giao quyền thật anh được phép vận hành, cùng cách nhập credential riêng tại host. Agent đã có gói SDK cài được và receiver mẫu; sẽ triển khai từ package đã ghim, không yêu cầu anh tự viết tích hợp.
3. Agent tạo subscription mới qua [Tích hợp seller](https://groupdeal.thanhtan.top/seller/integrations), lưu secret riêng, kiểm raw-body HMAC/dedup, delivery/receipt thật và outage/retry/DLQ có kiểm soát trên đúng các job mới. HTTP202/inbox insert chưa tự chứng minh buyer dùng được entitlement; phải có business effect/provider proof tương ứng. Giữ95heldjobs cũ.
4. Anh tự login/ký giao hàng nếu sản phẩm cần receipt onchain, và tự kiểm entitlement đã dùng được. Agent lưu metadata/hash/ack đã bỏ bí mật, không lưu secret sản phẩm vào bằng chứng.

Anh cần gửi lại: host/HTTPS/quyền triển khai và provider/sản phẩm được chọn; credential nhập qua kênh riêng khi agent chuẩn bị xong.

## H6 — Safe và review cuối

1. T/A/N đã xác nhận mỗi người chỉ khôi phục ví của mình; không hỏi lại câu cũ “1 người”. Agent ghim candidate cuối sau các bước trên, recheck authority/nonce/modules/expiry rồi mới chuẩn bị challenge mới. Chữ ký và tệp OWNER18Oct đã hết hạn, không dùng như proof mới.
2. Với gói control-only mới, T(73307bdd…50b6d) và một trong A(7366adbf…7db22)/N(c289b853…6d18b) tự ký đúng message của mình. Không phải đăng nhập GroupDeal bằng hai ví. Trang [Safe owner control](https://groupdeal.thanhtan.top/safe-owner-control/index.html) hiện tồn tại, nhưng phải chờ agent cấp/kiểm context mới trước khi dùng; không ký challenge cũ. Gửi JSON owner/signature của message mới, không seed/private key. Control-message không phải giao dịch hay Safe execution.
3. Nếu ma trận còn thiếu emergency/partial-allocation live, agent chuẩn bị gói Safe riêng cho campaign UAT mới, nêu nonce/calldata/budget và kết quả mong đợi. Đúng owner tự ký và tự gửi theo gói; không đổi owner/quorum hoặc cancel campaign đã hoàn tất để tạo proof.
4. Sắp người rà soát độc lập đúng source/manifest/evidence cuối. Agent chuẩn bị packet/review chỉ đọc; người có trách nhiệm nghiệm thu ký nhận G6 khi issue bắt buộc đã đóng. Không dùng chữ ký control hay nhãnT/A/N thay cho review G6.

## Điều kiện ghi “hoàn thành dự án”

- Đủ proof đúng tầng cho các nhánh trọng yếu của14luồng tại mục9 kế hoạch. Local/fixture được dùng cho negative phù hợp; nhánh cần actor/provider/live phải có bằng chứng tương ứng.
- Fresh readiness/reconcile/backup/offhost/roles và CI phù hợp trên cùng candidate, rồi review độc lập G6. Không hạ tiêu chí để ghi PASS.
- CURRENT, manifest/source/runtime, runbook và danh sách issue phản ánh kết quả thật. Hiện NOT_FROZEN/G5OPEN/G6OPEN, acceptanceEligible=false.

Anh có thể bắt đầu bằng H2 hoặc H1. Các bước hậu kiểm, triển khai, đọc chain, lập hồ sơ và sửa lỗi là phần agent thực hiện khi có quyền truy cập/consent/chữ ký cần thiết; không chuyển các việc đó thành bài tập cho anh.

## Kiểm UI cuối trong H1 — khoảng một phút

Trên Chrome thật, mở Tài khoản hoặc Hồ sơ seller rồi đặt Zoom200% trong menu Chrome. Dùng Tab đến ô username/nút thao tác, đổi VI/EN trong menu tài khoản và kiểm chữ/nút vẫn đọc và dùng được, không mất nội dung hoặc tràn ngang. Báo màn nào bị lỗi nếu có; sau đó trả Zoom100%. Agent đã kiểm fixture390px/VI/EN/Tab, nhưng chưa xác nhận physicalbrowserzoom200% trên phiên của anh. Không cần mua, ký giao dịch hoặc làm lại ma trận R5–R7 để kiểm mục nhỏ này.
