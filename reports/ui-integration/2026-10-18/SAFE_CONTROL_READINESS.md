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

**Trang ký đã sẵn sàng:** https://groupdeal.thanhtan.top/safe-owner-control/index.html — không cần đăng nhập GroupDeal. Xem SAFE_OWNER_SIGNING_PAGE.md; owner tự ký và sao chép JSON vào chat, không gửi private key.

# Safe control: gói sẵn sàng cho owner — 18/10/2026

Đã kiểm public authority lúc 2026-10-18T03:35:51.019Z, finalized 67776814: Hub/manifest/runtime/roles và Safe 1.5.0 đúng; 3 owner, quorum 2/3, nonce 0, modules rỗng, không pending transfer. 12 kiểm đạt. Block cũ 67761173 của challenge vẫn canonical. Chưa có chữ ký hoặc bằng chứng custody độc lập.

Giữ nguyên challenge đã chuẩn bị, không tạo challenge mới: backend 30fea223380affc471cc91f4ab2390814ddaa87c; digest **0x21207e4bbe6a41efad99f8b398254370c8784abdd7dd78d5a599436cbc64f7d4**. Hết hạn **08:27:27 ngày 19/10/2026 (UTC+7)** (2026-10-19T01:27:27.814Z). SDK 5458925313a8b8f2d6d4a63eb6c77f4e5df9eb6c không thuộc admitted app runtime nên không đổi context backend của challenge. Phải đọc lại context/authority/expiry ngay trước khi nhận chữ ký; nếu hết hạn hoặc context đổi thì không sử dụng.

Cần 2 owner khác nhau tự ký chính xác toàn bộ thông điệp EIP-191 trong tệp OWNER tương ứng. Bắt buộc gồm **0x73307bdd39d875f98857ffce0fed1cdc62f50b6d**, cộng một trong hai owner còn lại. Tệp là đúng 982 byte, không thêm newline cuối hoặc sửa nội dung. Trợ lý không ký hoặc điều khiển ví thay owner. Đây là thông điệp control-only; không có giao dịch, approval hay Safe execution trong gói này.

- [Thông điệp owner 73307bdd](E:/apps/group-deal/reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/OWNER_73307bdd39d875f98857ffce0fed1cdc62f50b6d.txt)
- [Thông điệp owner c289b853](E:/apps/group-deal/reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/OWNER_c289b853d90f2c604fd38458b1ce4b991156d18b.txt)
- [Thông điệp owner 7366adbf](E:/apps/group-deal/reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/OWNER_7366adbf19e511095e7737138498f625d737db22.txt)

Kết quả cần trả: hai mục JSON {"owner":"0x...","signature":"0x..."}, cùng xác nhận thật của từng người giữ khóa: owner nào họ ký được, người khác có quyền dùng/khôi phục khóa đó không, và cách tách quyền kiểm soát. Có thể dùng nhãn người giữ thay tên riêng; không cung cấp seed/private key. Mẫu CUSTODY_ATTESTATION.template.json chỉ là mẫu trống, chưa phải proof. Hai chữ ký chứng minh control, không tự chứng minh hai người/custody độc lập.

Verifier offline: scripts/verify_safe_owner_control.cjs trong checkout sạch, dùng challenge gốc, JSON chữ ký và digest ở trên. Verifier hiện hành byte-identical với bản pin trong gói gốc; từ chối zero signatures. Chưa nhận dữ liệu người dùng, chưa chạy verifier với chữ ký thật. Sau khi có chữ ký và attestation vẫn cần đọc authority mới, kiểm principal/custody và các điều kiện G5 khác trước kết luận.

Audit G5: 21 artifact CURRENT, 28 source file và 23 test file duy nhất khớp checkout; 8 execution reference kế thừa khớp path/hash; 7 tệp gói Safe khớp hash và toàn bộ message khớp verifier. Phát hiện header ma trận G5 còn ghi SDK416ab71 trong gói trước; sửa thành5458925 tại hồ sơ mới, giữ nguyên artifact cũ. Không coi kiểm hash/inventory là execution PASS hoặc chạy lại các test cũ.

VPS lúc 2026-10-18T03:38:16.174Z: resolved cwd /home/ubuntu/groupdeal/releases/47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a/backend, runtime/public paths đúng; PID97197/NRestarts0, 377 runtime/181 public hash khớp, backup VERIFIED/privateRestore/BACKUP_CURRENT, timer active, 95 held giữ. Không deploy/restart, mở DB, tạo archive mới hoặc xuất credentials. Ledger/email giữ timestamp proof trước; không đọc lại trong gói này. Hai giả định sai của công cụ kiểm ban đầu (newline/cwd root) được sửa theo bytes/cwd thực và ghi TOOLING_CORRECTIONS.json; không sửa product hoặc gói challenge.

Circle và admin live hoãn theo người dùng; username/social POST-V1. Chưa offhost target, incident RPO/RTO, Safe custody, receiver/provider/email thật và các branch live còn mở. NOT_FROZEN; G5/G6 OPEN; acceptanceEligible=false.

Proof: reports/evidence/safe-control-readiness/2026-10-18T03-39-47-536Z/CHECKS.json
SHA256: e9bc4537262b953f677625a1864254698f5cb3381e24f7c0e61fb41079f110cd
