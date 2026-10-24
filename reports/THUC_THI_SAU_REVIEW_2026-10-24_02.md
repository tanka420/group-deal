# Thực thi sau review GroupDeal — phát hành sau phê duyệt 24/10/2026

**Đã hoàn tất phát hành và postcheck trong phạm vi tự thực thi.** Frontend và backend trên VPS Arc Testnet cùng chạy **8c32212fdb051cdb01f98226932f3a61afa3e9bf**. Người dùng đã trực tiếp duyệt phát hành sau báo cáo candidate; blocker thiếu phê duyệt của lần trước đã được giải quyết. **G5 OPEN / G6 OPEN / candidateFrozen=false / acceptanceEligible=false / wholeProjectAccepted=false.** Duyệt phát hành chưa phải ký nghiệm thu toàn dự án.

Đây là biên bản bổ sung cho [báo cáo candidate trước phát hành](THUC_THI_SAU_REVIEW_2026-10-24.md), [review gốc được bảo toàn](REVIEW_TOAN_DU_AN_2026-10-24.md) và [phạm vi G5/G6](PHAM_VI_G5_G6_CON_LAI_2026-10-24.md). Báo cáo và bằng chứng cũ giữ nguyên thời điểm, phiên bản và kết luận khi được lập. Thời gian receipt là UTC; giờ Việt Nam = UTC+7.

## 1. Phiên bản và kiểm tra

| Thành phần/gate | Kết quả thực tế |
|---|---|
| Frontend | RELEASED 8c32212fdb051cdb01f98226932f3a61afa3e9bf; trước đó 49f2719d8c114bb380a16ab87c128b740c47dadc |
| Backend | RELEASED 8c32212fdb051cdb01f98226932f3a61afa3e9bf; trước đó f314de7fc47b77055b25615209dbdb8bd867853e |
| CI mã ứng dụng | [Run 40091058726](https://github.com/tanka420/group-deal/actions/runs/40091058726): SUCCESS, 78/78 bước bắt buộc PASS, completeScope=true, đúng SHA. Đọc lại kết quả, không rerun CI đã đạt |
| Nguồn phát hành | Commit đã push; HEAD tài liệu 01b738f95c83e2429d23f11d0edb0b2969cf1471 có scope ứng dụng giống hệt 8c32212. Không build/deploy checkout chưa commit |
| Payload | SHA-256 3c4c38f019a4461fcfbdb5c71bf42567efef57c0b2b01972c324f2db8b48e35a; 397 runtime files được kiểm đủ hash, chỉ 4 tệp runtime đổi; 186 frontend files |
| Frontend package manifest | SHA-256 b8619097d00f33a2bb082d3b5915c17ecfb1c206bbc845fe624eb5c1844f67e5; 34080 byte. Gói production đã ghi nhận từ đúng SHA |
| Activation receipt | 2026-10-24T16:24:13.919Z = 23:24:13 ngày 24/10 giờ Việt Nam; khoảng bảo trì 24993 ms (~25 giây) cho stop/native preparation/start và kích hoạt static |
| Admission/reconciliation | Native intake và application recovery đã xác minh private recovery, allLiveFieldsPreserved, nguyên vẹn source files; fresh reconciliation HEALTHY, không discrepancy; startup admission đạt |
| Dịch vụ | groupdeal-testnet active, PID 3485467, NRestarts=0; chỉ một chu kỳ stop/start theo runbook. PID giữ nguyên qua postcheck |
| Đối chiếu công khai | 185 tệp HTTPS đúng byte length/SHA-256; 22 tuyến/ranh giới HTTP; 2 smoke guest desktop/mobile PASS. Browser chặn mọi request ghi; không lỗi page hoặc request ghi |
| Health | HTTP 200 / OK, chain 5042002, Hub 0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574, protocol 1; phạm vi health là PROCESS_LIVENESS_ONLY |
| Backup sau phát hành | 2026-10-24T16:24:30.773Z; source 8c32212, private restore/integrity/source-row preservation PASS |
| Offhost sau phát hành | 2026-10-24T16:25:50.135Z; layout v2 round-trip PASS, cùng ciphertext SHA-256 4e3b49478a9ac727e3b8f25f457f84932dff797db5f5bc1d08ff2a8042f91069 và kích thước 19100946 byte |
| Giám sát | UP tại 2026-10-24T16:25:50.367Z; liveness không thay bằng chứng financial reconciliation |

Preflight được chạy lại trước activation: backup 23,641 phút, offhost 11,969 phút; 397 preimage, launcher, backup guard, env/nginx và source đang chạy đều khớp. Dùng đúng gói đã niêm phong, không đóng gói lại. Native intake trước thay source giữ 95 hold; application preparation và admission sau đổi source đều đạt. Không dùng rollback, reset hoặc restore database để chữa lỗi.

Các số lượng runtime giữ nguyên: users 20, campaigns 7, orders 7, operations 50, resourceGrants 8, licenseInventory 12. **95 tác vụ vẫn hold, heldWorkReleased=false.** Không tạo giao dịch/đơn/tranh chấp, không tác động đơn 1–7, signer/principal/custody hoặc quyền. Database được giữ theo đường native recovery/admission; không sửa trực tiếp để làm kiểm tra đạt. Không thay DNS, tài khoản dịch vụ, nginx hoặc env. Asset bất biến cũ giữ nguyên.

## 2. Sửa lỗi và bằng chứng kế thừa

F1 bộ lọc ví, F2 timezone social link, F3 focus handle, F4 clipping và F5 caption ở mobile chữ 200% đều đã có trong bản vừa phát hành. Kiểm fixture gồm 27 tổ hợp role/principal/direction, phân trang 45 bản ghi, account isolation, VI/EN × UTC/Vietnam và delta browser/keyboard/reflow; CI cuối chạy đủ suite bắt buộc. Chi tiết diff, tái hiện và kiểm tra nằm ở mục 1–2 của báo cáo candidate; không lặp các kiểm tra đã đạt khi source không đổi. Postcheck công khai xác minh artifact/smoke, không biến fixture thành live wallet/OAuth acceptance.

Candidate ledger mới tách FE/BE đã phát hành với phiên bản trước, nối payload/package/CI/receipt/admission/postchecks và catalog lịch sử. Manifest Arc Testnet, chain/Hub/protocol, SDK packed hash và Worker không đổi. Worker vẫn là application source 4b5af76, deployment receipt ngày 21/10 version 26a082d3-0712-4b3a-853a-1802779a639d; không phát hành Worker trong lượt này.

133 reference lịch sử và 77 canonical source/test blobs đã đối chiếu trong lượt trước được tái sử dụng theo timestamp/version gốc. M/P/L/R/B/F không tự trở thành proof hành trình live trên 8c32212. Ba receipt thiếu local đã được tìm thấy trên VPS và đối đúng hash/byte length; payload vẫn không có local, không tái tạo receipt. Hai CI cũ 49f2719/f314de7 đã đọc kết quả SUCCESS, không rerun.

Kho private mới: reports/evidence/post-review-release/2026-10-24T16-24-13-919Z. Có RELEASE_CANDIDATE_LEDGER.json, ACCEPTANCE_MATRIX.json (20 dòng, cập nhật OPS-01), CHECKS.json, receipt phê duyệt/activation/postchecks/health/HTTP/CI/preflight. Hai CURRENT pointer trỏ CHECKS mới; CHECKS nối lại snapshot candidate trước đó. Bằng chứng private/cache/archive/database không được đưa vào Git.

## 3. Issue ledger sau phát hành

| Mục | Trạng thái/phần còn lại |
|---|---|
| F1–F5 | FIXED_AND_RELEASED 8c32212; fixture/delta/CI và artifact postcheck đạt |
| A1 phê duyệt activation | RESOLVED_BY_DIRECT_USER_APPROVAL; lệnh activation thực sự đã chạy và có receipt. Rejection cũ giữ trong snapshot lịch sử |
| H1 candidate/proof map | Hoàn tất ledger/digest/version/case map trong phạm vi truy cập; còn thiếu live byte provenance Worker |
| H2 receipt/CI lịch sử | Hoàn tất remote hash/length cho ba receipt, đọc đúng CI cũ; không cần copy payload private |
| H3 accessibility delta | PASS_FIXTURE_DELTA cho handle và WalletActivity; không tự thêm chứng nhận AT/WCAG toàn diện |
| I1 SDK/API parity | Đã ghi phạm vi hỗ trợ; không mở rộng SDK |
| OPS-01 | RELEASE_AND_POSTCHECK_VERIFIED_G6_OPEN; phần triển khai đã xong, còn review độc lập và ký nhận bàn giao |
| Worker live bytes | EVIDENCE_GAP: bundle cache không phải byte upload/live. Lần đọc code bị auto-review từ chối; metadata OAuth sẵn có trả 401. Không đăng nhập/cấp quyền mới hoặc deploy lại Worker |
| X; retry/DLQ live | DEFERRED_BY_USER; không outage, replay hoặc redrive |
| Manual restore/RPO-RTO | WAIVED_BY_USER; private restore của backup tự động đã kiểm, không mở lại diễn tập thủ công |
| Mainnet/WP30, dịch vụ trả phí, mở rộng token | OUT_OF_SCOPE |

## 4. Bước tiếp theo theo thứ tự

1. **Chủ sản phẩm chốt ca nghiệm thu còn hiệu lực trên matrix 20 dòng.** Chọn ca cần bổ sung live hoặc ghi quyết định miễn/thu hẹp có lý do. Giữ các ca đã hoàn tất và quyết định hoãn/miễn hiện có; không chạy lại toàn bộ hành trình.
2. **Với ca giữ lại, người sở hữu tài khoản/authority thực hiện phần cần phiên hoặc chữ ký trên dữ liệu riêng.** Dùng bảng dưới đây để giao đúng actor; không dùng đơn 1–7 hoặc giải phóng 95 hold. Cần duyệt riêng nếu mở phạm vi giao dịch, thay quyền, outage/restore hoặc email/ticket thật.
3. **Chốt khoảng trống provenance Worker.** Chủ hệ thống cung cấp receipt/digest byte đã upload hoặc proof đọc phù hợp qua quyền sẵn có; nếu không có, chủ sản phẩm quyết định ngoại lệ bằng văn bản. Không triển khai Worker chỉ để tạo bằng chứng thay thế.
4. **Review độc lập và ký nhận G6 trên bộ phiên bản được ghim.** Người review đối ledger/matrix/runbook/issue ledger; chủ sản phẩm quyết định freeze và sign-off sau khi xử lý các ô còn mở. Người thực thi không tự đặt acceptanceEligible=true.

| Case còn thiếu live | Việc tối thiểu cần actor/quyết định có thẩm quyền |
|---|---|
| ACL-01; ID-01/02/03 | Quyền mới bị chặn nhưng nghĩa vụ cũ còn dùng được; OAuth cancel/unlink/relink/duplicate. Cần phiên chủ tài khoản; không lặp OAuth positive đã có |
| CMP-01/02; BUY-01/02/03 | Material edit/privacy; early-on/cap, rebuy/max-account, inventory boundary trên campaign/đơn riêng nếu giữ tiêu chí |
| REC-01/02/03; AUTH-01/02 | Cross-session/device, mất ACK, unknown/drop/replace/revert; xác nhận authority/Safe readiness, emergency UAT nếu còn bắt buộc |
| ENT-01/02; DSP-01/02; CLM-01/02 | Lifecycle revoke/expiry/activation/mismatch; partial dispute trên UI hiện hành/window/fallback; batch claim/authority. Cần dữ liệu riêng/người ký; không lặp delivery/claim đã xong |
| PROJ-01; SUP-01/02 | Rebuild/outage/recovery chỉ trên môi trường/ca được duyệt riêng; support close/reopen/remove/expiry và attachment ACL cần phiên/ticket riêng |
| WAL-01 | Chủ sản phẩm chỉ rõ asset/funding còn bắt buộc nếu có; không tự tạo swap/bridge hoặc biến SKIP provider/config thành FAIL |

Ma trận chi tiết, phiên bản/thời điểm/phạm vi proof và các ca trùng đã hợp nhất được giữ ở mục 4 báo cáo candidate và ACCEPTANCE_MATRIX mới. Các ô thiếu live là khoảng trống bằng chứng, không tự coi là lỗi chức năng. Không còn bước triển khai ứng dụng, CI hoặc backup độc lập nào đang chờ trong phạm vi đã duyệt.

## 5. Bàn giao vận hành

- Biên bản VPS mới: operations/POST-REVIEW-RELEASE-8c32212fdb051cdb01f98226932f3a61afa3e9bf.json và operations/POST-REVIEW-POSTCHECKS-8c32212fdb051cdb01f98226932f3a61afa3e9bf.json. WORKSPACE-RELEASE.json/FRONTEND-RELEASE.json cũ là lịch sử, không dùng để suy ra phiên bản mới nhất.
- Duy trì timer/observer hiện có. Backup quá 90 phút hoặc offhost quá 150 phút báo ATTENTION theo chính sách; không cần đăng nhập Microsoft lại hay chạy migration OneDrive lại. Không tạo thêm automation trong lượt này.
- Khi sự cố: kiểm health/source/admission/reconciliation trước; giữ hold, không tự replay, đổi signer hoặc reset/restore database. Release script chỉ cho rollback trước khi runtime mới được start; sau admission cần đánh giá riêng theo runbook, không khôi phục dữ liệu cũ tự động.
- Phiên đăng nhập có thể cần đăng nhập lại do native backend recovery/admission hiện hành. Đây không phải yêu cầu làm lại OAuth/claim đã hoàn tất.
- Lần sửa mã tiếp theo cần commit/push/CI đúng SHA và phát hành có receipt riêng. Commit tài liệu sau bản này không đổi phiên bản ứng dụng đang chạy.

**Phạm vi tự thực thi đã hoàn tất.** Các bước còn lại cần quyết định nghiệm thu, actor sở hữu phiên/chữ ký hoặc bằng chứng Worker từ người có quyền; G5/G6 giữ mở cho đến khi các quyết định đó được ghi nhận.
