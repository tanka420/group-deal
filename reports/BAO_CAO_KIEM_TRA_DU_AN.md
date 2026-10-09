# Báo cáo kiểm tra toàn diện GroupDeal theo PLAN.md

**Ngày kiểm tra:** 29/09/2026 — **Mốc mã nguồn:** `571593761d41024638cbc85eb3457697dcfaabdb`.

**Kết luận: CHƯA ĐẠT yêu cầu nghiệm thu của PLAN.md; chưa phù hợp để mở vận hành cho người dùng trên Arc Testnet.** Dự án có bộ khung frontend/backend/contract và một số cơ chế đúng, nhưng hiện vẫn mang tính mô phỏng cục bộ. Những điểm chặn chính là chiếm tài khoản qua OTP, khóa riêng ví bị lưu/trả dạng rõ, lỗi bảo toàn và khả năng rút tiền, các luồng offchain chưa nối với contract, cùng indexer/đối soát chưa đủ tin cậy.

Không nên lấy build thành công hay 10 bài test contract đang xanh làm bằng chứng sản phẩm hoàn chỉnh. Năm ca tái hiện bổ sung trong đợt kiểm tra này đều xác nhận lỗi mà bộ test hiện hữu chưa bắt được.

## 1. Phạm vi, phương pháp và giới hạn

Đã đọc PLAN.md và rà soát các lớp: Solidity, interface, deploy/seed; backend routes/services/middleware/store/accounting; frontend pages/components/context/cấu hình; SDK; tài liệu và package/lockfile. Đối chiếu cả đường đi từ UI đến API, từ API đến chain và chiều ngược lại. Không tìm thấy AGENTS.md trong danh sách file dự án được kiểm tra.

Đã chạy build, test có sẵn, truy vấn npm audit và script tái hiện độc lập trên Hardhat cục bộ. Đã kiểm tra tài liệu Arc/Circle chính thức cho các nhận định tích hợp. Không sửa logic sản phẩm, không triển khai contract, không gửi giao dịch tới mạng công khai, không thay đổi PLAN.md. PLAN.md đã là file untracked trước đợt kiểm tra.

Phân loại bằng chứng:

- **Đã tái hiện:** có thực thi cục bộ và assertion xác nhận hành vi.
- **Mã nguồn:** kết luận từ đường thực thi cụ thể; chưa khai thác trên một hệ thống đang triển khai.
- **Chưa xác minh:** không có bằng chứng triển khai/live hoặc không thực hiện kiểm tra đó; không suy diễn thành đã đạt.

Đã bổ sung kiểm thử thao tác trình duyệt với frontend và backend thật trên dữ liệu cục bộ riêng; kết quả chi tiết ở mục 13. Giới hạn: chưa hoàn tất E2E tài chính trên Arc/Circle live, audit accessibility chuyên dụng, tải lớn, pentest hạ tầng hoặc khôi phục backup thực tế. Chưa xác minh quyền phân phối các sản phẩm được seed. Không thể chứng nhận “không còn lỗ hổng” chỉ bằng đợt rà soát này. Những mục ghi “không tìm thấy” là trong repository hiện tại, không kết luận về hệ thống ngoài repository.

Mức ưu tiên:

- **P0:** chặn phát hành; có thể chiếm tài khoản/khóa ví hoặc phá bảo toàn, khóa quyền nhận tiền.
- **P1:** phải hoàn thành trước nghiệm thu; luồng cốt lõi sai/thiếu hoặc kiểm soát bảo mật quan trọng không đáp ứng.
- **P2:** cần cải thiện để vận hành ổn định, đầy đủ và dễ bảo trì.

## 2. Kết quả chạy kiểm tra

| Kiểm tra | Kết quả thực tế | Ý nghĩa/giới hạn |
|---|---|---|
| `npm run build --prefix backend` | PASS | TypeScript biên dịch được; không kiểm tra đúng nghiệp vụ |
| `npm run build --prefix frontend` | PASS | Vite 5.4.21; JS 655,15 kB, gzip 225,69 kB; cảnh báo chunk >500 kB |
| `npm test` tại root | Ban đầu lỗi môi trường Hardhat `EEXIST ... hardhat-nodejs/Data` | Lệnh tổng dừng trước test accounting; không phải assertion contract thất bại |
| Contract test với LOCALAPPDATA tạm và `--no-compile` | **10 passing** | Dùng artifacts sẵn có; source GroupDealHub trong build-info khớp nguyên văn source hiện tại, solc 0.8.24. Không phải fresh compile |
| `npm run test:accounting --prefix backend` | PASS | Các assertion tính toán tĩnh; chưa phải state machine độc lập đầy đủ |
| `npm run build --prefix sdk` | FAIL: không tìm thấy `tsc` | SDK chưa có toolchain được cài tại package này; đồng thời repository không có sdk/tsconfig.json |
| `reports/audit-repro.cjs` | **5/5 hành vi lỗi đã tái hiện** | Assertion của script xác nhận lỗi hiện tại, không phải 5 acceptance tests đạt |
| npm audit backend | 0 advisory được báo | Không chứng minh backend an toàn; lỗi OTP/khóa ví là lỗi ứng dụng |
| npm audit frontend | 2: 1 high, 1 moderate | Chủ yếu công cụ Vite/esbuild |
| npm audit contracts | 46: 17 high, 10 moderate, 19 low | Tính theo package chịu ảnh hưởng, có quan hệ phụ thuộc; không phải 46 lỗi Solidity độc lập |
| Arc Testnet E2E / Circle EOA live | Chưa xác minh | Manifest hiện có là Hardhat chain 31337 |

Môi trường thực thi: Windows PowerShell, Node v24.11.1, npm 11.6.2. Npm audit ban đầu bị hạn chế mạng; truy vấn lại với quyền truy cập mạng đã thành công. Không chạy `npm audit fix` hay nâng dependency trong đợt kiểm tra.

### 2.1. Tái chạy các bằng chứng

Trong thư mục `E:\apps\group-deal\contracts`:

```powershell
$env:LOCALAPPDATA = Join-Path $env:TEMP 'groupdeal-audit-hardhat'
.\node_modules\.bin\hardhat.cmd test --no-compile
.\node_modules\.bin\hardhat.cmd run ..\reports\audit-repro.cjs --no-compile
```

Script chỉ triển khai MockUSDC và Hub trên mạng Hardhat mặc định trong tiến trình; không thêm `--network arcTestnet`. Nếu dùng sau khi đổi source, phải compile lại và xác minh artifact trước khi tin kết quả.

Đầu ra đã quan sát:

```text
CONFIRMED F03: rebate claimed first; later 90 USDC refund cannot be claimed.
CONFIRMED F04: cancelled delivered order allocates 190 USDC against 100 USDC committed.
CONFIRMED F05: sold-out final order receives 0 rebate instead of 50 USDC.
CONFIRMED F07: nonzero fee accepted; 10 USDC remains without a fee claim path.
CONFIRMED F10: canonical serialization ignores nested tier threshold and price.
```

## 3. Ma trận bám sát kế hoạch

“Một phần” nghĩa là đã có thành phần tương ứng nhưng chưa đủ luồng hoặc đang có lỗi; không đồng nghĩa được nghiệm thu.

| Yêu cầu PLAN | Hiện trạng | Khoảng cách chính |
|---|---|---|
| Mục tiêu sản phẩm hoàn chỉnh trên Arc Testnet | **Chưa đạt** | Manifest Hardhat; ví nhúng localhost; publish/giao hàng/resolve chỉ DB |
| 1. Sản phẩm số thật, mỗi order có quyền riêng | Một phần | Có lưu entitlement mã hóa; chưa có inventory license, file bảo vệ, kích hoạt/API thực tế |
| 1. Tiếng Việt chính, English các luồng cốt lõi | Một phần | Có dictionary VI/EN nhưng nhiều đoạn checkout, dispute, seller, operator hardcode VI |
| 1. Account đồng thời buyer/seller | Có | Mảng roles hỗ trợ; kiểm soát đăng nhập hiện không an toàn |
| 2. Email OTP | **Không đạt bảo mật** | Trả OTP trong response, log OTP, không gửi email thật |
| 2. Circle User-Controlled EOA / ví ngoài | **Chưa đạt** | Circle chỉ là ethers.Wallet tạo tại backend; ví ngoài có ký nhưng thiếu challenge server |
| 2. Campaign, tier, seller, thời gian, giao hàng | Một phần | Có UI; số buyer không được index; điều khoản/giá có thể lệch chain |
| 2. Tiền cam kết + gas trước phê duyệt | Một phần | Tiền hợp đồng dùng integer; gas UI cố định; hiển thị Number/toFixed |
| 2. Pending/revert/provider/indexer chậm | **Chưa đạt** | Hash trả sau wait; catch chung báo FAILED; thiếu reconciling |
| 2. Order, entitlement, rebate/refund/claim | Một phần | Có UI/call claim; thiếu projection claim; lỗi refund sau claim rebate |
| 2. Confirm/dispute/bổ sung chứng cứ/support/review | Một phần | Confirm/dispute có call chain từ UI; backend vẫn cho ghi DB riêng; thiếu bổ sung evidence; support IDOR |
| 3. Seller profile + chứng minh ví | Một phần | Verify chữ ký bất kỳ, không ràng buộc account/nonce/domain/expiry |
| 3. Draft/test/publish | **Chưa đạt** | Dry-run chỉ encrypt/decrypt; publish không createCampaign |
| 3. Public/unlisted | Một phần | Backend có field; UI luôn PUBLIC; ID dễ đoán; draft lộ qua GET |
| 3. Tier/metric/inventory/SLA/early rebate | Một phần | Nhiều field có; UI thiếu phần trăm, chính sách hủy; validation chưa đầy đủ |
| 3. Giao license/file/activation/webhook | Một phần | Thực tế chỉ lưu một chuỗi mã hóa; loại phương thức không được triển khai thành adapter |
| 3. Reply support/review; hồ sơ seller/chỉ số | Một phần | Có API reply review; thiếu UI tương ứng và trang profile/chỉ số đầy đủ |
| 3. Link/QR/ảnh/widget | Một phần | Link và QR có; iframe trỏ JSON; chưa có ảnh chia sẻ theo campaign |
| 3. Hai loại xác minh | Một phần | Hai boolean đều gắn seller; quyền phân phối chưa gắn product/campaign |
| 4. 2–5 tier, 24h–30d, UTC | Có nền tảng | Contract kiểm tra; backend còn clamp/mặc định và chưa validate toàn bộ |
| 4. Sửa/rút trước commit, khóa sau commit | Một phần | Contract chỉ sửa termsHash; thiếu edit cấu hình đầy đủ; publish lặp sửa giờ DB |
| 4. Tier không lùi sau hủy hợp lệ | Một phần | Tier chỉ tăng; chưa có luồng buyer hủy hợp lệ để kiểm chứng |
| 5. Commit theo giá hiện tại, giá cuối chung | Một phần | Logic có; sold-out bỏ rebate order cuối |
| 5. Early rebate slot, first unit, fail khi hết | Một phần | Slot onchain có; thiếu validate và xử lý first-unit cap khi giá giảm mạnh |
| 5. Integer USDC | Chủ yếu có | Solidity/BigInt đúng nền tảng; UI/form cần decimal string, không làm tròn quyết định tài chính |
| 6. Identity/account, unique binding, principal bất biến | Một phần | Pin onchain có; identity phụ thuộc JWT secret; JSON không có unique constraint giao dịch |
| 6. Authorization đủ ràng buộc, chống replay | Một phần | EIP-712/domain/nonce có; ký trần tài khoản thay quantity; fallback khi RPC lỗi |
| 6. Không đưa PII lên chain | Có nền tảng | Identity hash; cần bỏ cam kết “không liên kết được” vì cùng địa chỉ ví vẫn liên kết công khai |
| 7. SLA/refund/dispute/per-order arbitration | Một phần | Contract có cơ chế; offchain không phản ánh chain; cancel phá allocation |
| 7. Tranh chấp trực tiếp + emergency ví nhúng | Một phần | Hai hàm contract có; chưa có cơ chế buyer tự giữ/sử dụng emergency khi backend/Circle ngừng |
| 8. Pull claim không hết hạn | Một phần | Không có expiry; boolean buyerClaimed khóa refund phát sinh sau |
| 8. Conservation, retry/concurrency | **Không đạt** | Cancel rồi settle vượt gross; indexer không dedup; test thiếu lịch thao tác cạnh tranh |
| 8. Hủy chỉ Security Multisig | **Không đạt** | onlyOperator gồm operator và owner; không có role multisig riêng |
| 8. Phí 0, version chính sách | **Không đạt** | Contract chấp nhận phí khác 0; thiếu fee allocation/claim và version dữ liệu |
| 9. Chain là nguồn sự thật, rebuild/reconcile | **Không đạt** | API/worker tự ghi số tiền; indexer chỉ bốn listener; reconcile không đối chiếu |
| 9. Logic cố định, xử lý từng phần | Một phần | Không có proxy upgrade trong repo; finalize/cancel quét toàn bộ order |
| 10. Dashboard/email/notification/support/review | Một phần | Ba dashboard có; thiếu email/notification, seller thread UI/chỉ số đầy đủ |
| 10. Public API/event/SDK/webhook retry/DLQ | Một phần | Có API và HMAC; thiếu schema chuẩn, durable retry/idempotency/DLQ; SDK chưa build |
| 10. Secret/RBAC/audit/rate limit/ops/backup | **Chưa đạt** | Default secrets, không MFA/rate limit, JSON store, audit cắt 1000, thiếu runbook/CI |
| 11. Reference model/property/fuzz/E2E/outage/restore | **Chưa đạt** | 10 contract tests và model phép tính; không có browser/API E2E hay stateful differential fuzz |
| 11. Nghiệm thu bản triển khai | **Chưa có bằng chứng** | Không có deployment receipts/live journey/reconciliation/monitoring trên Arc |

## 4. Phát hiện chi tiết và hướng sửa

### F01 — P0 — OTP cho phép đăng nhập tài khoản bất kỳ, kể cả operator

**Bằng chứng mã nguồn:** [authService.ts](E:/apps/group-deal/backend/src/services/authService.ts:10), [authRoutes.ts](E:/apps/group-deal/backend/src/routes/authRoutes.ts:8), [index.ts](E:/apps/group-deal/backend/src/index.ts:43), [App.tsx](E:/apps/group-deal/frontend/src/App.tsx:67).

`requestOtp()` trả `code` trực tiếp cho caller và ghi email + OTP ra console, không có điều kiện môi trường. Backend luôn tạo account operator đã có quyền; UI còn có nút đăng nhập admin bằng OTP trả về. Người không kiểm soát mailbox vẫn có thể request OTP rồi verify bằng response. `Math.random` không phù hợp cho OTP và không có rate limit/giới hạn thử.

**Tác động:** chiếm tài khoản ứng dụng, đọc dữ liệu riêng, thao tác operator; kết hợp F02 có thể lấy khóa ví người dùng đã đăng ký. Không khẳng định operator API tự nó đã gửi giao dịch onchain, vì hiện resolve API chỉ ghi DB.

**Sửa:** OTP CSPRNG, lưu hash, gửi qua email provider, không trả/log OTP, TTL và single-use nguyên tử, giới hạn IP/email/device và số lần thử. Bỏ admin shortcut và seed role mặc định khỏi runtime. Seller/operator cần MFA/passkey hoặc step-up auth cho thao tác nhạy cảm. Test account takeover và enumeration bắt buộc.

### F02 — P0 — Ví “Circle” thực chất là khóa riêng dạng rõ tại backend và browser

**Bằng chứng mã nguồn:** [authService.ts](E:/apps/group-deal/backend/src/services/authService.ts:44), [authRoutes.ts](E:/apps/group-deal/backend/src/routes/authRoutes.ts:79), [Web3Context.tsx](E:/apps/group-deal/frontend/src/context/Web3Context.tsx:77), [operatorRoutes.ts](E:/apps/group-deal/backend/src/routes/operatorRoutes.ts:69).

Backend dùng `ethers.Wallet.createRandom()`, gán `wallet.privateKey` vào field tên `encryptedPrivateKey`. Dữ liệu không được mã hóa; response verify/me/bind/profile trả nguyên user. Operator `/sellers` cũng trả nguyên user của seller, nên các seller có ví kiểu này bị lộ khóa cho operator. Frontend dựng signer từ chính khóa đó. Không có Circle SDK/API integration tương ứng trong source/package.

**Sửa:** tích hợp Circle User-Controlled EOA thực, lưu wallet/provider identifiers và trạng thái challenge; DTO allowlist tuyệt đối không chứa khóa riêng. Với dữ liệu từng đưa ra môi trường dùng thật cần đánh giá khóa đã lộ, xử lý di chuyển tài sản theo quyền của chủ ví; không thể “đổi khóa” mà giữ nguyên EOA/principal đã ghim. Thiết kế khôi phục và emergency dispute trước khi mở lại dịch vụ.

### F03 — P0 — Claim rebate trước làm refund phát sinh sau không rút được

**Đã tái hiện:** [GroupDealHub.sol](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:605), script audit F03.

`buyerClaimed` là boolean dùng cho toàn bộ đời order. Buyer cam kết 100, được rebate 10 rồi claim; seller không giao đúng SLA tạo refund 90. Claim lần hai revert `Order already claimed by buyer`, dù 90 vẫn thuộc buyer và còn trong escrow. Dispute/cancel sau claim rebate cũng gặp cùng loại lỗi.

**Sửa:** lưu số lượng đã rút lũy kế, `claimable = rebateAllocated + buyerRefundAllocated - buyerClaimedAmount`; tăng claimed amount trước transfer, luôn giữ allocation cuối cùng bất biến. Test claim ở mọi giai đoạn, claim lặp và refund sau partial claim. Đây không phải yêu cầu cấm buyer claim sớm.

### F04 — P0 — Cancel rồi confirm/settle/resolve có thể phân bổ hai lần

**Đã tái hiện:** [emergencyCancelCampaign](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:676), [settlement](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:497).

Emergency cancel phân bổ phần chưa phân bổ cho buyer nhưng không đóng trạng thái giao hàng/order. `confirmReceipt`, `settleUndisputedOrder` và `resolveDispute` không ngăn tái phân bổ sau campaign CANCELLED. Ca đã chạy: gross 100, rebate 10, delivery DELIVERED; cancel tạo refund 90; buyer confirm tiếp tạo seller allocation 90. Tổng allocation = **190 > 100**.

**Tác động:** escrow theo campaign chỉ giới hạn tổng rút, không đảm bảo từng order; có thể làm order khác thiếu thanh khoản, người rút sau bị revert. Ca đã chạy xác nhận over-allocation; chưa thực hiện khai thác rút chéo nhiều order.

**Sửa:** state machine cancellation theo order, chỉ phân bổ phần thực sự còn unallocated, chặn mọi transition tái phân bổ; vẫn phải cho rút khoản đã phân bổ trước hủy. Kiểm tra bất biến sau từng transition và thử mọi thứ tự cancel/claim/confirm/resolve/timeout.

### F05 — P1 — Order làm sold-out không được phân bổ rebate

**Đã tái hiện:** [GroupDealHub.sol](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:288).

`commitToBuy` gọi `_finalizeCampaignInternal()` trước khi tạo/push order mới. Vòng lặp phân bổ rebate chỉ thấy các order trước đó. Ca chạy một buyer mua 2 đơn vị ×100, inventory=2, tier cuối=80, early rebate=10: rebate đúng theo logic hiện hành phải là 50, nhưng lưu 0. Seller có thể nhận cả committed gross nếu order sau đó được settle.

**Sửa:** tạo order trước xử lý sold-out; tốt hơn tách chốt giá O(1) khỏi phân bổ lazy/per-order. Test buyer đầu cũng là buyer cuối, order cuối mở tier mới, có/không early benefit.

### F06 — P1 — Finalize và emergency cancel có vòng lặp không giới hạn

**Bằng chứng mã nguồn:** [finalize](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:347), [cancel](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:676).

Cả hai quét toàn bộ `_campaignOrderIds`. Số buyer/order đủ lớn có thể vượt block gas; sold-out còn đặt vòng lặp vào checkout order cuối. PLAN yêu cầu xử lý từng phần. Claim nhận mảng do caller chọn nên có thể chia nhỏ, không cùng mức lỗi với finalize bắt buộc toàn campaign.

**Sửa:** finalize chỉ ghi giá và thời điểm; rebate tính lazy hoặc materialize bằng batch hữu hạn, cancellation có epoch/snapshot và per-order processing idempotent. Đo gas theo 1/100/1.000/10.000 order, không chốt một ngưỡng an toàn khi chưa đo.

### F07 — P1 — Không cưỡng chế phí 0 và không có đường hạch toán/rút phí

**Đã tái hiện:** [createCampaign](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:88), [settlement](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:497).

Contract không require `platformFeeBps == 0`. Bất kỳ caller có thể tạo terms phí 1.000 bps, backend mặc định 0 không bảo vệ onchain. Settlement trừ phí nhưng không lưu allocation phí hoặc cho claim; ca 100 USDC để lại 10 sau seller claim. Phí >10.000 có thể gây underflow/revert khi settle. Resolve dispute lại dùng cách phân bổ khác, không xử lý phí.

**Sửa:** phiên bản đầu khóa cứng 0 trong contract; schema có logicVersion/feePolicyVersion nhưng không kích hoạt phí mới. Muốn triển khai phí sau phải có quyết định kinh doanh và phiên bản campaign mới.

### F08 — P1 — Hủy khẩn cấp không thuộc riêng Security Multisig

**Bằng chứng mã nguồn:** modifier `onlyOperator` và `emergencyCancelCampaign` trong [GroupDealHub.sol](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:50), [deploy.ts](E:/apps/group-deal/contracts/scripts/deploy.ts:28).

Operator hoặc owner đều hủy được; deploy mặc định owner/authorized signer/operator cùng deployer. Có reasonHash nhưng không có quy trình bằng chứng kiểm toán và role multisig riêng. Một operator được phép phân xử order không nên tự hủy toàn chiến dịch.

**Sửa:** riêng security authority là multisig; operator chỉ resolve chính khoản disputed; tách buy signer/delivery/operator/security roles. Ghi event khi đổi signer/operator, yêu cầu địa chỉ hợp lệ và quy trình rotation có kiểm toán. Không gọi một EOA là multisig chỉ vì UI ghi vậy.

### F09 — P1 — Publish không tạo campaign trên chain; có thể publish lặp làm lệch điều khoản

**Bằng chứng mã nguồn:** [campaignRoutes.ts](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:82), [publish](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:178), [SellerDashboard.tsx](E:/apps/group-deal/frontend/src/pages/SellerDashboard.tsx:118).

ID onchain được suy từ số campaign DB; `/publish` chỉ đặt PUBLISHED và thời gian. Không gọi `createCampaign`, không receipt/event và không mapping từ event. Có thể gọi publish lại cho campaign đã hoạt động để thay giờ DB, không có guard DRAFT/first commitment. Frontend báo “xuất bản thành công trên Arc Testnet” dù chỉ gọi API và không kiểm tra đủ HTTP responses.

**Sửa:** DRAFT → PUBLISHING → PUBLISHED sau receipt xác nhận; lấy chain campaignId từ event, ràng buộc terms hash, tx hash/block/contract/version. Publish idempotent. Edit/rút draft và amendment phải có luồng riêng; không cho publish lặp reset thời gian. Contract hiện chỉ sửa hash trước commit, chưa cho sửa đầy đủ cấu hình theo PLAN.

### F10 — P1 — Hash điều khoản bỏ mất nội dung tier và nhiều điều khoản vật chất

**Đã tái hiện:** [crypto.ts](E:/apps/group-deal/backend/src/utils/crypto.ts:59), [campaignRoutes.ts](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:88).

`JSON.stringify(terms, Object.keys(terms).sort())` dùng whitelist key ở mọi độ sâu. `threshold`/`price` không thuộc key cấp cao nên tier thành `{}`; thay giá và ngưỡng vẫn cho cùng canonical string/hash. Payload hash cũng thiếu số tiền/bps early rebate, entitlement/điều khoản giao sản phẩm, chính sách hủy/hoàn, fee version. Seed hash chỉ băm nhãn tên.

**Sửa:** canonical serialization đệ quy hoặc typed ABI encoding có schema/version; lưu nguyên terms snapshot và hash. Test đổi từng field vật chất phải đổi hash; đổi thứ tự key không đổi hash. Contract cần ràng buộc snapshot công bố với cấu hình kinh tế thực, không chỉ tin một hash tùy ý.

### F11 — P1 — API và worker tự quyết định trạng thái tiền, không có bằng chứng chain

**Bằng chứng mã nguồn:** [deliveryService.ts](E:/apps/group-deal/backend/src/services/deliveryService.ts:36), [disputeService.ts](E:/apps/group-deal/backend/src/services/disputeService.ts:45), [worker](E:/apps/group-deal/backend/src/index.ts:229).

Deliver chỉ ghi DELIVERED ở DB, không `recordDelivery`. Resolve operator chỉ ghi allocation DB, không `resolveDispute`. Worker tự đặt refund/CONFIRMED khi hết giờ, không gửi `claimDeliveryBreach`/`settleUndisputedOrder`. API confirm/dispute có thể gọi trực tiếp bằng session, không xác minh receipt của buyer principal. UI buyer có gửi confirm/dispute lên chain trước, nhưng không cứu được đường gọi API trực tiếp hay chain chưa được ghi delivery.

**Sửa:** DB lưu intent/evidence và trạng thái pending; financial projection chỉ cập nhật từ event xác nhận. Command sender đúng role phải gửi tx, lưu hash ngay, retry bằng idempotency; worker kiểm tra chain trước thao tác. Evidence upload tách khỏi financial transition để indexer đã ghi DISPUTED không khiến upload chứng cứ bị từ chối.

### F12 — P1 — Indexer không thể dựng lại trạng thái và dễ đếm lặp/lệch

**Bằng chứng mã nguồn:** [indexerService.ts](E:/apps/group-deal/backend/src/services/indexerService.ts:36).

Chỉ bốn listener hoạt động: CommitmentMade, TierUnlocked, CampaignFinalized, OrderDisputed. Các event khác chỉ nằm trong ABI; không handler create/delivery/breach/confirm/resolve/claim/cancel. Không cursor/deployment block, backfill, dedup log, finality checkpoint, reconnect replay. Lặp event cộng gross/quantity lại và ghi đè order về PENDING. Không tăng totalBuyerCount; không project rebate hoặc buyerClaimed/sellerClaimed. FinalizedAt lấy giờ máy nhận event, làm lệch SLA khi indexer chậm. Sold-out phát Finalized trước CommitmentMade cuối, listener cuối lại đặt ACTIVE.

Buyer account được tra từ binding ví hiện tại, không từ mapping identity phát hành authorization; unlink/relink hoặc replay về sau có thể gắn dữ liệu order sai account dù principal onchain không đổi. Webhook nhận nguyên order, gồm buyerAccountId và có thể dữ liệu riêng ở event dispute.

**Sửa:** event journal khóa `(chainId, contract, blockHash, txHash, logIndex)`, cursor và projection transaction, backfill theo block, timestamp từ block/state, xử lý đầy đủ events. Mapping campaignIdentity → account ổn định. Replay phải tái tạo tài chính; nội dung sản phẩm/PII vẫn phục hồi từ backup offchain, không thể kỳ vọng chain khôi phục dữ liệu vốn không đưa lên chain.

### F13 — P1 — Đối soát có thể báo HEALTHY mà chưa xác minh tiền onchain

**Bằng chứng mã nguồn:** [reconciliationService.ts](E:/apps/group-deal/backend/src/services/reconciliationService.ts:24).

Service query balance rồi chỉ log, không so với nghĩa vụ hay contract order state. RPC lỗi vẫn có thể status HEALTHY nếu DB tự cộng khớp. Với order pending/delivered/disputed, đặt `unallocated = gross - allocations` rồi cộng lại gross là kiểm tra vòng tròn; không kiểm tra unallocated âm. Claimed amounts và escrow từng campaign chưa được đối chiếu.

**Sửa:** đối soát ở một block xác định: từng order allocation/claim, tổng liability chưa rút, campaign escrow, actual token balance. Kiểm tra mọi thành phần không âm và paid≤allocated≤gross. RPC lỗi phải UNKNOWN/DEGRADED, không HEALTHY. Có lịch chạy, alert và runbook discrepancy; khoản token chuyển trực tiếp ngoài giao thức phải được phân loại surplus thay vì tự phân bổ.

### F14 — P1 — API công khai lộ draft, delivery template và chữ ký seller

**Bằng chứng mã nguồn:** [campaignRoutes.ts](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:9), [publicRoutes.ts](E:/apps/group-deal/backend/src/routes/publicRoutes.ts:45).

GET campaign trả nguyên campaign (gồm deliveryContentTemplate và sellerId); GET `/:id` không chặn DRAFT. Seller profile trả nguyên object có payoutProofSignature. Public v1 single cũng spread campaign; widget cho draft. Nếu seller dùng license/link thật làm payload/template thì nội dung đó có thể bị đọc công khai. Unlisted ID số dễ đoán; “chỉ qua link” không đồng nghĩa riêng tư, nhưng vẫn không được lộ secret.

**Sửa:** public DTO allowlist, kiểm tra visibility/status, draft chỉ owner/operator có quyền; tách secret inventory/template khỏi metadata công khai. Unlisted dùng share token/slug ngẫu nhiên nếu cần khó khám phá, không lấy unlisted làm bảo vệ entitlement. Không công bố proofSignature.

### F15 — P1 — IDOR trong support thread

**Bằng chứng mã nguồn:** [orderRoutes.ts](E:/apps/group-deal/backend/src/routes/orderRoutes.ts:94), [disputeService.ts](E:/apps/group-deal/backend/src/services/disputeService.ts:93).

Bất kỳ user đăng nhập nào đều đọc/gửi message cho order ID bất kỳ. Không kiểm tra order tồn tại hoặc user là buyer, seller của campaign hay operator. Role message lấy từ roles chung nên một seller ngoài cuộc có thể ghi tin dưới vai seller trong order của người khác.

**Sửa:** middleware object-level authorization chung cho message/evidence/order detail; sender role theo quan hệ với order; validate độ dài/nội dung, phân trang/rate limit, audit truy cập. Test account A không đọc/ghi thread B.

### F16 — P1 — Chữ ký liên kết ví/payout không có server challenge chống replay

**Bằng chứng mã nguồn:** [authService.ts](E:/apps/group-deal/backend/src/services/authService.ts:85).

Backend chỉ `verifyMessage(message, signature)` do client cung cấp; không kiểm tra domain, purpose, account, nonce phát hành, TTL hoặc đã dùng. Một chữ ký hợp lệ thu được ở ngữ cảnh khác có thể bị tái dùng khi điều kiện binding cho phép. Unique reverse map không phải constraint database nguyên tử nhiều process. Relink hiện bỏ reverse binding ví ngoài cũ, không có lịch sử binding rõ ràng.

**Sửa:** challenge do server cấp, ràng buộc account/action/address/domain/nonce/expiry; consume nonce trong transaction với unique constraint địa chỉ active. Mapping tài chính theo identity/principal giữ nguyên khi thay binding. Không coi chữ ký xác thực ví là bằng chứng quyền phân phối sản phẩm.

### F17 — P1 — Default secret và identity phụ thuộc JWT secret

**Bằng chứng mã nguồn:** [config.ts](E:/apps/group-deal/backend/src/config.ts:24), [crypto.ts](E:/apps/group-deal/backend/src/utils/crypto.ts:50), [hardhat.config.ts](E:/apps/group-deal/contracts/hardhat.config.ts:8).

Có JWT secret, master key và private key Hardhat mặc định công khai trong source. Nếu triển khai thiếu env, ứng dụng vẫn chạy với các giá trị đó. Không chép lại secret trong báo cáo. Identity campaign băm cùng JWT secret: rotate JWT secret sẽ tạo identity mới cho cùng account/campaign, làm mất continuity và có thể vượt count/max/early slot qua authorization mới.

**Sửa:** fail-fast ngoài local khi thiếu secret; signer trong KMS/HSM hoặc giải pháp custody có kiểm soát; tách secrets theo purpose. Persist campaign identity ngẫu nhiên một lần dưới unique(account,campaign), backup mapping; nếu dùng HMAC cần key riêng có version/rotation không thay identity cũ. AES-GCM với IV ngẫu nhiên là lựa chọn tốt nhưng master key mặc định và không có key version phá bảo vệ thực tế.

### F18 — P1 — Chain/config mismatch làm luồng ví không hoạt động như giao diện mô tả

**Bằng chứng mã nguồn:** [Web3Context.tsx](E:/apps/group-deal/frontend/src/context/Web3Context.tsx:47), [vite.config.ts](E:/apps/group-deal/frontend/vite.config.ts:8), [config.ts](E:/apps/group-deal/backend/src/config.ts:7), [manifest](E:/apps/group-deal/shared/contracts.json:1).

Frontend fetch `/health` để lấy địa chỉ nhưng Vite chỉ proxy `/api`: với cấu hình dev hiện tại `/health` không đến backend, thường nhận HTML SPA và parse JSON lỗi. Ví nhúng luôn RPC localhost nhưng state chainId gán 5042002. Backend đọc `../../shared` từ backend/src hoặc backend/dist thành `backend/shared`, khác thư mục root/shared được deploy ghi. Fallback che lỗi bằng địa chỉ Hardhat. Health trả nhãn Arc cố định dù đang 31337; không kiểm tra bytecode, signer, token, chain hay readiness indexer.

Ví ngoài không có guard chain/đổi mạng, không subscribe accountsChanged/chainChanged; logout chưa reset toàn bộ Web3 state. SellerRegisterModal ưu tiên khóa embedded khi user có field này dù đang muốn ký ví ngoài.

**Sửa:** một deployment config chuẩn có chain, contract, token, ABI/version và explorer; startup kiểm tra code/hash/chain/signers; sửa endpoint/proxy và đường dẫn config. Wallet mode/signer/account phải nhất quán, chuyển mạng đúng Arc Testnet, reset khi logout và xử lý sự kiện provider. Không đổi mục tiêu sang mainnet.

### F19 — P1 — Deploy mặc định MockUSDC kể cả khi chọn Arc Testnet

**Bằng chứng mã nguồn:** [deploy.ts](E:/apps/group-deal/contracts/scripts/deploy.ts:10), [faucetRoutes.ts](E:/apps/group-deal/backend/src/routes/faucetRoutes.ts:7).

Chỉ dùng system USDC khi env `USE_SYSTEM_USDC=true`; thiếu env thì deploy token tùy ý có public mint/faucet. Token đó không phải Test USDC mục tiêu và không trả gas native Arc. API faucet không auth/rate limit, dùng chính authorization signer để gửi giao dịch; ABI faucet/mint không phải cơ chế cấp system USDC. Ngay local, ERC20 faucet không cấp native gas cho ví mới tạo.

**Sửa:** MockUSDC chỉ local/test; Arc deployment bắt buộc system token đã kiểm tra. Faucet tích hợp nguồn test token phù hợp, không thử mint system token, có hạn mức và signer tách biệt nếu cần. Seed campaign phải tùy chọn riêng và lấy ID/payout từ chain; seed hiện campaign 2 dùng seller2 trong script nhưng DB mẫu gắn ví seller1.

### F20 — P1 — Trạng thái giao dịch làm mất thông tin pending

**Bằng chứng mã nguồn:** [Web3Context.tsx](E:/apps/group-deal/frontend/src/context/Web3Context.tsx:168), [CampaignDetailPage.tsx](E:/apps/group-deal/frontend/src/pages/CampaignDetailPage.tsx:82), [TxTrackerModal.tsx](E:/apps/group-deal/frontend/src/components/TxTrackerModal.tsx:5).

Hash chỉ trả sau `tx.wait()`, nên không có hash để theo dõi ngay sau broadcast. APPROVE/BROADCAST được set liên tiếp, không theo stage thật. Mọi lỗi được chuyển FAILED, cả lỗi provider sau khi tx đã phát; REVERTED có trong type nhưng không được phân loại trong checkout. Không lưu pending qua reload, không replacement/dropped tracking, không thông báo indexer lag riêng.

**Sửa:** lưu intent/nonce/tx hash ngay khi broadcast; tách awaiting signature/approval/submitted/pending/confirmed/reverted/reconciling. Chỉ xác nhận thất bại tài chính khi có receipt revert hoặc bằng chứng thích hợp; lỗi HTTP không đủ. Sau receipt thành công nhưng projection chậm phải hiển thị confirmed + syncing. Chỉ gọi mua lại sau kiểm tra tx cũ.

### F21 — P1 — Giao hàng/dry-run chưa kiểm chứng sản phẩm thực

**Bằng chứng mã nguồn:** [deliveryService.ts](E:/apps/group-deal/backend/src/services/deliveryService.ts:9), [SellerDashboard.tsx](E:/apps/group-deal/frontend/src/pages/SellerDashboard.tsx:103).

Dry-run chỉ encrypt/decrypt sample; tham số method không được sử dụng. UI gọi endpoint `test-delivery-temp` không tồn tại, không kiểm tra HTTP status và cả catch cũng set verified=true. Backend test nhận chuỗi mẫu mặc định là đỗ. Deliver có thể thực hiện trước finalize vì chỉ kiểm tra SLA nếu finalizedAt tồn tại. Không inventory license duy nhất/seat count theo quantity; file link chỉ là chuỗi, không signed URL/expiry/access control; webhook activation chưa có adapter. Hash không salt của secret dễ đoán có thể bị dictionary attack nếu đưa lên chain.

**Sửa:** adapter cho từng phương thức phù hợp sản phẩm, assignment nguyên tử không giao trùng license, test thực sự verify fulfillment/access/retry trước publish; test result ràng buộc version cấu hình. Delivery chỉ sau finalize, proof có salt/commitment phù hợp; giữ chi tiết bí mật offchain. Không thay yêu cầu sản phẩm thật bằng “chỉ demo”.

### F22 — P1 — Webhook có SSRF và thiếu độ bền

**Bằng chứng mã nguồn:** [webhookService.ts](E:/apps/group-deal/backend/src/services/webhookService.ts:10).

Seller tự chọn targetUrl và server fetch trực tiếp, không chặn loopback/private/link-local/metadata, redirect/DNS rebinding. Đây là đường SSRF khi có event cho seller; chưa thực hiện truy cập hạ tầng nội bộ. Dispatch một lần, attempts=1, không retry/outbox/DLQ, log chỉ giữ 50. Event ID tạo mới mỗi lần dispatch; replay indexer có thể tạo side effect trùng. Payload dùng nguyên object order, không schema/redaction; event delivered mặc định được chọn nhưng không thấy được phát trong delivery service.

**Sửa:** HTTPS endpoint được validate theo chính sách egress, chặn địa chỉ nội bộ ở cả DNS/redirect/connect; durable outbox với ID ổn định, retry exponential+jitter, timeout, DLQ và replay có kiểm soát. HMAC hiện là nền tảng tốt; cần schema/version, chỉ trường seller cần, không account ID/evidence/private entitlement; secret mã hóa và rotation.

### F23 — P1 — JSON store không đáp ứng ACID, audit và khôi phục vận hành

**Bằng chứng mã nguồn:** [store.ts](E:/apps/group-deal/backend/src/db/store.ts:150).

Ghi temp rồi rename giúp tránh một phần file ghi dở, không tạo transaction/unique constraint giữa process. Mỗi save serialize toàn database đồng bộ, chặn event loop; nhiều instance có thể lost update và tranh temp file. Parse lỗi chuyển database rỗng, runtime lại seed demo, nguy cơ che sự cố và ghi đè state. Audit cắt còn 1.000 entry, nằm cùng dữ liệu mutable; không backup/migration/schema version/retention/restore drill.

**Sửa:** database transaction với unique/check/foreign key; event/outbox transaction; backup mã hóa, PITR, restore drill và migration có rollback. Parse lỗi phải dừng/read-only chứ không tự khởi tạo mới. Audit append-only có retention theo chính sách, quyền đọc và redaction; backup identity mappings và ciphertext/key metadata là bắt buộc.

### F24 — P1 — Authorization rộng hơn quantity yêu cầu và fallback không an toàn về trạng thái

**Bằng chứng mã nguồn:** [authorizationService.ts](E:/apps/group-deal/backend/src/services/authorizationService.ts:83), [GroupDealHub.sol](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:16).

API nhận quantity nhưng chữ ký dùng `maxQuantity = campaign.maxPerAccount`; không ký quantity cụ thể, requireEarlySlot hoặc giới hạn giá mà buyer đang xem. Typehash BuyAuthorization đã phân biệt hành động ở mức cấu trúc, nên không kết luận “hoàn toàn thiếu action binding”; tuy nhiên chưa khớp đầy đủ ràng buộc quantity mà PLAN nêu. Khi query nonce/principal lỗi — kể cả lỗi principal được throw bên trong try — catch quay về local order count. Contract vẫn chặn principal/nonce sai, nhưng API có thể cấp chứng thực chắc chắn fail hoặc dựa dữ liệu cũ thay vì giữ unavailable/reconciling.

**Sửa:** thống nhất signed command chính xác gồm quantity, benefit requirement, nonce/deadline/domain/terms; nếu cần trần tích lũy thì định nghĩa riêng. Fail closed khi không kiểm tra chain được; validate số nguyên dương, địa chỉ, campaign/identity. UI có max spend/price bounds nếu giá hiển thị là điều kiện buyer duyệt.

### F25 — P1 — Validation số tiền/trạng thái còn lỗ hổng

**Bằng chứng mã nguồn:** [disputeService.ts](E:/apps/group-deal/backend/src/services/disputeService.ts:59), [campaignRoutes.ts](E:/apps/group-deal/backend/src/routes/campaignRoutes.ts:64), [referenceModel.ts](E:/apps/group-deal/backend/src/accounting/referenceModel.ts:181).

Resolve offchain chỉ kiểm tra buyerShare+sellerShare==remainingGross, không kiểm tra hai phần không âm; ví dụ -1 và gross+1 vẫn được ghi DB. Contract uint256 chặn số âm nên không tự động đồng nghĩa rút số âm onchain, nhưng DB/UI/đối soát sai. Schema validation rời rạc; zod đã cài nhưng không thấy dùng. Review cho mọi trạng thái trừ PENDING, nên BREACHED_REFUNDED chưa từng giao vẫn có thể đánh giá. Model verify conservation cũng chỉ kiểm tra tổng, không từng phần không âm.

**Sửa:** schema chung, decimal string→base unit, bounds/integer/enum, state-transition guards; không tự clamp giá trị tài chính bất hợp lệ. Review cần bằng chứng delivered của đúng buyer và unique order review. Test negative/NaN/fraction/oversized payload và quyền theo object.

### F26 — P1 — Early rebate chưa đảm bảo chỉ tác động đơn vị đầu tiên khi giá giảm sâu

**Bằng chứng mã nguồn:** [GroupDealHub.sol](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:246), [referenceModel.ts](E:/apps/group-deal/backend/src/accounting/referenceModel.ts:137).

Rebate early được cap theo giá lúc commit, rồi cộng vào price rebate và chỉ cap tổng bằng committed gross. Ví dụ quantity=2, locked=100, final=10, early=100: công thức ra 280, cap 200, cả hai đơn vị thành miễn phí dù PLAN nói early benefit chỉ cho đơn vị đầu. Reference model lặp cùng công thức nên không phát hiện sai yêu cầu. Ngoài ra `requireEarlySlot=true` khi early disabled không revert; bps vượt 10.000 hoặc fixed và bps đồng thời chưa bị reject.

**Sửa:** chốt rõ cơ sở tính % theo giá commit hay giá cuối, cap lợi ích vào đơn vị đủ điều kiện theo điều khoản công bố; không tự chọn chính sách kinh doanh còn mơ hồ. Validate fixed XOR percentage, slot count/bps, disabled + required slot. Thêm property giới hạn lợi ích early bằng giá trị của một đơn vị theo chính sách đã chọn.

### F27 — P1 — Emergency dispute cho ví nhúng mới có hàm, chưa có đường sử dụng độc lập

**Bằng chứng mã nguồn:** [GroupDealHub.sol](E:/apps/group-deal/contracts/contracts/GroupDealHub.sol:549), [Web3Context.tsx](E:/apps/group-deal/frontend/src/context/Web3Context.tsx:252).

Hàm direct dispute kiểm tra buyer principal; emergency signature ràng buộc chain/contract/campaign/order/reason/deadline và chỉ chuyển DISPUTED. Đây là nền tảng đúng. Nhưng frontend không có signing/export/relay workflow cho emergency; user cần đăng nhập backend lấy khóa giả Circle. Không thấy cơ chế buyer giữ sẵn quyền tối thiểu để mở đúng một dispute khi ứng dụng hoặc provider không hoạt động.

**Sửa:** thiết kế capability chỉ-dispute theo order, expiry/window, một lần, buyer-controlled; có giao diện/công cụ độc lập và hướng dẫn thực sự dùng được. Kiểm thử mất backend, mất evidence service và mất provider theo từng tổ hợp, không thêm quyền chuyển/rút/phân bổ tiền vào capability.

### F28 — P1 — Bộ test không phủ các điều kiện nghiệm thu quan trọng

**Bằng chứng:** ba file trong contracts/test, [accounting.test.ts](E:/apps/group-deal/backend/test/accounting.test.ts:1).

“E2E” hiện là gọi contract trong Hardhat, không qua browser/API/Circle/Arc. File tên Fuzz có các ca và vòng lặp cố định, không generator stateful/random seed/shrinking. Reference model là hàm số học, chưa theo dõi đầy đủ ledger, claims, cancel hoặc đối chiếu contract sau từng action. Năm ca audit đã lọt qua toàn bộ 10 tests.

**Sửa:** bổ sung test đúng các F03–F07/F10 trước sửa logic; chuyển thành expectation đúng sau fix. Thêm stateful differential fuzz, concurrency inventory/slot/principal, domain/chain/terms/wallet/nonce mismatch, pending/revert/provider outage/indexer restart/replay, API authorization và browser E2E. Nghiệm thu trên bản triển khai bằng receipt, projection và reconcile cùng block, không dựa tên file test.

### F29 — P2 — SDK/webhook verifier chưa hoàn thiện

**Bằng chứng mã nguồn:** [SDK](E:/apps/group-deal/sdk/src/index.ts:24), [package](E:/apps/group-deal/sdk/package.json:1).

Chưa có tsconfig để bảo đảm dist/index.js và .d.ts như package khai báo; chưa build thành công. `timingSafeEqual` ném lỗi nếu signature sai độ dài; parseInt timestamp không validate đầy đủ. Timestamp window chỉ hạn chế tuổi message, không chống replay trong 300 giây; thiếu event-ID dedup. `apiKey` lưu nhưng không dùng; ethers dependency SDK không được import.

**Sửa:** cấu hình TS/package exports/files/types rõ, kiểm tra npm pack consumer; verifier validate format/length/timestamp hữu hạn và return false an toàn, raw-body signing, dedup event ID tại receiver. Loại apiKey/ethers nếu chưa có use case; SDK API có types và contract test với backend.

### F30 — P2 — Trải nghiệm, nội dung và tính đầy đủ của UI

**Bằng chứng:** [PreTxModal](E:/apps/group-deal/frontend/src/components/PreTxModal.tsx:31), [ShareModal](E:/apps/group-deal/frontend/src/components/ShareModal.tsx:22), các dashboard và i18n dictionary.

- Gas 0.005 cố định không phải estimate; cần estimate approve + commit và phí native thực, gas tách committed gross.
- Các field tiền ở form dùng Number; giá hiển thị thường cắt 2 decimals, có thể che micro-USDC. Dùng decimal string/base units ở input và tính quyết định; Number chỉ cho trình bày khi có bounds rõ.
- “Early supporter khả dụng” chỉ kiểm tra enabled, không slot còn và buyer đã dùng; cần đọc eligibility/slot có timestamp.
- Iframe share trỏ endpoint JSON nên không phải widget giao diện. Widget API dùng localhost và URL `/campaign/:id` khác hash router `/#campaign-id`.
- Thiếu ảnh chia sẻ campaign/metadata cho social crawler; QR cơ bản đã có.
- English chưa bao phủ lỗi, checkout, dispute, seller/operator; vẫn nhiều text VI hardcode.
- Campaign detail dùng grid `1fr 380px` inline, các form nhiều grid hai cột. Đã tái hiện lỗi ở viewport 375px: document rộng 879px, nội dung bị cắt và cột mua hàng nằm ngoài màn hình; xem UI02 ở mục 13. Chưa kiểm thử riêng 320px.
- Modal thiếu luồng focus trap/ESC/aria-dialog rõ ràng; cần accessibility audit keyboard/screen reader.
- API lỗi/not-found có thể thành màn hình loading hoặc danh sách rỗng, che lỗi xác thực/provider. Cần loading/empty/error/degraded riêng.
- Thiếu UI đầy đủ cho sửa/rút draft, cancellation policy, early %, unlisted, seller reply review/support và bổ sung evidence. Route có một phần không thay thế hành trình sử dụng.

### F31 — P1 — Quyền phân phối/badge và chức năng vận hành còn thiếu

**Bằng chứng:** [operatorRoutes.ts](E:/apps/group-deal/backend/src/routes/operatorRoutes.ts:69), [store.ts](E:/apps/group-deal/backend/src/db/store.ts:1), inventory source.

Hai badge nằm trên sellerProfile; “verifiedRightsBadge” vì vậy hiển thị như seller có quyền cho mọi sản phẩm, trong khi PLAN yêu cầu verification riêng theo product/campaign. Seed seller/operator được đánh verified sẵn. Chưa có evidence/reviewer/scope/expiry/revocation. Chưa thấy trang hồ sơ seller và chỉ số delivered-on-time/refund/dispute/completed được tính từ chain, email thật, notification inbox, lịch finalise onchain, monitor/alert, retention/delete policy hoặc incident runbook.

**Sửa:** verification case với scope rõ và evidence riêng tư; badge diễn đạt đúng thứ được kiểm, không hứa chất lượng. Xây notification outbox/dedupe, metrics có mẫu số và trạng thái finality; cấu hình alert về indexer lag, RPC, worker failures, SLA sắp hết, escrow mismatch và signer balance. Test USDC phải mang nhãn network/test asset trong dữ liệu kế toán, không gộp vào doanh thu tiền thật.

### F32 — P2 — README và tài liệu đang mô tả vượt quá bằng chứng

**Bằng chứng:** [README.md](E:/apps/group-deal/README.md:1).

Các tuyên bố “hoàn chỉnh”, “Transactional ACID JSON store”, “bộ test toàn diện”, chạy Arc, Circle wallet và chống replay webhook chưa tương ứng implementation. Tài liệu ghi native gas USDC 6 decimals là sai tầng đơn vị; xem mục 6. “Ẩn danh không liên kết chéo” cũng quá mạnh vì cùng buyerPrincipal/address xuất hiện công khai ở các campaign. PLAN chỉ yêu cầu identity theo campaign và không PII, không hứa địa chỉ ví không bị liên kết.

**Sửa:** tài liệu phân biệt implemented/partial/unverified, hướng dẫn cài dependency, env mẫu không secret, deploy migration, local/testnet rõ, evidence nghiệm thu có tx/block/commit. Không lấy thông báo console “Arc Network” trong Hardhat test làm chứng cứ mạng Arc.

## 5. Dependency và chuỗi cung ứng

Kết quả máy đọc được lưu tại [backend audit](E:/apps/group-deal/reports/dependency-backend.json), [frontend audit](E:/apps/group-deal/reports/dependency-frontend.json), [contracts audit](E:/apps/group-deal/reports/dependency-contracts.json).

Frontend có Vite high và esbuild moderate, liên quan dev server/path handling. Không được suy diễn rằng static frontend production chắc chắn có cùng khả năng khai thác; cần đánh giá cách deploy. Với môi trường Windows đang dùng, advisory về path/UNC đáng chú ý. Npm đề xuất nâng major, nên cần migration và build/browser regression, không chạy fix --force mù quáng.

Contracts workspace có 46 package bị đánh dấu, trong đó chuỗi Hardhat/toolbox và transitive dependencies như undici, ws, lodash, tmp, adm-zip, serialize-javascript. Nhiều package kế thừa severity qua dependency; không cộng thành số lỗi độc lập hay coi đây là lỗi bytecode đã triển khai. Rủi ro chính ở máy phát triển/CI/deploy, đặc biệt job có signing secrets. Tách job build/test từ signing/deploy, dependency lock và quyền tối thiểu.

Backend npm audit báo 0 tại thời điểm kiểm tra; vẫn có lỗ hổng logic rất nghiêm trọng F01/F02/F14/F15. SDK chưa có lockfile để audit một dependency graph cố định. Cần pin toolchain Node/package manager, dùng npm ci, CI audit/SBOM/secret scan/license checks và chính sách xử lý ngoại lệ có hạn dùng. Repository chưa có CI workflow/migration/runbook tương ứng.

## 6. Đối chiếu tài liệu Arc/Circle hiện hành

Ngày kiểm tra, tài liệu kết nối chính thức liệt kê **Arc Testnet chain 5042002**, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`; native gas USDC dùng **18 decimals**. Giữ đúng mạng testnet theo PLAN; không chuyển sang mainnet vì tài liệu có thêm mainnet. [Arc — Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc).

ERC-20 USDC interface sử dụng **6 decimals**, còn native gas/value dùng 18; cần chuyển đổi rõ từng tầng. README đang gộp native gas với 6 decimals; PreTxModal hiện chưa estimate gas thật. [Arc — USDC for Every Action](https://www.arc.io/blog/usdc-for-every-action-how-arc-simplifies-building-onchain).

Circle có user-controlled challenge API với `X-User-Token` và challenge status; repository hiện không gọi cơ chế đó. Điều này củng cố kết luận ví ethers tạo ở server chưa phải tích hợp Circle User-Controlled. Không suy diễn đã xác minh mọi khả năng EOA/Arc/khôi phục của Circle chỉ từ một endpoint; khi triển khai phải chạy thử khả năng provider đúng accountType và mạng, ký typed data, lifecycle/recovery và fallback. [Circle — List user challenges](https://developers.circle.com/api-reference/w3s/user-controlled-wallets/list-user-challenges).

Explorer cũ trong source cần kiểm tra/chuyển sang config theo tài liệu; báo cáo không khẳng định mọi URL cũ đều đã ngừng hoạt động. Chưa gọi RPC live để xác minh contract của dự án được deploy trên Arc.

## 7. Những gì nên giữ, những gì thừa và tối ưu cần làm

### 7.1. Nên giữ và phát triển tiếp

- Solidity integer accounting, SafeERC20, ReentrancyGuard ở đường chuyển token và pull-claim.
- EIP-712 domain, nonce và pin buyer principal trong cùng transaction có tiền; tier chỉ tăng.
- SLA 24/48h, dispute window 48h, resolve per-order vào hai principal; direct/emergency dispute primitives.
- Kiến trúc tách nội dung/entitlement offchain khỏi escrow onchain; AES-GCM IV ngẫu nhiên và HMAC webhook là nền tảng phù hợp.
- Ba dashboard, VI/EN dictionary, basic public API, QR và bộ tests hiện có là tài sản có thể dùng tiếp sau khi sửa.

### 7.2. Nên bỏ hoặc cô lập

- Admin login shortcut, OTP hiển thị, mặc định secret, Circle wallet giả và auto-seed ở runtime.
- MockUSDC/faucet không cần xóa khỏi tests, nhưng phải tách khỏi triển khai Arc thực.
- Logic settlement/refund DB song song với contract: bỏ quyền tự quyết tài chính, chuyển thành projection/intent workers.
- Raw record serialization; thay bằng DTO public/private có chủ đích, tránh dữ liệu thừa và rò rỉ.
- Tuyên bố marketing “hoàn chỉnh/ACID/fuzz/Arc/Circle” không có bằng chứng; không cần thêm cảnh báo demo vào mọi màn hình, cần sửa implementation và tài liệu đúng thực tế.
- SDK apiKey không dùng, ethers import dependency không dùng; state/import UI không dùng và logic đăng ký seller trùng App/Header/modal cần hợp nhất sau audit.
- Không bổ sung phí khác 0, chuyển mainnet, proxy upgrade hay quy tắc chỉ bán demo: đều ngoài quyết định hiện có trong PLAN.

### 7.3. Tối ưu theo tác động

| Thứ tự | Tối ưu | Lợi ích và cách đo |
|---|---|---|
| 1 | Finalize O(1), allocation/cancel theo order/batch | Tránh gas DoS; đo gas growth theo số order |
| 2 | Transactional DB + journal/outbox | Không mất/sai event; đo replay idempotence và crash recovery |
| 3 | Index/query theo buyer/campaign/seller/status; pagination | Bỏ Object.values toàn DB mỗi request; đo p95 và memory với dữ liệu lớn |
| 4 | Worker durable queue, retry/backoff/idempotency | Không bỏ việc sau restart; đo queue lag/retry/DLQ |
| 5 | Dùng provider pool/config chung, RPC timeout và circuit breaker | Giảm connection và trạng thái treo; giữ UNKNOWN khi thiếu evidence |
| 6 | Lazy-load seller/operator/docs và thư viện QR/confetti | Giảm initial bundle 655 kB; đo lại gzip/LCP trên mobile |
| 7 | API client chung, typed DTO/schema và error handling | Giảm fetch/token/error logic lặp; test negative response thống nhất |
| 8 | ABI sinh từ build artifact, manifest versioned | Bỏ ABI viết tay ở nhiều nơi; CI kiểm tra schema/event tương thích |
| 9 | Cache read API theo block/version, invalidation event | Giảm tải mà không biến stale data thành trạng thái tài chính chắc chắn |

Đây là thứ tự triển khai đề xuất, không phải benchmark đã đo. Không cần đưa microservices/Kafka hoặc kiến trúc phân tán phức tạp vào trước khi một backend transaction + durable jobs hoạt động đúng.

## 8. Danh sách phần còn thiếu để hoàn chỉnh sản phẩm

1. Email OTP thật; Circle EOA integration; challenge liên kết ví có nonce; MFA/step-up; session revocation và quy trình recovery không đổi principal.
2. Seller create/edit/withdraw/publish onchain, immutable full terms snapshot, amendment history, visibility và config đủ theo PLAN.
3. Delivery adapters/inventory đúng số lượng, protected files/links, activation API/webhook, dry-run thực và evidence retention.
4. Full lifecycle commands với tx status: finalize, record delivery, breach refund, settle, dispute/resolve, claims, security cancellation.
5. Indexer journal/backfill/full projection; reconciliation đúng theo block; giám sát và alert.
6. Emergency dispute độc lập cho embedded buyer; quyền tối thiểu và kiểm thử outage.
7. Seller profile public, verification theo product/campaign, support/review/reply/evidence UI đầy đủ, notification/email, chỉ số vận hành chính xác.
8. Public event schema/OpenAPI, widget HTML, ảnh share, SDK build/package/type tests, webhook retry/dedup/DLQ.
9. Database migrations/constraints, secret management, backup/restore, privacy retention/deletion, audit append-only, runbooks và CI.
10. Browser/API/integration/stateful fuzz/load/restore tests và evidence nghiệm thu bản triển khai Arc Testnet.

Không có buyer cancellation policy/flow hoàn chỉnh; PLAN cho seller cấu hình chính sách hủy nhưng chưa định nghĩa mọi chi tiết tiền/thời điểm. Cần chốt semantics trước viết contract: khi được hủy, phần nào refund, count/inventory cập nhật thế nào nhưng không làm tier tụt; không tự áp thêm chính sách có ảnh hưởng tiền.

## 9. Lộ trình sửa đề xuất và tiêu chí thoát từng giai đoạn

### Giai đoạn A — Khóa lỗi nền tảng

Xử lý F01–F04, F07–F08, F14–F17. Loại mọi đường lấy OTP/private key, tách role, sửa cumulative claim và cancellation state machine. Trong lúc sửa, không tiếp nhận cam kết mới trên bản chưa được kiểm chứng. Nếu đã có bản triển khai, cần kiểm kê exposure/balance/claim theo chain trước mọi quyết định migration; không tự thu hồi allocation hoặc đổi principal.

**Đạt khi:** test auth/object authorization qua; không secret trong API/log; mọi sequence allocation/claim bảo toàn và không khóa refund mới; security cancellation chỉ authority đúng.

### Giai đoạn B — Hoàn thiện accounting/terms/campaign

Sửa F05–F10/F24–F26; full terms schema, version, zero fee, bounded processing, identity bền vững. Reference state machine độc lập đối chiếu contract sau từng action, không copy nguyên implementation.

**Đạt khi:** sold-out order cuối đúng rebate; fee luôn 0; hash nhạy với mọi field vật chất; claim nhiều giai đoạn đúng; gas không tăng theo toàn bộ buyer trong finalise; replay/cross-domain không qua.

### Giai đoạn C — Nối hệ thống vào nguồn sự thật onchain

Sửa F09/F11–F13/F18–F21/F27: config Arc, Circle thật, publish/fulfillment/arbitration gửi tx đúng role, transaction tracker durable, indexer full journal/projection và reconciler.

**Đạt khi:** hành trình seller mới → campaign → buyer mới → USDC commit → finalise → delivery → confirm/dispute/breach → allocation → claims chạy trên Arc Testnet bằng receipt thật; UI không báo thành công giả khi API/provider lỗi.

### Giai đoạn D — Vận hành và hoàn thiện trải nghiệm

Sửa F22–F23/F29–F32, dependency remediation; delivery adapters, support/verification/notification/SDK/widget/i18n/mobile; CI, backup, metrics, runbooks.

**Đạt khi:** restart indexer không mất/nhân event; replay phục hồi ledger; restore khôi phục offchain data; webhook failure vào retry/DLQ và xử lý không trùng; alert đến người vận hành và thao tác được.

### Giai đoạn E — Nghiệm thu bản triển khai

Lập hồ sơ gồm commit/build/bytecode hash, chain 5042002, contract/token/version, deployment receipt, quyền multisig, tx hash từng hành trình, block checkpoint đối soát, bằng chứng delivery và kết quả outage/restore. Dữ liệu kiểm thử không chứa secret, email/license/evidence riêng tư trong tài liệu công khai. Review bảo mật lại sau sửa P0/P1; deploy mới nếu cần thay logic contract không upgradeable, kèm kế hoạch giữ quyền campaign cũ.

## 10. Bộ ca kiểm thử bắt buộc bổ sung

| Nhóm | Các ca cần có | Assertion chính |
|---|---|---|
| Claim | Rebate trước rồi breach/dispute/cancel refund; claim lặp; nhiều order | claimed≤allocated; refund mới còn rút được; đúng principal |
| Cancel | Trước/sau delivery, dispute, confirm, partial/full claim; race settle/cancel | Không đảo allocation cuối; không over-allocate; không ảnh hưởng order khác |
| Sold-out/tier | Order đầu=cuối; order cuối mở tier; 2 buyer tranh inventory | Cùng giá cuối; mọi order có rebate; không vượt tồn kho |
| Early | Multi-unit, giá giảm sâu, slots=0/hết, buyer quay lại, required slot | Chỉ first eligible unit, onchain order, không âm/lan lợi ích sang unit khác |
| Identity/auth | Hai ví cùng tranh pin; relink; rotate JWT; sai chain/contract/campaign/terms/nonce | Một identity/account/campaign ổn định; principal bất biến; replay fail |
| Terms | Mọi field vật chất thay đổi, canonical key order, publish lặp | Hash đúng; lock sau first commit; không reset deadline |
| Delivery/dispute | SLA boundary, +48h boundary, outage evidence/backend/provider | Đúng cửa sổ, emergency đúng quyền, evidence upload idempotent |
| Indexer | Replay log 2 lần, restart giữa batch, backfill từ deployment | Projection giống replay một lần; timestamp đúng block; claim reflected |
| Reconcile | RPC lỗi, âm allocation, missing event, direct token transfer, partial claims | UNKNOWN hoặc discrepancy chính xác; không HEALTHY giả |
| API security | OTP leak/bruteforce; arbitrary thread; public draft/secret; signature replay; SSRF | 401/403/404 phù hợp, không lộ dữ liệu, không nội bộ egress |
| Webhook | Timeout, 5xx, crash, duplicate, bad sig, old timestamp | Durable retry/DLQ, stable event ID, receiver dedup, không verifier crash |
| UI/E2E | Ví ngoài/Circle; chain sai; pending/revert/reload; EN/mobile | Không success tài chính khi thiếu receipt; user hoàn thành luồng |
| Ops | Restore DB+key metadata+identity; rebuild chain projection; alert injection | Đủ dữ liệu phục hồi, không đổi principal; alert/runbook thực sự hoạt động |

## 11. Các quyết định cần làm rõ, không tự kích hoạt

- Early % tính trên giá commit hay giá cuối; cap một đơn vị và cách công bố quyền lợi.
- Chính sách buyer hủy hợp lệ trước finalise, inventory/count sau hủy; tier vẫn không được lùi.
- Tier đầu threshold >1 đang được coi mở ngay: seed có threshold=5 nhưng contract mặc định tier0; cần định nghĩa base tier so với minimum participation. Không tự thêm “không đủ người thì hủy” vì PLAN chưa yêu cầu.
- Quy trình dry-run có phương thức manual được phép đến mức nào, bằng chứng và điều kiện chứng minh delivery thực.
- Unlisted chỉ không xuất hiện trong tìm kiếm hay phải khó đoán link; không dùng nó thay authentication cho secret.
- Retention support/evidence/entitlement, scope truy cập operator và cách xóa PII mà vẫn giữ quyền tài chính.
- Multisig signers/quorum, rotation authority và quy trình recovery; không đưa secret/signers thực vào source hoặc báo cáo.

Những phần không phụ thuộc các quyết định trên — vá OTP/keys/IDOR, cumulative claims, bảo toàn cancel, indexer/reconcile, config và dependency — có thể triển khai ngay.

## 12. Hồ sơ bằng chứng kèm theo

- [Script tái hiện 5 lỗi](E:/apps/group-deal/reports/audit-repro.cjs).
- [Dependency backend](E:/apps/group-deal/reports/dependency-backend.json), [frontend](E:/apps/group-deal/reports/dependency-frontend.json), [contracts](E:/apps/group-deal/reports/dependency-contracts.json).
- Source tại commit nêu đầu báo cáo; file PLAN.md của người dùng là chuẩn yêu cầu được đối chiếu.

**Quyết định nghiệm thu đề xuất: không thông qua ở hiện trạng.** Có thể tiếp tục phát triển từ các thành phần tốt hiện có, nhưng phải đóng các lỗi P0, hoàn thiện P1 và chứng minh toàn bộ hành trình tài chính/giao hàng/vận hành trên bản triển khai trước khi gọi dự án hoàn thành theo PLAN.

## 13. Kiểm thử frontend bằng thao tác trình duyệt — bổ sung 29/09/2026

### 13.1. Môi trường và cách đọc kết quả

Đã chạy Vite tại `http://127.0.0.1:5173` và backend biên dịch của dự án tại cổng 4000. Backend chạy từ bản sao trong thư mục tạm với database seed riêng; frontend gọi API thật, không dùng mock response. Không có RPC hoạt động tại `127.0.0.1:8545`. Vì vậy đây là kiểm thử UI–API cục bộ, gồm tình huống mất RPC/API, **không phải bằng chứng giao dịch Arc đã thành công**. Dùng trình duyệt desktop và viewport mobile 375×812; kiểm tra DOM, thao tác form/nút và chụp ảnh.

Tài khoản `frontend-audit@example.test`, seller `Audit Seller Local`, campaign `AUDIT UI Campaign — local only` là dữ liệu kiểm thử. Đăng nhập, đăng ký seller, tạo/publish campaign, gửi support, review và xử lý operator được thao tác qua UI. Riêng bốn đơn 9001–9004 được thêm trực tiếp vào **database tạm** để mở các màn hình downstream: PENDING, DELIVERED, DISPUTED, BREACHED_REFUNDED. Đây là fixture, không được tạo bằng giao dịch mua thành công. Buyer và seller của các fixture là cùng tài khoản; giới hạn này đặc biệt quan trọng khi đọc ca support.

Fixture 9004 cố ý có trạng thái BREACHED_REFUNDED nhưng refund bằng 0, để kiểm tra cảnh báo đối soát. Không quy lỗi thiếu tiền của fixture này cho sản phẩm. Payload giao hàng chỉ là `AUDIT-NONSECRET-PLACEHOLDER`; không dùng license, tiền hoặc thông tin khách hàng thật.

File database gốc không đổi; SHA-256 trước/sau: `3FE625456875ED96B05A1974CFB28E8896BA76B50F63EA7395413A70FECAAE97`. Không sửa mã ứng dụng. PASS dưới đây chỉ áp dụng cho thao tác được mô tả, không xác nhận cả module đã an toàn. FAIL là sai hành vi đã quan sát; PARTIAL là có phần chạy được nhưng còn lỗi/giới hạn; BLOCKED là chưa thể kiểm chứng với cấu hình hiện có.

### 13.2. Ma trận thao tác và kết quả thực tế

| ID | Thao tác / điều kiện | Kết quả quan sát | Đánh giá |
|---|---|---|---|
| B01 | Mở Explore từ database seed mới | Hiện 3 campaign; mở chi tiết được | PASS phần tải danh sách/điều hướng |
| B02 | Lọc danh mục AI | Còn 1 campaign đúng danh mục | PASS |
| B03 | Đối chiếu số liệu trang chủ với seed có tổng committed bằng 0 | Vẫn hiện $42,850 và -42.5% | FAIL — UI01 |
| B04 | Mua khi chưa đăng nhập; tăng quantity 1→2 | Tổng 199→398 USDC đúng; checkbox điều khoản chặn submit; submit sau đó chỉ alert yêu cầu đăng nhập | PARTIAL — thiếu dẫn tiếp tới đăng nhập/giữ ý định mua |
| B05 | Nhập OTP sai `000000`, rồi đăng nhập bằng mã ứng dụng cung cấp | Mã sai bị từ chối; mã hợp lệ đăng nhập được; UI tự hiện/điền OTP | PASS validation sai; FAIL bảo mật F01 |
| B06 | Mua sau đăng nhập khi RPC không chạy | UI báo “Giao dịch thất bại / Failed to fetch”, không có tx hash | PASS nhánh hiển thị lỗi; BLOCKED mua thành công; lỗi quá chung, không có hướng khắc phục |
| B07 | Tải cấu hình contract qua frontend `/health` | HTTP 200 `text/html`, JSON parse lỗi; địa chỉ contract fallback trống | FAIL — xác nhận lỗi cấu hình đã nêu |
| B08 | Đăng ký seller với ví sai, rồi ví hợp lệ | `invalid-wallet` bị từ chối; ví hợp lệ đăng ký được; trường payout ban đầu trống dù đã đăng nhập | PARTIAL — đồng bộ giá trị ví chưa tốt |
| B09 | Tạo campaign, sửa tier thứ hai từ 75 thành 150 với tier đầu 100, tier cuối 50 | Form chấp nhận cấu hình giá tăng rồi giảm; publish thành công | FAIL — validation UI/API thiếu |
| B10 | Bấm dry-run delivery | UI hiện đã kiểm tra và mở quyền publish dù endpoint POST `/api/campaigns/test-delivery-temp` trả 404 | FAIL nghiêm trọng — dry-run thành công giả |
| B11 | Publish campaign khi RPC không hoạt động | Seller dashboard và DB ghi PUBLISHED, onchainCampaignId=4; không có giao dịch chain | FAIL — xác nhận luồng DB-only |
| B12 | Kiểm tra khả năng cấu hình trong wizard | Chỉ thấy 3 hàng tier cố định; duration 3/7/14/30 ngày, không có 24h; thiếu các điều khiển đầy đủ theo PLAN | FAIL độ đầy đủ chức năng; không phải lỗi build |
| B13 | Mở fulfillment bằng 4 fixture | Hiện 4 đơn, 1 pending | PASS hiển thị fixture |
| B14 | Giao payload giả cho đơn 9001 khi campaign chưa finalize, RPC tắt | Chuyển sang DELIVERED, có dữ liệu mã hóa lưu DB | FAIL state machine/chain integration; không chứng minh giao hàng onchain |
| B15 | Mở Buyer Orders với fixture | Hiện 4 đơn và tổng rebate 40 USDC, các badge trạng thái | PASS render dữ liệu fixture; chưa chứng minh khoản tiền có thể claim |
| B16 | Bấm giải mã nội dung đơn đã giao | Đã thao tác nút; chưa xác nhận độc lập plaintext đầu ra khớp payload | Chưa đủ bằng chứng PASS round-trip encryption |
| B17 | Gửi support từ Buyer Orders | Tin nhắn lưu/hiện nhưng nhãn SELLER; tài khoản fixture đồng thời là buyer và seller | PARTIAL — vai trò theo ngữ cảnh chưa rõ; không khẳng định lỗi cho mọi buyer |
| B18 | Gửi review cho đơn 9001 | DB có review, nút review của đơn biến mất; nội dung review vừa gửi không thấy trên màn hình đang kiểm tra | PASS lưu review; PARTIAL phản hồi UI |
| B19 | Từ tài khoản thường chọn “Đăng nhập Admin (Test Demo)” | Vào được operator portal | FAIL P0 — tái hiện đường nâng quyền F01 |
| B20 | Operator xử lý dispute 9003, chia 50/50 | Đơn chuyển RESOLVED, buyer 45 và seller 45 USDC sau rebate 10; danh sách dispute về 0 dù RPC tắt | FAIL luồng settlement DB-only; phép chia fixture đúng |
| B21 | Mở reconciliation với fixture 9004 cố ý sai | Có cảnh báo discrepancy | PASS phát hiện fixture không bảo toàn; chưa chứng minh đối soát onchain |
| B22 | Quan sát menu tài khoản sau chuyển sang operator | Tên/email operator đã đổi, địa chỉ ví vẫn của buyer trước đó | FAIL — UI03 |
| B23 | Chuyển ngôn ngữ English | Navigation và một số tiêu đề đổi; nhiều mô tả, lỗi, nhãn vẫn tiếng Việt | FAIL i18n đầy đủ — F30 |
| B24 | Mở campaign detail tại 375×812 | Viewport 375px nhưng document 879px; tiêu đề/nội dung bị cắt, cột mua nằm ngoài viewport | FAIL mobile — UI02 |
| B25 | Mở Chia sẻ / QR | Hiện QR, link đúng campaign và mã iframe; chưa scan QR bằng thiết bị khác hoặc kiểm chứng clipboard | PASS render/link; giới hạn như mô tả |
| B26 | Kiểm tra đích iframe widget | HTTP 200 `application/json`, không phải trang widget HTML | FAIL — xác nhận widget chưa hoàn chỉnh |
| B27 | Truy cập `#campaign-999999` | API trả 404; UI vẫn “Đang tải thông tin chiến dịch từ Arc Testnet...” sau khi request kết thúc | FAIL — UI04 |
| B28 | Dừng backend thử nghiệm, tải lại Explore | Hiện “Không có chiến dịch nào…” và 0 campaign; không báo lỗi API/retry; số liệu $42,850 vẫn hiện | FAIL — UI04 và UI01 |
| B29 | Mua→receipt→indexer→claim, confirm/dispute/timeout trên chain | Chưa có RPC/contract/wallet hoạt động phù hợp để chạy toàn chuỗi | BLOCKED; tuyệt đối không tính đã nghiệm thu |
| B30 | Ví ngoài, từ chối chữ ký, đổi account/chain, faucet, reload lúc pending, recovery Circle | Chưa thực hiện đầy đủ | Chưa xác minh; cần bộ regression riêng |

### 13.3. Các lỗi frontend cần bổ sung/chốt sửa

**UI01 — P1 — Số liệu marketing được hardcode, kể cả khi API mất kết nối.** [ExplorePage.tsx:125](E:/apps/group-deal/frontend/src/pages/ExplorePage.tsx:125) và [dòng 143](E:/apps/group-deal/frontend/src/pages/ExplorePage.tsx:143) luôn hiện $42,850 và -42.5%. Đây là số liệu tài chính dễ làm người dùng hiểu sai mức sử dụng sản phẩm. Thay bằng aggregate có định nghĩa, nguồn và thời điểm cập nhật; chưa có dữ liệu thì hiện “chưa có dữ liệu”, hoặc gắn nhãn demo rõ ràng ở môi trường demo. Tiêu chí kiểm lại: seed rỗng không thể hiện volume có thật; API lỗi không biến thành thống kê hợp lệ.

**UI02 — P1 — Trang mua hàng không dùng được đầy đủ trên mobile.** [CampaignDetailPage.tsx:161](E:/apps/group-deal/frontend/src/pages/CampaignDetailPage.tsx:161) giữ grid `1fr 380px`; phép đo DOM thực tế `innerWidth=375`, `document.documentElement.scrollWidth=879`. Chuyển thành một cột ở breakpoint nhỏ, cho con co lại bằng `min-width:0`, kiểm tra wrap badge/tên seller và nút mua. Không chữa bằng cách chỉ ẩn overflow vì sẽ tiếp tục che chức năng. Kiểm lại 320/375/768px, portrait/landscape và modal checkout bằng thao tác thực.

**UI03 — P1 — Account hiển thị và trạng thái ví không đồng bộ khi đổi người dùng.** [Web3Context.tsx:60](E:/apps/group-deal/frontend/src/context/Web3Context.tsx:60) chỉ sync khi `walletMode === DISCONNECTED`; đổi `user` trong khi đang CIRCLE_EMBEDDED giữ ví cũ. Đã thấy tên operator nhưng địa chỉ buyer trong menu. Signer lại được dựng từ `user.circleWallet` ở [dòng 76](E:/apps/group-deal/frontend/src/context/Web3Context.tsx:76), tạo nguy cơ account hiển thị khác account ký/authorize. Chưa gửi giao dịch sai ví trong kiểm thử này. Cần reset/reconcile account, balance, chain và pending action khi login/logout/chuyển account, rồi kiểm tra principal ngay trước authorize/ký. Với ví injected phải có quy tắc liên kết rõ, không tự ép chuyển ví.

**UI04 — P2 — Không phân biệt loading, not-found, empty và lỗi mạng.** [CampaignDetailPage.tsx:58](E:/apps/group-deal/frontend/src/pages/CampaignDetailPage.tsx:58) không xử lý `response.ok`; điều kiện `loading || !campaign` giữ thông báo tải khi API đã trả 404. [ExplorePage.tsx:30](E:/apps/group-deal/frontend/src/pages/ExplorePage.tsx:30) chỉ log lỗi nên API chết trông như danh mục rỗng. Tách state rõ, thông báo lỗi có Retry/Quay lại; không nói “từ Arc Testnet” khi dữ liệu đang đến từ API offchain. Kiểm lại 404, 500, timeout, JSON lỗi, mất mạng và phục hồi.

**Các lỗi cũ nay có bằng chứng thao tác:** OTP/demo admin; dry-run thành công giả; tier không hợp lệ vẫn publish; publish/delivery/resolve DB-only; `/health` trả HTML; widget JSON; i18n chưa đủ. Đặc biệt [SellerDashboard.tsx:102](E:/apps/group-deal/frontend/src/pages/SellerDashboard.tsx:102) không kiểm tra `res.ok` và cả nhánh catch cũng đặt `isDryRunVerified=true`. Phải fail closed, có kết quả dry-run thực được backend xác nhận/gắn với phiên bản cấu hình và backend chặn publish khi thiếu bằng chứng. UI validation phải đi cùng validation backend/contract.

**Khả năng sử dụng và accessibility cần sửa:** support modal không có nút đóng trong DOM; source [BuyerDashboard.tsx:592](E:/apps/group-deal/frontend/src/pages/BuyerDashboard.tsx:592) có đóng bằng click overlay, nên không kết luận modal hoàn toàn không thoát được. Cần nút đóng có accessible name, Escape, focus trap và khôi phục focus; chưa chạy bộ audit WCAG/keyboard đầy đủ. Nút đóng Share là icon không có tên trong accessibility tree. Cần phản hồi review đã lưu, vai trò support theo quan hệ đơn và ngữ cảnh thao tác; tránh các lời hứa tuyệt đối về “không ai/hacker có thể đọc” khi mô hình key/server chưa bảo đảm điều đó.

### 13.4. Bằng chứng hình ảnh

Ảnh chứa dữ liệu demo/fixture, không phải giao dịch hay tiền thật. Các ảnh được lưu cùng báo cáo:

- [01 — Trang chủ](E:/apps/group-deal/reports/frontend-evidence/01-home.png).
- [02 — Mua thất bại khi thiếu RPC](E:/apps/group-deal/reports/frontend-evidence/02-checkout-failed.png).
- [03 — Dry-run báo đạt với tier sai](E:/apps/group-deal/reports/frontend-evidence/03-dryrun-false-success.png).
- [04 — Campaign publish khi không có chain](E:/apps/group-deal/reports/frontend-evidence/04-published-without-chain.png).
- [05 — Support từ buyer mang nhãn seller](E:/apps/group-deal/reports/frontend-evidence/05-support-wrong-role.png).
- [06 — Operator portal](E:/apps/group-deal/reports/frontend-evidence/06-operator-access.png).
- [07 — Campaign mobile bị tràn](E:/apps/group-deal/reports/frontend-evidence/07-mobile-campaign.png).
- [08 — Campaign 404 vẫn loading](E:/apps/group-deal/reports/frontend-evidence/08-missing-campaign.png).
- [09 — QR/link/iframe](E:/apps/group-deal/reports/frontend-evidence/09-share.png).
- [10 — Backend ngừng hoạt động bị hiển thị thành danh sách rỗng](E:/apps/group-deal/reports/frontend-evidence/10-backend-unavailable.png).

### 13.5. Thứ tự sửa và điều kiện kiểm thử lại

1. Đóng các lỗi bảo mật P0 ở phần chính, đặc biệt OTP/khóa ví/admin, trước khi cho người dùng thật truy cập.
2. Sửa validation và state machine từ UI đến backend/chain; dry-run phải thực sự thành công, không publish/delivery/settlement thành công giả. Chuẩn hóa health/network/contract config và đồng bộ account ví.
3. Sửa mobile checkout, số liệu giả, loading/error/not-found và hướng dẫn khôi phục khi mua thất bại.
4. Hoàn thiện wizard theo PLAN, i18n, support/review, accessibility và widget HTML.
5. Chạy regression bằng tài khoản buyer/seller/operator **riêng biệt**, campaign hợp lệ và chain thử nghiệm: create→dry-run→publish→authorize→approve→commit→receipt→indexer→finalize→deliver→decrypt→confirm/dispute→resolve→claim. Đối chiếu tx hash, event, trạng thái UI/API và số dư; thêm retry, từ chối ký, đổi ví, reload pending và backend/RPC outage. Fixture downstream không thay thế bước này.

**Kết luận sau kiểm thử frontend:** đã kiểm tra thao tác thực tế, không chỉ đọc source/build. Frontend còn lỗi ở cả hành trình nghiệp vụ, trạng thái tài khoản, mobile và xử lý lỗi; cần chỉnh sửa trước nghiệm thu. Các thao tác UI–API thành công hiện tại không đủ chứng minh quyền tài chính và trạng thái onchain đúng.

