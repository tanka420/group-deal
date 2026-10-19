## Hiện hành — 19/10/2026: Safe T/A/N giữ và khôi phục riêng từng ví

Thay trạng thái hiện hành trong ghi chú lịch sử bên dưới. User trả lời **“T, A, N”** theo thứ tự ví trong câu hỏi, rồi xác nhận **“Mỗi người chỉ khôi phục ví của mình”**. Mapping được ghi theo khai báo trực tiếp:

| Owner | Giữ seed/backup và tự khôi phục |
|---|---|
| 0x73307bdd39d875f98857ffce0fed1cdc62f50b6d | T |
| 0x7366adbf19e511095e7737138498f625d737db22 | A |
| 0xc289b853d90f2c604fd38458b1ce4b991156d18b | N |

Không có quyền khôi phục chéo theo khai báo; không nhận/đọc seed, privatekey hoặc backup. Ba chữ ký verified ngày18/10 giữ nguyên context/timestamp; **challenge30fea22 đã hết hạn08:27:27 ngày19/10UTC+7, không dùng lại như control mới trênb989**. Không yêu cầu ký thêm/đổiowner/quorum/miễnđiềukiện. Khai báo đủ để chuyển sang rà soát độc lập, chưa gọi danh tính/custody vật lý đã được người độc lập kiểm. Các kết luận “1 người/NOT MET” lịch sử đã được sửa bởi khai báo ba người; không tái dùng làm kết luận hiện hành.

Readback **2026-10-19T05:23:35.823Z**, finalized **67960192**, hash0xae24e1e98cddfd3ee7b75e2777c88d663076a2bf08155587183ca674e42e6f3a: **14checks đạt**. Safe1.5.0 đúng3owners/quorum2-of3/nonce0/modulesrỗng; Hub roles/codehash/manifest/canonicalblock và noPendingSecurityAuthority khớp. Chỉ đọc, không execution/drill/giao dịch. Runtime383/public186/backendb989/frontend0c61/opsf021/helper9ccb/PID536813/NRestarts0 và BACKUP_CURRENT/privateRestore verified giữ. Native05:24:17UTC:19users/6campaigns/6orders/44ops/8grants/12inventory;ledger52/72/SHAee7087ef1992baf86b322aaf1259487d90fa0a17bf7c544c7ef5c16c3559ce17/5đơncũ/95held giữ. Không source implementation/deploy/restart/fullCI/backup mới.

**Tiếp:** không còn câu hỏi custody/chữ ký đang chờ ở bước này; tiếp tục vận hành và G5 độc lập. FILE_LINKorder6 đã rút đủ/escrow0/2ACTIVE; không mua/giao/confirm/claim lại. Circle/admin khác hoãn, username/socialPOSTV1, policy3backup/OneDrive làm sau/offhostRPO RTOOPEN; các branch live còn thiếu và independentreview/finalcandidatecontrol giữ phạm vi riêng. **NOT_FROZEN/G5OPEN/G6OPEN/acceptanceEligible=false/wholeProjectAccepted=false.**

CURRENT [CHECKS.json](E:/apps/group-deal/reports/evidence/safe-custody-mapping/2026-10-19T05-25-26-274Z/CHECKS.json), SHA256 **1770114f5660e8e793af68fcff63f8a3ad82e5a5b458080029461ba9a884eef3**, **291277 byte/14 artifacts/14branches**; parentG5 15artifacts/Safe8artifacts kiểm hash. [Báo cáo](E:/apps/group-deal/reports/evidence/safe-custody-mapping/2026-10-19T05-25-26-274Z/SAFE_CUSTODY_MAPPING.md). Observer .cache/safe-custody-readback.cjs /safe-custody-native.cjs /safe-custody-ops.cjs; clone đổi outputwx khi đọc tiếp; native dir .cache/application-recovery/drill-crvXHh/candidate. Source chỉ sửa checkout sạch .cache/ci/c-322e58ff, remote github; HEAD trước docs **9bd9e79028694bbdff7e8c4de079c131eba4408d**, HEAD sau có thể chỉ tiến bằng docs.

**Safe — khai báo mới nhất:** Ba chữ ký đã verified và user xác nhận do ba người khác nhau thực hiện. Câu “1 người” trước đó đã được sửa; kết luận chỉ dựa trên một người không còn hiện hành. Không yêu cầu ký lại.

**Safe hiện hành:** Ba chữ ký control đã verified; user xác nhận “1 người” có thể ký/khôi phục cả ba ví. Control đạt; custody độc lập NOT MET, không còn chờ chữ ký hoặc câu trả lời về số người giữ. Chưa có quyết định miễn yêu cầu hoặc đổi cấu hình Safe.

# Cách gửi hai chữ ký Safe — trang owner tự ký

Mở **https://groupdeal.thanhtan.top/safe-owner-control/index.html**. Không cần đăng nhập GroupDeal bằng hai ví; chữ ký đăng nhập là thông điệp khác và không dùng cho gói control này.

1. Người giữ owner73307bdd…50b6d mở link trên máy/ví của họ, chọn OKX/MetaMask (hoặc trình duyệt trong ví) rồi bấm **Kết nối ví đã chọn**. Kiểm địa chỉ được hiển thị.
2. Đọc toàn bộ thông điệp; bấm **Đã đọc · Ký thông điệp bằng ví**, rồi chính người giữ ví xác nhận trong cửa sổ ví. Trang chỉ gọi personal_sign, không giao dịch/approval hoặc phí gas.
3. Bấm **Sao chép kết quả**, dán JSON vào chat này. Một owner khác làm tương tự bằng ví của họ. Mỗi kết quả có owner và signature; trợ lý sẽ ghép/kiểm quorum theo cùng digest.
4. Kèm xác nhận ai giữ mỗi ví, người đó ký được những owner nào, ai khác có thể dùng/khôi phục khóa. Không gửi seed/private key. Hai chữ ký riêng chưa tự chứng minh hai người hoặc custody độc lập.

Thông điệp gốc không đổi: digest 0x21207e4bbe6a41efad99f8b398254370c8784abdd7dd78d5a599436cbc64f7d4; backend context30fea22; hạn **08:27:27 ngày19/10/2026 UTC+7**. Trang chặn khi hết hạn, owner không thuộc gói, account đổi, authority thay đổi, RPC chưa xác minh, hủy ký hoặc chữ ký không khớp. Không nhập message tùy ý, không eth_sign/typed data, không lưu browser storage hoặc POST chữ ký; kết quả chỉ ở RAM/tab và clipboard sau khi người dùng bấm. Trang không thu chữ ký thay người dùng.

Source cf2983885897f4fd089523cd85c215f27ccc189a, đã push. Page bundle4files byte-identical với gói đã kiểm. 9ca ban đầu +2ca post-sign/copy mới đạt; không rerun9ca đã đạt. Chữ ký từ key fixture sinh trong RAM đã qua verifier quorum hiện hành, acceptance/custody/transaction đều false. Test gồm message byte-exact của cả3owner, signer sai, owner khác, đổi account, hủy, expiry, single-flight, nonce trước/sau prompt, copy và mobile375/text200. Đây là fixture Chrome/VI, không mọi engine/manual accessibility hoặc ví thật.

Bốn asset HTTPS đúng SHA256, browser public không console error; live browser dùng provider giả trả cancel4001 để kiểm11publicRPC chỉ đọc/CSP/CORS và authority trước prompt. Không mở khóa ví thật hoặc thu chữ ký thật trong gói. URL thư mục /safe-owner-control/ trả404 theo Nginx hiện hành, nên dùng index.html rõ ở trên; Nginx không sửa. Các lỗi tool/binary/network/URL normalization ban đầu được lưu riêng, không gán thành PASS.

Triển khai chỉ4static files;181asset frontend chính và377runtime hash khớp trước-sau. Tổng public185=181main+4ops. PID97197/NRestarts0, backend30fea22/frontend8dc5cf1/SDK5458925/ops73b6fae giữ; không restart hoặc đổi DB. Backup/privateRestore/BACKUP_CURRENT/timers đọc lúc 2026-10-18T03:49:19.697Z giữ đúng timestamp;95held không giải phóng. Không provider create/Circle/email, backup export hoặc replay đơn/giao dịch. Safe đọc riêng lúc 2026-10-18T03:49:19.282Z, finalized67778411 khớp12kiểm; public page còn tự đọc trước/sau chữ ký. Khi nhận chữ ký thật vẫn cần re-read authority/context/expiry và đánh giá custody.

Circle/admin live hoãn; username/social POST-V1. Chưa nhận hai chữ ký hoặc attestation, thiếu offhost/RPO/RTO và các branch live khác. NOT_FROZEN; G5/G6 OPEN;acceptanceEligible=false.

Proof: reports/evidence/safe-owner-page/2026-10-18T04-01-13-366Z-final/CHECKS.json
SHA256: e9680118ce31ececb4d3f46d4aa131e00d4886a8a19d53cc35246e590e76ae66
