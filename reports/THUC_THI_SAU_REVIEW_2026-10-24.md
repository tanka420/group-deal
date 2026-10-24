# Thực thi sau review GroupDeal — 24/10/2026

Bổ sung cho [review gốc](REVIEW_TOAN_DU_AN_2026-10-24.md) và [phạm vi G5/G6](PHAM_VI_G5_G6_CON_LAI_2026-10-24.md). Không thay thế hoặc sửa bằng chứng lịch sử. Ngày giờ trong receipt là UTC; giờ Việt Nam = UTC+7.

**Kết luận:** F1/F2 và ba lỗi UI liên quan đã sửa trong candidate, commit/push, full CI 78/78 và preflight VPS đạt. **Phát hành bị chặn bởi duyệt tự động; runtime chưa đổi.** Các phần code/kiểm tra/hồ sơ tự thực thi đã hoàn tất; bước phụ thuộc phê duyệt được nêu ở mục 6. Hoàn tất phạm vi tự thực thi không đồng nghĩa nghiệm thu toàn dự án. **G5 OPEN / G6 OPEN / candidateFrozen=false / acceptanceEligible=false / wholeProjectAccepted=false.**

## 1. Thay đổi và kiểm tra

Nguồn bắt đầu: nhánh `codex/arc-candidate`, HEAD `9d2bf2fa125748ed2f0a19dba5c4fbfd9b16e695`. Worktree chỉ có báo cáo review chưa commit; tệp đó được giữ nguyên và không đưa vào commit của lượt này. Làm việc tại repository chính; không sửa/build trong clone CI, áp stash hoặc dùng baseline 22/10 để đánh giá bản mới.

| Issue | Thực hiện | Kết quả/ranh giới |
|---|---|---|
| F1, P2 | SQL ghép account ownership, principal và direction vào từng nhánh BUY/SELL. Mapper chọn phía BUY thực sự khớp, rồi SELL; mặc định ưu tiên BUY khi cả hai phía khớp | Giữ một dòng/đơn. B + mặc định → SELL/B; A + SELL → rỗng. Không cấm self-purchase; không đổi accounting hay principal. Guard frontend giữ nguyên |
| F2, P3 | Social verifiedAt dùng formatter dateTime chung với Asia/Ho_Chi_Minh | Không đổi timestamp lưu, OAuth validity hoặc deadline; VI/EN đều hiển thị 08:02 cho 2026-10-24T01:02:03Z dù browser ở UTC/Vietnam |
| F5, P3, tái hiện bằng ảnh và assertion H3 | Caption tiền ở mobile chữ 200% bị wrap thành 9 dòng ký tự; chuyển summary WalletActivity sang một cột trên màn hẹp | Assertion caption dưới 3 dòng FAIL trước/PASS sau; đã xem ảnh row cuối. Tab Transfers giữ nguyên layout |
| F4, P2, tái hiện bằng ảnh và assertion H3 | Chiều cao/max-height mobile của khung lịch sử ví còn cố định từ giao diện cũ, cắt nội dung danh sách mới; đổi khung sang chiều cao theo nội dung | Assertion bounding-box FAIL trước/PASS sau; filter/list/pagination không bị cắt ở chữ 200%. Không đổi nội dung hoặc flow giao dịch |
| F3, P3, tái hiện khi làm H3 | Focus bị mất lúc nút tạo handle được thay bằng nhóm xác nhận, và sau thành công | Focus vào xác nhận; Tab đến chọn lại, trả focus về input; lỗi trả về xác nhận sau khi bật nút; thành công về input readonly. Reset trạng thái focus khi account/session đổi. Không đổi semantics username một lần |

Kiểm tra hẹp đã thực hiện:

- SQL/API fixture: 27 tổ hợp một/hai vai trò × principal A/B/không lọc × BUY/SELL/mặc định; total, phía tiền allocated/claimed/claimable và wallet đúng. Bảy tổ hợp dual-role có kết quả đi hết 45 bản ghi có timestamp trùng; hai tổ hợp sai phía trả rỗng; không trùng/mất hoặc lộ account khác. Cursor từ account/principal/direction khác bị từ chối.
- Formatter unit: VI/EN × TZ UTC/Asia/Ho_Chi_Minh; thiếu, sai kiểu, NaN, infinity, âm, 0 và ngoài Date range trả dấu —. Hai locale có thứ tự ngày/giờ khác nhau; không ép cùng chuỗi định dạng.
- Chromium workspace: Ba ca workspace kế thừa đã đạt; tám ca delta + hai regression layout Transfers **10/10 PASS** sau sửa F4/F5 và thu hẹp CSS (trước đó toàn bộ 11/11 đã đạt trước khi thêm assertion clipping). CI cuối chạy lại đủ 11 ca workspace trên source cuối. VI/EN × 375/1440 px, filter bàn phím, pagination 20/20/5, trạng thái loading/error/reload, handle xác nhận/chọn lại/lỗi/thành công/readonly và reflow chữ 200%; bốn ca social theo timezone. Đây là fixture cô lập, không phải giao dịch hoặc live acceptance.
- Backend/frontend typecheck PASS. Backend build và production frontend package thành công. Full CI của SHA ứng dụng mới là gate bắt buộc, không được thay bằng các kiểm tra local trên.

Nguồn sửa: [SQL](../backend/src/db/rowPersistence.ts), [mapper](../backend/src/services/workspaceView.ts), [identity panel](../frontend/src/components/SellerIdentityPanel.tsx). Kiểm tra: [SQL matrix](../backend/test/workspace_pagination.test.ts), [browser fixture](../backend/test/workspace_browser_server.test.ts), [workspace browser](../frontend/e2e/workspace_completion.spec.ts), [formatter unit](../frontend/test/order_list.test.ts).

## 2. Commit, CI và phát hành

- Commit ứng dụng: **8c32212fdb051cdb01f98226932f3a61afa3e9bf**, đã push lên GitHub. Bốn commit ứng dụng 955f072 → c6570af → 3bbf8c3 → 8c32212, tổng tám tệp mã/fixture/test/CSS thuộc nhiệm vụ; báo cáo review chưa commit được bảo toàn.
- Run 40089064955 của candidate 955f072, run 40090069381 của c6570af và run 40090509778 của 3bbf8c3 đã được hủy khi phát hiện F4, cần thu hẹp CSS để giữ layout tab Transfers rồi thêm F5; chưa dùng các run đó làm gate hoặc deploy. Đây là thay đổi có lỗi tái hiện mới, không phải rerun commit cũ để làm mới hồ sơ.
- CI candidate: [run 40091058726](https://github.com/tanka420/group-deal/actions/runs/40091058726). **SUCCESS; 78/78 pipeline steps PASS, completeScope=true; đúng SHA 8c32212. Job workflow_dispatch không kích hoạt giữ SKIPPED theo workflow, không được biến thành live PASS.**
- Frontend: **CANDIDATE_READY 8c32212, chưa activate. VPS vẫn phục vụ 49f2719; preimage index/hash khớp bản đã phát hành.**
- Backend: **CANDIDATE_READY 8c32212, chưa activate. VPS vẫn f314de7/PID2981013; 397 tệp runtime/preimage khớp, 95 hold giữ nguyên.**
- Artifact phát hành gộp: SHA-256 `3c4c38f019a4461fcfbdb5c71bf42567efef57c0b2b01972c324f2db8b48e35a`; 397 runtime files (digest SHA-256 của mảng manifest JSON: d0991c8731285be4ef8ae7158f39c613957eb4977f8054e421cc336628e5c5fe), chỉ 4 file đổi (hai TS + hai JS), 186 frontend files. Không đưa archive vào Git.
- Frontend package manifest: SHA-256 `b8619097d00f33a2bb082d3b5915c17ecfb1c206bbc845fe624eb5c1844f67e5`, 34.080 byte; build tại repository chính từ SHA đã commit, dùng provider identifiers hiện có. Reown chỉ kiểm cấu hình đọc, kết quả COMPATIBLE; không coi đây là proof wallet login hoặc allowlist.
- Hai run cũ được đọc lại trực tiếp qua gh: [frontend 40063311147](https://github.com/tanka420/group-deal/actions/runs/40063311147) SUCCESS đúng 49f2719 và [backend 40002078347](https://github.com/tanka420/group-deal/actions/runs/40002078347) SUCCESS đúng f314de7. Không rerun hai commit cũ.

## 3. Candidate ledger và provenance (H1/H2)

Hồ sơ private bổ sung: `reports/evidence/post-review/2026-10-24/CANDIDATE_LEDGER.json` chứa source delta, digest/byte length, case→proof reference, phiên bản và thời điểm gốc. Hồ sơ cuối được nối tại mục 6. Source inventory và CI đều không được gán thành live acceptance.

| Thành phần | Ghim phiên bản/phạm vi |
|---|---|
| Frontend mới | 8c32212; trước đó 49f2719; manifest package ở mục 2. Tách thời điểm build, CI và activation |
| Backend mới | 8c32212; trước đó f314de7. Manifest 397 file; delta chỉ wallet read SQL/DTO. Giao dịch, signer và authority không đổi |
| Deployment manifest | shared/manifests/arc-testnet.json; SHA-256 a659cea9181c37da0c0bafaae6905e6473aa96f265d51476c9e2f29d8ee9630b; chain 5042002; Hub 0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574; block 64644317; protocol v1 |
| SDK packed | groupdeal-sdk-2.0.0.tgz, 19.303 byte, SHA-256 474af3cedf3d15b91e77fe4d7b1ce285880ea69d17e9f4cdfe824d3685669d54. sdk/src và vendored provider không có delta so với application 4b5af76 |
| Worker source | Provider application 4b5af7604df53be680e7af9986d45810ac4d26e2; source/config/dependencies ghi hash từng file trong ledger, không có delta đến 8c32212 |
| Worker deployment receipt thực sự | CF_DEPLOY_1792571262196.json (SHA-256 261788cebecedb740837b131a5b7fe965fdc1a32368f8c56d65fd941c10c6d25), 21/10 08:27:42.196Z, version 26a082d3-0712-4b3a-853a-1802779a639d. Không lấy field receiverSourceCommit kế thừa của CHECKS làm phiên bản provider mới |
| Worker bundle lưu lịch sử | worker.js 59.000 byte, SHA-256 e7936e3c3f5efcd6863933da458591e93f526cf3abd37da5049597df8ef65071. Hai cache lịch sử có cùng byte; chỉ đọc chúng, không build/sửa. **Không có proof hash byte đã upload trong receipt cũ; không gọi bundle cache là live byte readback** |

77 source/test inventory được đối chiếu bằng canonical Git blob: 67 không đổi, 10 đã đổi từ inventory 5e7a012; danh sách/digest hiện hành nằm trong CANDIDATE_PREPARED_8c32212.json. Chúng được nối với release/CI/delta tương ứng, không dùng inventory làm proof thực thi.

133/133 reference duy nhất trong G5 source/proof map lịch sử được kiểm lại đủ hash/byte length. Phần không đổi tái sử dụng theo timestamp/source gốc; phần wallet/identity mới gắn kiểm delta và CI mới. Không làm mới timestamp của các proof cũ.

**Ba receipt thiếu local đã tìm thấy tại đường dẫn gốc trên VPS; hash và byte length đều đúng:**

| Receipt | SHA-256 | Byte length |
|---|---|---:|
| runtime-upgrade-inputs/2026-10-23T18-58-44-256Z-e25bf9ad-c8d1-4ba6-bf59-cf36ccc57dc6.json | 3610c1721952de7dd6dc868f3f455ab5fd7487a5afdd8480662f2f34fdd2fe1a | 63544 |
| application-recovery/2026-10-23T18-58-51-484Z-3aa6d28c-8172-49ee-ae12-85494c04ce7c.json | 24a0d25b4ccde2dd3093246e0c99d715a228dddb40639f11ebeba2ac7d7db48a | 69297 |
| application-recovery/2026-10-16T10-13-16-107Z-3ee98b4c-75ac-49ad-8f26-9b3fe75742dc.json | 65a0c8203dfd949c3b36e52b753d10b5afd1f5700b43d9f5054e0d5d11a6085b | 66018 |

Quan sát chỉ đọc lúc 24/10 11:09:20.555Z. Chúng còn trên VPS, không phải provenance unavailable; nội dung vẫn không có local. Không tái tạo receipt, restore hoặc deploy để thay bằng chứng cũ.

Giới hạn truy xuất còn lại: quyền OAuth Cloudflare hiện có trả HTTP 401 lúc 11:17:23.781Z khi GET deployment metadata; không refresh/đăng nhập/cấp quyền mới. Cơ chế duyệt tự động đã từ chối (1) sao chép payload ba receipt VPS và (2) đọc code Worker để hash, do đánh giá nội dung có thể private và chưa đủ căn cứ về quyền chuyển payload. Phương án hash tại VPS giải quyết H2; với Worker, giữ lịch sử và phân biệt bundle cache với byte live. Chỉ phần đối byte Worker hiện hành còn thiếu; không hạ các proof delivery cũ thành FAIL và không deploy lại Worker để tạo receipt thay thế.

## 4. Acceptance matrix sau đối chiếu

Proof gốc: **M** = G5_SOURCE_PROOF_MAP ghi 21/10 14:48:45.039Z; **P** = provider-application CHECKS ghi 21/10 08:39:11.123Z; **L** = provider-live CHECKS ghi 21/10 09:15:59.621Z; **R** = R567 matrix ngày 17/10; **B/F** = backend/frontend release 23–24/10; **D** = delta fixture/CI mới. Catalog private PROOF_CATALOG.json ghi timestamp và phiên bản thực tế: R dùng frontend 8dc5cf1/backend 324bca2 tại 17/10 18:24:52.596Z; P/L dùng 4b5af76; M khai báo runtime FE 5e7a012/BE 4b5af76 và inventory canonical 5e7a012. Không lấy timestamp tên thư mục làm thời điểm proof. Ledger private map từng reference đến file/hash/version và giữ mô tả quan sát gốc. Bằng chứng M/P/L không đổi thành proof bundle 8c32212 tự động.

| Case, nhóm | Proof giữ lại / delta | Phần thực sự còn thiếu và bước tối thiểu |
|---|---|---|
| ACL-01; G5-01/03/13 dùng chung | P rights approve/revoke/admin; M source/test ACL; D không đổi authority | Live denied badge/access: chứng minh quyền mới bị chặn nhưng nghĩa vụ đơn cũ còn thực hiện được. Cần phiên của actor phù hợp và kế hoạch dữ liệu riêng; không sửa quyền hay dùng đơn 1–7 ở lượt này |
| ID-01/02/03; G5-01/13 dùng chung | P GitHub/Discord positive; source PKCE/state/revision/unique-owner, CI giữ nguyên | Live OAuth cancel; unlink/relink; duplicate social ID giữa hai account. Cần chủ tài khoản/OAuth; chưa thực hiện và không yêu cầu OAuth lại phần đã xong |
| WAL-01; G5-02 | Circle login/send/swap đã có; M reverse swap là một ca cụ thể, không phải mọi tài sản | Chưa có danh sách asset/funding bắt buộc cụ thể ngoài tập đã ghi. Không tự lập swap/bridge/cirBTC mới. Giữ SKIP theo lý do route/provider/config gốc; chỉ mở ca mới khi chủ sản phẩm chỉ rõ tiêu chí còn hiệu lực |
| CMP-01/02; G5-03 | P/L publish, version/rights/provider; B/F campaign draft recovery; CI/model có edit/privacy | Thiếu live material edit/replacement và privacy/lifecycle chưa phủ. Cần campaign riêng, actor được phép và quyết định ca cụ thể; ACL dùng ACL-01, không nhân đôi UAT |
| BUY-01/02/03; G5-04 | M contract/model, early-off, quantity/metric và sold-out; L order7 | Live early-on/cap; rebuy/max-account; inventory boundary chưa phủ. Cần ngân sách/approval/ký và dữ liệu riêng; giữ protocol v1, không đưa V2 vào candidate |
| REC-01/02/03; G5-05 | Same-intent/hash recovery order3/order6 và deadline/unused-nonce giữ nguyên; CI fixture recovery | Cross-session/device + mất ACK; unknown/drop/replacement/revert chưa có proof cho đúng nhánh. Cần phiên/thiết bị và transaction riêng; không resume hoặc gửi lại đơn đã kết thúc |
| AUTH-01/02; G5-06 | Safe control/custody declarations lịch sử và authority source không đổi; admission mới chỉ kiểm runtime | Chủ authority xác nhận readiness trên bộ candidate cuối; emergency-cancel nếu vẫn là tiêu chí thì cần UAT riêng được duyệt. Không tự ký, hủy, đổi signer/principal/custody |
| ENT-01/02; G5-07 | LICENSE_KEY multi-unit, FILE_LINK order6, WEBHOOK order7; wrong-principal/guest negative có sẵn | Resource revoke/expiry/activation và entitlement mismatch chưa đủ live. Cần dữ liệu dành riêng và actor phù hợp; không hủy resource/grant hiện có |
| RETRY-01; G5-07/11 dùng chung | Provider/Worker/conformance fixture CI và L positive được giữ | **DEFERRED_BY_USER**: exhaustion/DLQ/redrive live. Không outage, replay, ép retry hoặc tạo job lỗi |
| DSP-01/02; G5-08 | Partial 50/50 lịch sử order2 có conservation; confirm order6/7 | Partial trên UI/candidate hiện hành, cửa sổ thời gian và fallback/outage còn thiếu. Cần actor phân xử/chữ ký và dispute riêng; không phủ nhận partial lịch sử hoặc tạo dispute trên đơn cũ |
| CLM-01/02; G5-09 | Cumulative rebate→refund lịch sử; payouts order6/7; repeat/wrong-principal read-only negative | Batch nhiều đơn và authority/recovery chưa phủ theo đúng nhánh; không yêu cầu lặp cumulative đã có. Cần đơn riêng/người ký nếu giữ tiêu chí live |
| PROJ-01; G5-10 | M same-block projection, B native upgrade/reconciliation, L conservation | Rebuild/outage/recovery projection còn thiếu. Tạo outage/restore hệ thống thật ngoài phạm vi hiện hành; cần môi trường/ca được chủ sản phẩm duyệt riêng |
| SUP-01/02; G5-12 | P contact/ticket/reply/email INBOX và source/test attachment ACL | Closed/reopen/remove/expiry và download ACL ticket-message-attachment live chưa phủ. Cần phiên actor và ticket fixture riêng; không gửi email hoặc sửa ticket thật ở lượt này |
| A11Y-01; G5-13 | D 4 cấu hình VI/EN × mobile/desktop; keyboard confirm/back/error/success/readonly; text200 | **PASS_FIXTURE_DELTA**. F3 đã sửa. Identity live dùng ID-01/02/03, không tạo vòng UAT trùng |
| A11Y-02; G5-13 | D SQL 45 dual-role rows + UI filter/page/loading/error/reload/keyboard; text200 | **PASS_FIXTURE_DELTA**. F4/F5 đã sửa, có assertion chống cắt chiều dọc và caption wrap từng ký tự. Giữ guard frontend; không suy ra mọi AT/thiết bị đều đạt |
| A11Y-03; G5-13 | R 408 lượt route/locale/size/engine và 30 error/retry; B/F workspace/header delta | Bỏ nhãn backlog mơ hồ “a11y/zoom còn thiếu” khỏi hồ sơ mới: phần mới được chốt bằng A11Y-01/02. Không thêm WCAG toàn diện, screen reader hoặc zoom 400% thành gate |
| OPS-01; G5-14 | B/F release/CI/backup/offhost, OneDrive layout v2; D ledger, CI và preflight chỉ đọc | Activate candidate đang chờ phê duyệt hệ thống; bàn giao người vận hành, review độc lập trên candidate và quyết định nghiệm thu còn thuộc G6. Liveness UP không thay financial reconciliation |
| X-01 | Quyết định người dùng | **DEFERRED_BY_USER**; không mua/cấu hình dịch vụ |
| RESTORE-01 | Private restore verification của backup tự động giữ đúng phạm vi | **WAIVED_BY_USER**: manual restore và RPO/RTO; không mở lại |
| MAINNET-01 | Ngoài candidate Arc Testnet | **NOT_APPLICABLE / OUT_OF_SCOPE**: Mainnet/WP30, paid services và token mở rộng |

Các ca thiếu live là thiếu bằng chứng, không phải lỗi chức năng đã xác nhận. Source/fixture/CI cho nhóm không đổi được kế thừa và kiểm trong CI candidate mới; không có lý do chạy lại toàn bộ hành trình tài khoản, email, giao hàng, claim đã xong. Người nghiệm thu có thể thu hẹp/miễn ca còn lại bằng quyết định rõ ràng; người thực thi không tự chuyển chúng thành PASS.

## 5. Issue ledger và bàn giao

| Mục | Trạng thái cuối của phạm vi tự thực thi |
|---|---|
| F1/F2/F3/F4/F5 | FIXED_IN_VERIFIED_CANDIDATE; CI/preflight đạt; chưa được áp vào runtime vì blocker A1 |
| A1 — activate | BLOCKED_AUTO_REVIEW; cần tin nhắn trực tiếp phê duyệt SHA 8c32212 và một lần restart backend. Không có lệnh deploy được thực thi |
| H1 | Candidate ledger đã ghép riêng thành phần/case/proof; chưa frozen/accepted. Byte Worker live còn giới hạn như mục 3 |
| H2 | FOUND_REMOTE_HASH_AND_LENGTH_VERIFIED 3/3; hai run GitHub cũ đọc trực tiếp SUCCESS. Local payload không được chuyển |
| H3 | CLOSED_SCOPED_FIXTURE_DELTA cho A11Y-01/02; R5–R7 được giữ, không mở lại whole-app |
| I1 | DOCUMENTED_SUPPORTED_SCOPE; SDK không mở rộng |
| Các ô thiếu live | EVIDENCE_MISSING theo mục 4; chưa FAIL/PASS |
| X, retry/DLQ | DEFERRED_BY_USER |
| Manual restore/RPO-RTO | WAIVED_BY_USER |
| Mainnet/WP30/paid/token mở rộng | NOT_APPLICABLE_TO_THIS_RELEASE |
| G6 independent review/sign-off | Chờ người rà soát độc lập/chủ sản phẩm; tự review diff và CI không được gọi là chữ ký độc lập |

**SDK/API parity I1:** typed SDK catalog hỗ trợ newest/oldest cùng tập filter công bố (limit/cursor/status/metric/q/category). API/UI có thêm ending, price-asc/desc, purchasable, minPrice/maxPrice. Không cam kết parity toàn UI; consumer cần tập mở rộng dùng API được tài liệu hóa. Không thay query builder, webhook format hoặc public SDK contract trong gói sửa lỗi này.

Bổ sung vận hành:

1. Hiện WORKSPACE-RELEASE và FRONTEND-RELEASE vẫn mô tả bản đang phục vụ f314de7/49f2719. Sau khi được phép activate candidate, tạo receipt bổ sung và ghi frontend/backend riêng; giữ nguyên receipt cũ và nối nguồn từ mục 6.
2. Release mới cần full CI đúng SHA, package manifest/hash và preimage runtime/config. Không deploy worktree chưa commit. Backend phải qua native live backup → runtime upgrade input → private recovery/field preservation → reconciliation → admission; fresh login sau admission là hành vi runbook hiện có, không phải yêu cầu test lại tài khoản.
3. Giữ rollback file runtime, launcher, backup helper và recovery pointer trước thay đổi. Nếu lỗi trước admission, theo đường rollback source/pointer đã có; sau admission không reset/restore database để chữa cháy. Giữ immutable assets, nginx, dữ liệu và work holds.
4. Theo dõi backup dưới 90 phút/offhost dưới 150 phút; layout v2 tiếp tục chỉ thêm cloud, local retention 3 verified archives. Không cần OneDrive consent lại. Postcheck liveness và hash không tự là financial acceptance.
5. Muốn bổ sung proof live: trước hết chọn đúng case còn thiếu trong mục 4 và người có thẩm quyền; không dùng lại ngân sách/chữ ký/đơn 1–7 hoặc giải phóng 95 hold. Mọi hiện vật private ở ngoài Git.

## 6. Bằng chứng cuối và công việc cần thẩm quyền

**Candidate 8c32212 đã sẵn sàng về mặt kỹ thuật; chưa phát hành.** CI [40091058726](https://github.com/tanka420/group-deal/actions/runs/40091058726) SUCCESS, 78/78 gate; artifact được download và đối đúng SHA, completeScope=true. Preflight xác minh 397 tệp runtime, 4 tệp đổi, 186 tệp frontend, môi trường/nginx/launcher/helper đúng preimage, backup/offhost còn mới. Payload chỉ được stage trong incoming; chưa sao chép vào thư mục runtime/public đang phục vụ.

Lệnh `node .cache/post-review-8c32212/release.cjs --activate` bị cơ chế duyệt tự động từ chối trước CreateProcess. Lý do trả về: “This activates a release on the shared VPS, mutates runtime/public files, and restarts the backend; the transcript contains no trusted user message explicitly authorizing this exact deployment and service disruption.” Đây là blocker phê duyệt, không phải CI/preflight thất bại. Không thử cách deploy khác hoặc bỏ gate. Cần một tin nhắn trực tiếp xác nhận **phát hành SHA 8c32212 lên VPS Arc Testnet, gồm cập nhật runtime/public và một lần restart backend theo runbook**.

Quan sát chỉ đọc mới nhất 2026-10-24T12:36:39.821Z: HTTP health 200/OK, chain 5042002/protocol v1/Hub đúng; backup source f314de7 có private restore verification, offhost layout v2 cùng SHA, khoảng 36.6/25.0 phút tuổi tại thời điểm quan sát. Không có restart, deploy, migration hoặc thay dữ liệu nghiệp vụ.

Các bước phụ thuộc còn lại sau phê duyệt: recheck preflight/freshness → native live backup/runtime input → private recovery/field preservation/reconciliation → admission/start backend → activate static → HTTPS/hash/HTTP/smoke và backup/offhost postcheck của source mới. Chưa chạy và chưa gán PASS cho các bước này. CI không cần chạy lại khi source/artifact không đổi; preflight phải kiểm lại trạng thái hiện hành.

Private evidence: `reports/evidence/post-review/2026-10-24/FINAL_CANDIDATE_LEDGER.json`, `PROOF_CATALOG.json`, `ACCEPTANCE_MATRIX.json`, `CHECKS.json`, CI_CHECKS_FINAL, PREFLIGHT_FINAL, READ_ONLY_HEALTH_FINAL và ACTIVATION_BLOCKED. Hai CURRENT nối CHECKS bổ sung mới và giữ toàn bộ overlay/proof cũ; mọi cờ nghiệm thu vẫn false. Script/package tiếp tục ở `.cache/post-review-8c32212/`, có manifest/digest và runbook để thực hiện đúng candidate sau phê duyệt.

Tất cả private evidence, database, archive, cấu hình/credential, screenshot và trace ở ngoài Git. Report này và addendum phiên bản là phần tài liệu public.

Phần không thể tự khép bằng quyền/phạm vi hiện hành:

- Phê duyệt trực tiếp phát hành đúng 8c32212 và restart backend theo runbook để vượt blocker A1; không cần người dùng đăng nhập, OTP, ký ví hoặc thao tác trình duyệt cho lần phát hành này.
- Chủ tài khoản/chủ ví/actor được phân quyền thực hiện đúng các ca live còn hiệu lực đã liệt kê (hoặc chủ sản phẩm quyết định thu hẹp/miễn). Không yêu cầu thực hiện lại positive journey đã xong.
- Chủ Cloudflare/nguồn artifact cấp quyền đọc code hoặc cung cấp digest deployment đáng tin nếu muốn khép byte provenance Worker. Hiện có HTTP 401 và action đọc nội dung bị auto-review từ chối; chưa tạo quyền hoặc đăng nhập mới.
- Người rà soát độc lập và chủ sản phẩm quyết định freeze, acceptance matrix còn hiệu lực, chấp nhận ngoại lệ provenance và ký bàn giao/nghiệm thu G5/G6.

Không có giao dịch, đơn, dispute, webhook replay, outage hoặc tác động đến đơn 1–7/95 hold được tạo để lấy proof. Không thay principal, signer/authority, custody, DNS, hạ tầng hoặc tài khoản dịch vụ. Đây là báo cáo thực thi và bàn giao, **không phải biên bản nghiệm thu toàn dự án**.
