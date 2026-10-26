# UAT live phi tài chính sau phê duyệt — 26/10/2026

**Đã tự thực thi UAT trên VPS qua phiên seller đang đăng nhập**, sau câu trả lời trực tiếp “Cho phép tự chạy UAT phi tài chính”. Đây là kiểm bằng dữ liệu tổng hợp riêng trên app thật, không chỉ chuẩn bị hồ sơ. FE/BE vẫn **8c32212fdb051cdb01f98226932f3a61afa3e9bf**. Không sửa mã, deploy/restart hoặc rerun CI đã đạt. **G5/G6 OPEN; candidateFrozen=false, acceptanceEligible=false, wholeProjectAccepted=false.**

Biên bản bổ sung cho [checklist và quyết định giữ đủ 23 ca](CHECKLIST_NGHIEM_THU_G5_G6_2026-10-26.md), [báo cáo chuẩn bị](THUC_THI_SAU_REVIEW_2026-10-26.md) và [bản phát hành 24/10](THUC_THI_SAU_REVIEW_2026-10-24_02.md). Các báo cáo/snapshot trước được giữ nguyên thời điểm; nhận định “chưa chạy live” ở chúng đứng trước lần mở quyền này.

## Kết quả thực thi

| Subcase | Thao tác và kết quả thực tế | Giới hạn |
|---|---|---|
| NF-01 | Tạo sản phẩm riêng UAT_G5_NF_20261026_A và license v1 qua UI; native command CREATE=SUCCEEDED | Không bán hoặc cấp entitlement cho order |
| NF-02 | Tạo version 2 / license 2, đổi edition và seat 1→2; native command VERSION=SUCCEEDED, previousVersionId trỏ đúng v1; cả v1 / license 1 còn nguyên | Bằng chứng vòng đời metadata; chưa phải sửa điều khoản của campaign đã publish |
| NF-03 | Autosave tạo hai draft UAT riêng. A dùng product UAT v2, version 1; B dùng tham chiếu product đã được duyệt, đổi tên/giá/quantity/visibility và lưu đến version 3 | Cả hai DRAFT, chưa có onchainCampaignId, totalGrossCommitted=0; không prepare publish, không chọn/probe resource cũ |
| NF-04 | 6 GET guest đạt: public detail của hai draft trả 404, private draft của hai draft trả 401, private inventory trả 401, public list trả 200 không chứa draft UAT | Đây là guest privacy của draft; chưa đủ cross-account hoặc published/lifecycle acceptance |
| NF-05 | Sản phẩm UAT chưa được duyệt hiển thị thiếu phê duyệt, khóa nút tiếp tục; product đã được duyệt cho phép tiếp tục | Chỉ UI approval guard; không sửa/thu hồi quyền, không gọi publish để ép lỗi; không thay bằng chứng ACL tài khoản bị từ chối/nghĩa vụ cũ |
| NF-06 | SELECT SQLite read-only đối hash **121 bản ghi có sẵn trước/sau: không đổi**. Orders=7, operations=50, emailOutbox=14; native hold có 95 entry, subscriptionApprovals=0; PID 3485467 / NRestarts=0 giữ nguyên | Không xuất payload tài chính/tài khoản cũ; hash/count không thay financial reconciliation |

Dấu kiểm trước: 2026-10-26T02:01:33.931Z; sau: 2026-10-26T02:32:36.810Z (UTC; giờ Việt Nam=UTC+7). Chỉ đọc DB để đối hash/metadata sau thao tác UI; mọi thay đổi dữ liệu UAT đều đi qua native UI/API của app, không sửa trực tiếp DB.

Các collection được giữ nguyên hash cho tất cả bản ghi cũ đã chọn: orders, campaigns, users, products, productVersions, licenseVersions, rights, resourceGrants, operations, emailOutbox. Webhook queue/DLQ/subscription giữ nguyên số lượng; không có thao tác gửi/replay. 7 đơn cũ và 95 hold không bị UAT thay đổi/giải phóng.

## Dữ liệu UAT được giữ lại

| Đối tượng | Định danh/kết quả |
|---|---|
| Product | prd_7bf9c012-905b-4174-9ff8-42d894b17b16; DRAFT; latestVersionId=pv_0b12f5d4-3018-4400-bb2a-b3a3aba0dc90 |
| Hai version/license | Native metadata xác nhận 2 version và 2 license riêng; v1 / license 1 giữ nội dung ban đầu, v2/license2 có content hash riêng |
| Draft A | draft_2b9ab49c-1527-4f48-a88d-153da28ec62a; UAT_G5_NF_20261026_A; DRAFT/PUBLIC, không xuất hiện qua API public |
| Draft B | draft_e8e4f027-a475-44f5-bdbc-458d3acc7f9d; UAT_G5_NF_20261026_B_DRAFT; DRAFT/UNLISTED, version 3 |
| Delta số lượng | products 3→4; productVersions 4→6; licenseVersions 4→6; campaigns 7→9. Orders/operations/grants/rights/outbox/resources/inventory không tăng |

Hai draft được autosave ngay khi chọn product; A có tên UAT ngay từ product mới, B đã đổi sang tên UAT sau khi chọn product được duyệt. Giữ dữ liệu này cho review/tiếp tục nghiệm thu, không tự xóa/cleanup hoặc tác động product/draft lịch sử. Resource và ticket mới chưa được tạo.

## Phần đã gặp giới hạn cụ thể

- **Upload resource:** file tổng hợp đã tạo local nhưng fileChooser.setFiles bị extension Chrome chặn vì thiếu “Allow access to file URLs”. Chưa gửi request upload; resources vẫn 3, licenseInventory vẫn 12. Không bật quyền mới, không lấy token hoặc chuyển sang đường upload khác để vượt chặn. Đây là giới hạn công cụ, không phải FAIL chức năng app. Hướng dẫn của extension: mở chrome://extensions → Details của ChatGPT → Allow access to file URLs ([tài liệu chính thức](https://developers.openai.com/codex/app/chrome-extension#upload-files)); không yêu cầu chủ tài khoản thực hiện trong lượt này.
- **Ticket/attachment:** source SupportService.notify gọi NotificationService cho operator/participant, có thể enqueue email theo contact/preferences hiện có. Vì quyền vừa cấp vẫn cấm gửi email, không tạo/sửa ticket để lấy proof và không tắt email/worker hoặc sửa preference của người khác. SUP-01/02 vẫn thiếu live trong phạm vi này.
- **Ca tài chính/OAuth/quyền/authority:** chưa được mở quyền. Không tạo order/dispute, không prepare/sign/broadcast, không đổi quyền hoặc custody, không ngắt social links. X/retry-DLQ live hoãn; manual restore/RPO-RTO miễn; Mainnet/paid/token ngoài scope.
- **Worker provenance:** giới hạn readback/401 trước đó giữ nguyên, không thử lại; không thuộc quyền UAT phi tài chính vừa mở.

## Matrix và bàn giao

CMP-01/02 được bổ sung **PARTIAL_LIVE_NON_FINANCIAL_PROOF_GAPS_REMAIN**, gắn đúng source 8c32212/thời điểm/lớp proof. Không đóng cả ca hoặc suy UI guard thành account ACL/server publish proof. NF-01..06 là subcase ghi phạm vi thực hiện, không thêm gate bắt buộc mới. **Giữ đủ 23 ca, không miễn ca nào** theo quyết định trước; các phần còn cần chữ ký/actor/dữ liệu riêng giữ OPEN.

Reviewer/người nhận vận hành vẫn mang nhãn **T** theo chỉ định của người dùng; chưa có xác nhận độc lập hoặc chữ ký. G6 review packet mới nối các command receipts/metadata, proof subcase, blockers và matrix mới; không ký thay T hoặc chủ sản phẩm.

Hồ sơ private mới: reports/evidence/live-non-financial/2026-10-26T02-32-45-327Z. Gồm USER_AUTHORIZATION, BEFORE/AFTER hash-only, LIVE-CHECKS, SUBCASE_PROOFS, BLOCKERS, CASE_CHECKLIST, G6_REVIEW_PACKET và DOM/ảnh kết quả UI. Hai CURRENT pointer nối CHECKS mới về snapshot trước. Không commit DB, credentials, file resource, screenshot hoặc evidence private vào Git.

**Phần UAT phi tài chính khả thi với quyền/công cụ hiện có đã được thực thi.** Phần còn lại cần điều kiện đã ghi rõ: đường upload được phép, phạm vi email cho support nếu giữ ca, actor/chữ ký/OAuth cho các nhánh còn lại và review/sign-off của T. Không yêu cầu chạy lại các hành trình positive đã hoàn tất.
