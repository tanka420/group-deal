> Chuẩn bị nghiệm thu 26/10/2026: FE/BE 8c32212; 397 runtime và 186 static files trên VPS khớp artifact lúc 08:30 giờ Việt Nam; observer UP, 95 hold giữ nguyên. Đã có [checklist 32 ca và packet bàn giao](THUC_THI_SAU_REVIEW_2026-10-26.md); đã chốt giữ 23 ca chưa đủ bằng chứng, không miễn mới; T được chỉ định review/nhận vận hành, chưa xác nhận độc lập hoặc ký G6. G5/G6 OPEN; các cờ nghiệm thu false. Nội dung cũ bên dưới giữ theo thời điểm gốc.

> Cập nhật phát hành sau phê duyệt 24/10/2026, 23:24 giờ Việt Nam: **FE/BE đều đã lên 8c32212**; CI 78/78 PASS, native recovery/admission/reconciliation đạt, 185 tệp HTTPS + 22 tuyến + 2 smoke đạt, backup/private restore/offhost v2 xác minh, observer UP. 95 hold giữ nguyên. Xem [biên bản phát hành và bước tiếp theo](THUC_THI_SAU_REVIEW_2026-10-24_02.md). **G5/G6 OPEN, các cờ nghiệm thu false.** Blocker activation ghi dưới đây đã được giải quyết bằng phê duyệt trực tiếp; các phần cũ giữ theo thời điểm gốc.

> Bổ sung sau review 24/10/2026: candidate **8c32212** đã sửa F1/F2 và lỗi focus/reflow liên quan, full CI **78/78 PASS**, preflight VPS đạt. **Chưa phát hành:** activate bị duyệt tự động chặn, cần tin nhắn phê duyệt trực tiếp SHA và restart backend. VPS vẫn FE 49f2719 / BE f314de7. Xem [báo cáo thực thi/candidate ledger/acceptance matrix](THUC_THI_SAU_REVIEW_2026-10-24.md). G5/G6 OPEN và các cờ nghiệm thu vẫn false; nội dung dưới đây giữ theo thời điểm gốc.

# Phạm vi còn lại của G5/G6 — 24/10/2026

G5 là nghiệm thu các nhánh vận hành trên Arc Testnet bằng bằng chứng thực tế. G6 là rà soát độc lập và ký nhận bàn giao trên một bộ phiên bản xác định. Một nhánh chưa đủ bằng chứng live không đồng nghĩa chức năng đó chưa được lập trình, chưa có kiểm tra tự động hoặc phải làm lại những hành trình đã hoàn tất.

## Phần đã hoàn tất

| Hạng mục | Kết quả đã ghi nhận |
|---|---|
| Frontend đang phục vụ | `49f2719d8c114bb380a16ab87c128b740c47dadc`, đã lên VPS và local |
| Backend đang phục vụ | `f314de7fc47b77055b25615209dbdb8bd867853e`; gói API workspace và dependency recovery đã phát hành |
| CI của mã ứng dụng | [49f2719 — 78/78 bước PASS](https://github.com/tanka420/group-deal/actions/runs/40063311147); [f314de7 — 78/78 bước PASS](https://github.com/tanka420/group-deal/actions/runs/40002078347) |
| Đối chiếu frontend sau phát hành | 185 file HTTPS đúng hash, 22 tuyến/ranh giới HTTP và kiểm tra header trên trình duyệt; xác minh ngày 24/10 |
| UI workspace và header | Lịch sử/phục hồi 20 bản ghi/trang; `@handle` tạo một lần; hoạt động mua/bán GroupDeal; tier đúng metric; tổng quan/sidebar người bán; danh sách/phân trang; tab quyền quản trị; footer/ticket; dropdown bám header, VI/EN công khai và điều hướng desktop căn giữa |
| OneDrive | Backup định kỳ và giám sát đã hoạt động; layout v2 đã áp dụng, 56 cặp lịch sử đã tổ chức/kiểm hash; 4 archive thiếu manifest giữ riêng |
| Backup sau nâng backend | Có private restore verification và offhost round-trip layout v2 ngày 24/10; không còn việc rollout dependency recovery hoặc đưa bản claims cũ lên offhost được liệt kê là chưa làm |
| Các hành trình live đã hoàn tất | Giữ bằng chứng GitHub/Discord, Circle, quyền/ticket/email và LICENSE_KEY/FILE_LINK/WEBHOOK theo phạm vi, thời điểm gốc. Luồng Webhook đơn 7 và các khoản claim đã xong không được lặp lại để bổ sung hồ sơ |

Biên bản private: `operations/WORKSPACE-RELEASE.json` ghi gói backend/workspace; `operations/FRONTEND-RELEASE.json` ghi frontend mới nhất trên VPS. Bản đồng bộ tài liệu đứng sau các commit trên không phải một lần build/deploy mã ứng dụng mới.

## G5: đối chiếu từng nhóm còn thiếu bằng chứng

Bảng này diễn giải 14 nhóm trong `G5_SOURCE_PROOF_MAP.json` ngày 21/10, đối chiếu với các biên bản phát hành ngày 23–24/10. Không tạo một danh sách yêu cầu lập trình mới và không biến tất cả các ô live chưa khép thành lệnh chạy lại toàn bộ hệ thống.

| Mã | Nhóm | Phần còn mở theo hồ sơ | Phần đã chốt / giới hạn hiện hành |
|---|---|---|---|
| G5-01 | Tài khoản, danh tính, quyền | Badge/quyền truy cập ở ca bị từ chối; chặn hành động mới nhưng giữ nghĩa vụ đơn cũ khi quyền đổi; hủy OAuth, ngắt/liên kết lại và social ID trùng giữa hai tài khoản | GitHub/Discord và các lệnh quyền đã có bằng chứng giữ nguyên. X hoãn vì chi phí; không consent hoặc ký lại phần đã xong |
| G5-02 | Ví và funding | Đối chiếu đúng các nhánh funding/recovery/tài sản còn thiếu trong matrix; ca đang SKIP chưa được đổi thành PASS | Đăng nhập Circle, send/swap đã hoàn tất giữ nguyên. Không tự lập thêm swap Testnet tùy chọn hoặc kiểm lại mọi ca ví |
| G5-03 | Publish/edit và riêng tư | Những ca sửa điều khoản, dữ liệu riêng tư và vòng đời quyền chưa được hành trình đã có bao phủ | Không sửa/xuất bản lại chiến dịch đã hoàn tất. Ca badge/ACL dùng chung G5-01, không tính thành hai việc độc lập |
| G5-04 | Mua, tier, quantity | Ranh giới live của early rebate bật/cap, mua lại, tồn kho và giới hạn mỗi tài khoản | Kiểm tra contract/model/CI đã có không bị xóa. Các ca early tắt/quantity đã có không cần chạy lại |
| G5-05 | Phục hồi giao dịch | Nhánh còn thiếu khi đổi phiên/thiết bị, mất acknowledgement, trạng thái chưa rõ, revert hoặc replacement | Phục hồi cùng intent/hash; không gửi lại giao dịch hay đơn đã kết thúc |
| G5-06 | Finalize, hủy và authority | Readiness/quyền kiểm soát Safe trên candidate nghiệm thu cuối và nhánh hủy khẩn cấp còn cần bằng chứng theo matrix | Giữ các bằng chứng authority trước đó đúng thời điểm. Tài liệu này không yêu cầu một chữ ký hoặc thao tác hủy mới |
| G5-07 | Giao hàng, entitlement | Các ca âm tính/vòng đời resource chưa được các hành trình giao thành công bao phủ | Giao/tải/sử dụng thật và claim của Webhook đơn 7 đã hoàn tất. Retry/DLQ theo G5-11 đang hoãn |
| G5-08 | Xác nhận, tranh chấp | Những nhánh partial, cửa sổ thời gian, fallback và outage chưa có bằng chứng live | Luồng xác nhận đã hoàn tất giữ nguyên; không tạo tranh chấp trên đơn cũ để dựng tình huống |
| G5-09 | Claim | Những ca cumulative, batch, sai authority hoặc phục hồi chưa được bằng chứng đã có bao phủ | Các khoản đã claim không rút lại để lấy bằng chứng mới |
| G5-10 | Projection, đối soát | Nhánh rebuild/outage và phục hồi projection/reconciliation còn thiếu theo đúng phạm vi | Đối soát/native admission của lần nâng backend đã có biên bản. Restore thủ công và đo RPO/RTO đã miễn, không mở lại |
| G5-11 | SDK/webhook retry | Retry hết lượt, DLQ và redrive trên hệ thống thật: **DEFERRED_BY_USER** | Không gây outage, tạo job lỗi, replay sự kiện hoặc tạo đơn mới. Provider/Worker/conformance trong CI và luồng Webhook dương tính đã có kết quả |
| G5-12 | Hỗ trợ, attachment, email | Các ca vòng đời ticket/attachment/ACL còn thiếu trong matrix | Xác minh contact, ticket/trả lời và nhận email thực tế đã ghi nhận; không thực hiện lại |
| G5-13 | Frontend R5–R7 | Phần live identity chưa khép đối chiếu G5-01; các ca a11y/zoom cụ thể còn thiếu bằng chứng giữ đúng phạm vi trong matrix. Không ghi nhận lỗi UI cụ thể còn mở trong gói vừa phát hành | Gói workspace/header và các kiểm tra phần thay đổi đã đạt. Không mở lại toàn bộ UI/a11y/zoom chỉ vì cờ nghiệm thu tổng vẫn OPEN |
| G5-14 | Vận hành, phát hành | Ghép đúng bộ phiên bản và bằng chứng vào candidate nghiệm thu cuối; phần review độc lập thuộc G6 | Frontend/backend, CI, dependency recovery, backup/offhost và layout OneDrive đã phát hành/xác minh trong phạm vi ghi nhận; không còn là backlog triển khai |

Danh mục này là khoảng trống bằng chứng được kế thừa, không phải một lượt xác minh live mới ngày 24/10. Trước khi kích hoạt một ca còn mở, cần đối chiếu bằng chứng đã có để thu hẹp đúng phần thiếu và giữ các quyết định hoãn/miễn. Không tự dùng lại ngân sách, chữ ký, đơn cũ hoặc 95 tác vụ đang giữ.

## G6: những việc chưa đóng

1. **Chốt bộ candidate nghiệm thu:** frontend `49f2719`, backend `f314de7`, manifest/contract, SDK/provider đang dùng và các tham chiếu bằng chứng tương ứng. Các artifact phát hành đã được ghim; việc đó chưa tự tạo một hồ sơ G5 được ký nhận hoặc đóng băng toàn bộ candidate nghiệm thu.
2. **Khép acceptance matrix:** ghi rõ nhánh nào đã đạt bằng chứng, nhánh còn thiếu, hoãn, miễn hoặc không áp dụng cùng lý do. Các kết quả cũ giữ nguyên thời điểm/phạm vi; CI mới không được dùng thay bằng chứng live chưa có.
3. **Rà soát độc lập:** đối chiếu accounting, signer/authority, phân quyền, riêng tư, UX và vận hành trên đúng candidate. Nếu có lỗi chặn phát hành cụ thể thì sửa và kiểm tra phần bị tác động; không mặc định chạy lại các nhóm đã đạt.
4. **Ký nhận bàn giao:** cập nhật issue ledger, runbook, người nhận vận hành và quyết định nghiệm thu. Chỉ đóng G5/G6 khi các điều kiện còn hiệu lực được xử lý và có xác nhận phù hợp; bản đồng bộ tài liệu này không tự ký nhận thay người rà soát/chủ sản phẩm.

## Các quyết định giữ nguyên

- Retry/DLQ live và tích hợp X: **hoãn**, chưa phải PASS.
- Diễn tập restore thủ công và đo RPO/RTO: **đã miễn**; private restore verification của backup tự động không bị đổi thành một diễn tập thủ công.
- Mainnet, dịch vụ trả phí và token mở rộng: giai đoạn WP30 riêng, không phải công việc triển khai trong gói này.
- G5/G6: **OPEN**; `candidateFrozen=false`, `acceptanceEligible=false`, `wholeProjectAccepted=false` cho hồ sơ nghiệm thu tổng thể.

Nguồn: [trạng thái hiện hành](HOAN_THIEN_DU_AN_HIEN_TAI_2026-10-21.md), [gói UI/phát hành](../docs/workspace-ui-2026-10-22.md), [quy tắc OneDrive](../docs/onedrive-backup.md) và hồ sơ bằng chứng private trong workspace. `CURRENT_G5_PREPARATION_LATEST.json` và `CURRENT_PROJECT_COMPLETION_LATEST.json` được đồng bộ đến chỉ mục mới, giữ tham chiếu đến toàn bộ hồ sơ trước đó. Không đưa các artifact private vào Git.
