# GroupDeal kiểm thử phục hồi và nghiệm thu triển khai

Phần 2 của lộ trình và nghiệm thu, gồm mục 5–9. Đọc cùng [Lộ trình và ma trận yêu cầu](./03_LO_TRINH_VA_NGHIEM_THU.md); checklist áp dụng toàn bộ đặc tả sản phẩm và kỹ thuật.

[Mục lục](./README.md) · [Phần trước](./03_LO_TRINH_VA_NGHIEM_THU.md)

## 5 Kiểm thử lỗi và phục hồi

| Sự cố đưa vào có chủ đích | Kết quả phải thấy |
|---|---|
| User từ chối ký trước broadcast | UI rõ, không có financial success; không giữ tài nguyên vô thời hạn |
| RPC/provider timeout sau broadcast | Operation còn recoverable; không gửi buy/claim lần hai từ suy đoán HTTP |
| Receipt revert | Đúng failed reason/state, không tạo order hoặc allocation thành công |
| Tx replaced cùng/khác calldata | Chỉ đúng intent được xác nhận; nonce tiêu thụ bởi call khác được phân loại riêng |
| Indexer đến trước API | Order/binding tồn tại đúng chain evidence; private metadata hợp nhất không mất |
| API đến trước indexer | Receipt verified nhưng projection pending được thể hiện đúng; eventual consistency kiểm được |
| Logout/account/wallet đổi khi RPC đang chờ | Intent cũ không bị dùng cho account/authority mới; principal cũ không đổi |
| Delivery provider retry/callback trùng | Không cấp key/seat/quyền lần hai; không delivered từ callback chưa xác minh |
| Email/webhook outage/restart | Job bền vững, retries/dedup, DLQ/redrive; không lộ entitlement hoặc gửi nhầm account |
| RPC nhầm chain/projection khác deployment | Startup/read/action fail với reason; không healthy hay tính claim từ scope sai |
| Xóa/sửa một order, hai sai lệch bù nhau | Per-order reconciliation phát hiện, không chỉ kiểm tổng |
| Mất WebSocket/checkpoint gap | HTTP backfill, không thiếu/trùng event; nguồn thứ tự canonical |
| Rebuild/restore | Projection khớp chain tại block kiểm; private metadata còn; workers không phát lại side effect |
| App/backend/evidence service dừng | Buyer fallback mở dispute đúng thời hạn và scope đã cam kết |

Test fixture được dùng để kiểm có kiểm soát và tạo lỗi tái hiện. Nó không thay buổi nghiệm thu trên các tích hợp live. Đưa secret/private evidence khỏi test output, trace và artifact chia sẻ.

## 6 Các hành trình nghiệm thu Arc Testnet

Chuẩn bị ít nhất seller principal, buyer Circle, buyer external, operator và các thành viên Security Multisig theo quyền thật. Số buyer bổ sung theo scenario/race. Không dùng một private key làm seller, buyer, operator và security để chứng minh phân quyền.

### Hành trình A mua và giao thành công

1. Seller đăng nhập, xác minh payout và tạo product/license cùng hồ sơ rights hợp lệ.
2. Chuẩn bị tài nguyên/adapter, delivery test và tạo campaign thật có 2–5 tiers.
3. Publish qua ứng dụng với chữ ký đúng seller; contract receipt/event/terms và public campaign khớp.
4. Buyer Circle dùng OTP và buyer external dùng ví đã bind; có USDC/gas, thấy commitment/terms và mua qua UI.
5. Dùng quantity/buyer phù hợp để mở tier tiếp; verify giá khóa và metric ở từng order.
6. Campaign finalise; rebate đúng, seller giao entitlement thực; buyer truy cập/sử dụng được theo snapshot.
7. Buyer xác nhận hoặc order settlement theo timeout hợp lệ; buyer rút rebate, seller rút proceeds.
8. Receipt/indexer/order view và reconciliation tại cùng block khớp. Support, notifications và các tác vụ liên quan có proof phù hợp.

### Hành trình B không giao đúng hạn

1. Campaign/order thật qua workflow sản phẩm; giữ delivery không hoàn tất.
2. Sau SLA hợp lệ, buyer dùng breach flow; không có allocation seller cho phần sản phẩm chưa phân bổ.
3. Nếu buyer đã rút rebate trước, refund mới vẫn claim được.
4. Verify contract allocation/claims/balance, projection và UX; retry không trả lần hai.

### Hành trình C giao hàng và tranh chấp

1. Giao entitlement thật và ghi delivery proof; cửa sổ 48 giờ theo chain được hiển thị.
2. Buyer mở dispute, bổ sung evidence private; operator đúng authority giải quyết full hoặc partial.
3. Buyer/seller claim đúng hai principal; order khác không bị ảnh hưởng.
4. Kiểm branch hết cửa sổ, confirm trước dispute và competing actions theo thứ tự chain.

### Hành trình D sự cố và khôi phục

1. Tạo buy/claim/delivery pending; làm mất acknowledgement, reload hoặc đổi thiết bị và resume cùng operation.
2. Dừng thành phần chính, thử dispute fallback cho external và embedded theo dependency đã công bố.
3. Diễn tập Security Multisig cancellation trên campaign thử của release, kiểm phần unallocated và audit.
4. Rebuild projection, restore backup vào môi trường riêng, validate keys/private data và reconcile trước mở worker.

### Hành trình E tích hợp và hậu mãi

1. Buyer nhận license/file/invite hoặc provider entitlement thực theo từng adapter được hỗ trợ.
2. Seller receiver nhận webhook signed, trùng event/restart không lặp business effect; retry/DLQ/redrive hoạt động.
3. SDK được cài từ package đóng gói; example chạy, types đúng; public API/widget chỉ lộ dữ liệu cho phép.
4. Email thực tới verified contact; inbox/preferences/support/eligible review và seller reply chạy qua UI.
5. Kiểm Vietnamese/English core và responsive, keyboard, focus, lỗi provider trên các màn của ba vai trò.

Không đổi SLA/cửa sổ live để làm scenario nhanh mà vẫn ghi đã nghiệm thu policy 24/48 giờ. Kiểm boundary bằng thời gian điều khiển ở local test; live evidence cần mốc và interval đúng policy đang được phát hành.

## 7 Hồ sơ bằng chứng

Một release nghiệm thu có release ID, source commit/fingerprint, lockfile/runtime/compiler, build hash, manifest hash, chain/hub/deployment block, ABI/protocol versions và authority mapping. Đây là dữ liệu của dự án mới; không dùng lại hồ sơ candidate cũ.

| Lớp | Bằng chứng |
|---|---|
| Contract/accounting | Commands/environment, model/test version, fuzz seeds, results, gas/batch bounds và coverage các invariant |
| API/data | Schema/ACL/concurrency/idempotency/receipt/projection tests; migration/restore validation |
| Browser | Vai trò, viewport/locale, journey steps, expected/actual, screenshot đã lọc riêng tư; fixture và live ghi rõ |
| Provider/delivery | Provider request/operation IDs được redacted, bằng chứng buyer nhận quyền; callback/receiver tests |
| Arc | Tx hash, receipt status, block/hash, emitter/log/event args, principal và explorer link |
| Tài chính | Per-order/campaign allocations/claimed, liability, hub balance/surplus tại cùng block và kết luận reconciliation |
| Vận hành | Metrics/alert proof, outage/rebuild/backup restore drill, runbook và owner xử lý |
| Review cuối | Người rà soát, phạm vi/candidate, findings, fix verification, accepted decisions và sign-off |

Screenshot thành công không thay receipt. Receipt của primitive script không thay hành trình UI/API. Test local PASS không chứng minh provider đã chạy thật. Bằng chứng của source/deployment cũ không tự áp dụng source/deployment mới.

## 8 Điều kiện hoàn tất dự án

- [ ] Toàn bộ R01–R17 có evidence và các quyết định mở ảnh hưởng release đã được chốt.
- [ ] Seller tự tạo/publish/vận hành campaign và buyer tự mua/nhận hàng bằng cả Circle và external wallet.
- [ ] Các nhóm delivery hoạt động đúng sản phẩm/điều khoản, không chỉ phát placeholder key/link.
- [ ] Giá, rebate, refund, dispute, cancel, buyer/seller claim và principal đúng; không double pay hoặc chuyển quyền do account change.
- [ ] Pending/revert/replacement/provider/indexer lag và recovery được kiểm; không có trạng thái success tài chính giả.
- [ ] Per-order reconciliation, rebuild và restore đã thử trên release; private data/keys có kế hoạch phục hồi.
- [ ] Support/review/notifications/profile/share/API/SDK/webhook và quyền operator hoạt động.
- [ ] Responsive, keyboard/focus, Vietnamese/English core và trạng thái lỗi/empty/loading đạt trên các màn bắt buộc.
- [ ] Có cấu hình môi trường, secret handling, CI, health/alerts, dependency review, runbook và người nhận vận hành.
- [ ] Bản Arc triển khai được verify; principal độc lập; không còn lỗi chặn tài chính/auth/receipt/custody hoặc chức năng bắt buộc.
- [ ] Review độc lập và chủ sản phẩm nghiệm thu cùng source/build/manifest.
- [ ] Người mới có thể từ fresh checkout làm theo tài liệu cài, cấu hình, deploy và chạy một hành trình mà không cần kiến thức ngầm.

## 9 Bàn giao cho người triển khai và vận hành

Bản bàn giao cuối của dự án mới cần repository/source tag, lockfile, deployment manifest công khai, ABI/schema/OpenAPI/SDK, hướng dẫn cài và cấu hình, migrations, test commands, sample receiver, runbook, release evidence và decision log. Credential được chuyển qua kênh quản lý secret phù hợp; tài liệu chỉ nêu tên cấu hình và owner.

Tài liệu cài/deploy phải dùng command thật của codebase mới và được thử từ máy/checkout sạch. Không copy command cũ rồi giả định chạy được. Nghiệm thu cả việc người tiếp nhận tái hiện hành trình và restore drill; đây là phần làm cho dự án có thể vận hành tiếp.
