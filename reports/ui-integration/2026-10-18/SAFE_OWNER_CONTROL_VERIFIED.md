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

# Safe owner control đã xác minh; custody độc lập chưa đạt

Đã nhận ba chữ ký do người dùng cung cấp trong chat và kiểm bằng verifier hiện hành, đúng toàn bộ thông điệp982byte của từng owner. Ba địa chỉ khôi phục từ chữ ký khớp:73307bdd…50b6d,7366adbf…7db22,c289b853…6d18b. Có owner bắt buộc73307bdd, ba owner khác nhau, đáp ứng quorum kỹ thuật2/3. Digest 0x21207e4bbe6a41efad99f8b398254370c8784abdd7dd78d5a599436cbc64f7d4, challenge gốc48aa5c9a-073c-4b1e-b026-3c565acd10d3, context backend30fea223380affc471cc91f4ab2390814ddaa87c. Verification lúc 2026-10-18T04:12:28.633Z trong thời hạn; không suy ra thời điểm ký từ chuỗi chữ ký.

Đọc lại Safe/Hub lúc 2026-10-18T04:10:10.064Z, finalized67780880/0xa893d927315aec16014591f1c3206532a9da23b1bf07bdaa331884ae457069b8:12checks đạt, đúng3owner/threshold2/Safe1.5.0/nonce0/modules[], không pending authority transfer. Block gốc67761173 của challenge vẫn canonical. Manifest/runtime hash/backend context và13kiểm liên kết với chữ ký đạt. Không tạo/ký/broadcast Safe transaction, approval hoặc transfer.

Sau câu hỏi ai có thể ký/khôi phục từng khóa, người dùng trả lời chính xác **“1 người”**. Ghi nhận một người cho cả ba owner keys, chưa xác định danh tính người đó. Vì vậy **OWNER CONTROL VERIFIED; INDEPENDENT CUSTODY REQUIREMENT NOT MET**. Ba địa chỉ và ba chữ ký không chứng minh ba chủ thể độc lập. Đây là thông tin mới nhất, thay thế suy đoán hoặc khai báo chuẩn bị trước đây về owner độc lập. Không có quyết định miễn điều kiện hoặc thay đổi owner/threshold. Không cần thêm chữ ký để chứng minh lại control đã đạt trong gói này; phần còn thiếu là tách quyền kiểm soát/khôi phục thật nếu giữ yêu cầu độc lập.

Raw signature input và hash được giữ trong artifact root, không đưa giá trị chữ ký vào tài liệu push GitHub. Pure offline verifier không truy cập provider/key/DB. Chữ ký chỉ cho thông điệp control; safeTransactionAuthorized=false, independentHumanCustodyVerified=false, acceptanceEligible=false. Chưa đánh giá emergency execution hoặc quyền điều hành ngoài nội dung thông điệp.

Runtime lúc 2026-10-18T04:10:07.821Z:PID97197/NRestarts0,377runtime/185public khớp(181main+4trangops);resolved release/backend vàpublic đúng. Backup VERIFIED/privateRestore/BACKUP_CURRENT,timers active,95held giữ. Không thay source, deploy/restart,Nginx,DB,backup export,provider create,email,replay hoặc chạy test/CI. Financial ledger/email và lịch sửdelivery/claim/commit/UI giữ timestamp riêng, không đọc lại trong gói này. Frontend8dc5cf1/backend30fea22/SDK5458925/ops73b6fae/trangSafe cf29838 giữ.

CURRENT và G5 map chuyển sang control thật đã đạt nhưng custody NOT MET. Circle/admin live hoãn,username/social POST-V1;offhost/RPO/RTO và các branch live khác vẫn mở. Candidate NOT_FROZEN;G5/G6 OPEN;wholeProjectAccepted=false.

Proof: reports/evidence/safe-owner-control/2026-10-18T04-09-56-604Z/CHECKS.json
SHA256: 8125907e01eb1c08ac8a9bc6f16e2cadf87db02abc3048ca7688ed720a0fd88e
