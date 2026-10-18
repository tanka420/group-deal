**Chốt UI —18/10/2026:** frontend1909e4f97110d70b17a77ed86d232584c69a91c9 đã push/deploy;giữbố cục ac1dff5,thêm1dòng focus NạpUSDC từdropdown.1CUAfocus/typecheck-build/14HTTPS đạt;18CUA/22responsive/live2rights3seller/preview kếthừa đúngtimestamp,khôngrerunfullmatrix.377runtime/184activepublic(180+4Safe)/3242filesystem/PID97197/Nginx/backupCURRENT giữ;native2026-10-18T07:18:15.108Z sameFILE_LINKopPREPARED/nohash,5oldorders/ledger52/64/hash209d178f/95held giữ. KhôngyêucầuuserchoUI,ký/provider/Circle/replay/heldrelease. Observerclone .cache/workspace-focus-ops-after.cjs +manifest .cache/workspace-focus-public-files.json,đổioutputwx khi chạy mới. NOT_FROZEN/G5G6OPEN. CURRENT reports/evidence/workspace-ui-focus/2026-10-18T07-16-39-043Z/CHECKS.json,SHA256 6bfaa2abbad0e6fbeb1724f4eed3cf2bd99807bd9e115b43f53902c396b0cb0d.

**Giao diện workspace —18/10/2026:** frontendac1dff554af998c0fb700289ea635b00a9f6bf01 đã push/deploy:admin/sellerfullwidth,sidebartrái cố định desktop/drawer mobile;header chỉTrangchủ/Khámphá,kênhngườibán trongdropdown;rights/seller/products thànhdanh sách,form mởkhi cần;preview bằngnútmắt,giữnháp.18CUA/22responsive320–1280VIENsubsets/typecheck-build/14HTTPS đạt;live2rights/3seller/draftv3read-only đạt sau409→reload200. KhôngfullmatrixCI/financialmutations.377runtime/active184public(180main+4Safe)/3156filesystem/PID97197/NRestarts0/Nginx/backupCURRENT giữ. SameFILE_LINKopop_1510d8a7-f9d8-4c8e-bb38-4eebe9079f8b PREPARED/nohash,5oldorders/ledger52/64/hash209d178f/95held giữ tại2026-10-18T07:11:53.947Z. Mởđúng draft_d702e1b5 URL;khôngreload/publishdraft_060mặcđịnh. Circle/adminmutationskhác hoãn;NOT_FROZEN/G5G6OPEN. [Báo cáo](E:/apps/group-deal/reports/evidence/workspace-ui/2026-10-18T06-43-43-002Z/WORKSPACE_UI_LAYOUT.md). CURRENT reports/evidence/workspace-ui/2026-10-18T06-43-43-002Z/CHECKS.json,SHA256 3b7181c810fb149171305b8f83b4b83055e4285a5204dca6fc8aa62eeb169414.

# R5–R7 — hồ sơ kiểm UI, 18/10/2026

Frontend 8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07; backend 324bca2dc3230bd2721e2582ba282eb42c0ba10b; CI header https://github.com/tanka420/group-deal/actions/runs/39057530023; CI ma trận kế thừa https://github.com/tanka420/group-deal/actions/runs/39056124729 tại ef281a6. Phần sửa source và hồ sơ kiểm UI độc lập đã khép trong phạm vi bên dưới. Nghiệm thu hành trình thật G5 vẫn mở.

| Tiêu chí | Source/proof | Trạng thái đúng phạm vi |
|---|---|---|
| R5 ngữ cảnh mua/nạp/swap/ký/giao/xác nhận/tranh chấp/claim | R5_CONTEXT.md; 30 ca context/money + 6 external fee trên ba engine; 11 gói kế thừa, 664 artifact đã đối hash | Mapping tám hành trình + fixture đã có; không thay receipt/provider thật |
| R6 giá, tiền hàng, phí, tối đa cần có, min nhận, allowance, TTL | PurchaseBudgetReview, CircleFeeReviewModal, ExternalFeeReviewModal, walletFlow; exact/base units/UTC+7/metric/no-false-zero kế thừa; 6 ca VI/EN text200 mỗi engine × 7 widths | Nhãn/reflow và consent fixture đạt; dữ liệu tài chính/backend không đổi |
| R7 VI/EN, form, nháp, xác nhận, keyboard/focus, nội dung dài/text200 | 34 route × 2 ngôn ngữ × 2 khổ × 3 engine = 408 lượt; 30 lượt lỗi tải + retry; 48 coverage JSON; form/auth/support/product/resource/notifications/admin proof kế thừa | Hồ sơ hữu hạn đã có, không còn mục mơ hồ “chưa lập bảng whole-app/cross-browser”; không chứng nhận accessibility100% |

Các lỗi đã sửa: header desktop xuống dòng ở text200 và trigger Safari/WebKit giữ focus/Escape; nút admin/deal không tràn; review ngân sách/phí, stepper số lượng giữ đủ thông tin; hoàn thiện EN trong Docs. Ma trận có Chrome/Chromium, Firefox và WebKit (engine, không thiết bị Safari/iPhone thật). Mobile375 và desktop1280 text200, nội dung dài; review tiền/phí thêm320/375/430/768/1024/1280/1440. Keyboard lấy mẫu theo route; trap/Escape/return focus và các trạng thái form/recovery dùng proof chuyên biệt được kế thừa, không suy mọi tổ hợp state/device/assistive tech đều được kiểm.

Ma trận ghi rõ các response404/503/UNVERIFIED trong coverage JSON: không coi trang lỗi là danh bạ/quyền authenticated live. Guest/separate-session/admin profile native fixture có proof cũ; user hoãn admin thật.

CI https://github.com/tanka420/group-deal/actions/runs/39056124729 tại ef281a6:30dev context +6dev external +54built matrix +18built navigation; CI hiện hành https://github.com/tanka420/group-deal/actions/runs/39057530023:24built header VI/EN/focus +6dev purchase header, không SKIP; type/build/tooling đạt. Production bundle 181 hash trước/sau,15ca smoke trên ba engine đạt. Giữ FAIL ban đầu và các sửa fixture: RPC chỉ đọc mock/CORS, ảnh viewport/từng mục cho trang dài, catalogue DTO, order detail route, realm support, Tab ra/vào browser, Reown configuration; hai run CI cũ đã dừng, không gọi đạt. Không full CI hoặc app/DB local.

Phần cần người dùng/provider: Circle chiều ngược/cirBTC execution khi có route, các recovery/live branches theo G5, seller/admin authenticated và email nghiệp vụ. Không replay đơn/giao dịch đã xong hoặc ký thay. Safe control/custody/offhost/RPO/RTO là các bước vận hành sau UI, vẫn mở.

VPS:377runtime/181public khớp; PID3655922/NRestarts0; Nginx giữ, backup VERIFIED/privateRestore/BACKUP_CURRENT,95held giữ. Metadata/receipt tài chính trong parent được tái sử dụng theo thời điểm 2026-10-16T23:04:55.130Z; gói này không đọc lại DB hoặc tạo giao dịch. Candidate NOT_FROZEN; G5/G6 OPEN.

Proof: reports/evidence/r567-matrix/2026-10-17T18-24-51-868Z/CHECKS.json
SHA256: 967a6440390cf708b2e9370b2d293f33c418c64e24f4057164be282c5105027f

# R5 — ngữ cảnh tám hành trình

| Hành trình | Trước | Điều kiện chuyển | Unknown/recovery | Sau/quay lại | Source test/proof |
|---|---|---|---|---|---|
| Mua | Buyer + campaign/terms + quantity + principal | Review cùng dữ liệu; đổi amount/account làm mất consent | BUY operation/checkout key/hash; thiếu receipt giữ checkpoint | returnTo catalog; order.id chỉ sau projection | purchase_budget; buy_expiry; guest_checkout; checkout |
| Nạp/nhận | Account + selected wallet + asset/network | Địa chỉ/mạng hiện trực tiếp; đường quay lại yêu cầu mua | Không coi callback/provider là tiền đã nhận | Quay review mua; nháp giữ theo principal | wallet_flow; funding_recovery; bridge_fee_review |
| Swap/gửi/ký | Wallet + token pair/recipient + amount + quote/TTL | Exact allowance/spender/min nhận/phí; consent riêng | Giữ flow ID, step, nonce/hash; chỉ đọc lại cùng yêu cầu | Kết quả xác minh hoặc yêu cầu mới rõ ràng | wallet_flow; external_fee_review; circle_fee_review |
| Giao hàng | Seller + order.id + product/version/resource | Review entitlement/license đã ghim | Operation/hash/grant; unknown không phát lại key | Đơn cũ giữ quyền và route | product_resource_commands; delivery_retry; resource_terminal_recovery |
| Xác nhận | Buyer principal + order.id + cửa sổ chain | Review đúng đơn, ready fields/account phải khớp | Operation/hash/checkpoint; callback chưa đủ | Về chi tiết cùng đơn | managed_dialogs; buyer_integration |
| Tranh chấp | Buyer/operator + order.id + lý do/bằng chứng | Lỗi tại trường, giữ nháp, xác nhận đúng chủ thể | Unknown giữ request; late account không đổi đơn | Đơn/support giữ mã đơn và returnTo | application_ui; operator_deal_sections; managed_dialogs |
| Claim buyer | Buyer + campaign + order IDs + cumulative allocation | Số claimable đã kiểm; không thay bằng boolean claimed | Partial/unknown giữ intent/hash; không ký lại sau reload | Về chi tiết đơn; không replay đơn1–5 | financial_projection; managed_dialogs |
| Claim seller | Seller + campaign + allocation/claimed | Tách cam kết/doanh thu đã phân bổ/phần còn rút | Ready/same principal/operation/hash; unknown giữ | Về revenue cùng campaign | seller_integration; seller_workspace; managed_dialogs |

Đây là mapping UI/fixture, không xác nhận mọi nhánh G5 đã chạy thật. Các chuyển trạng thái nghiệp vụ không đổi; header được sửa focus trigger; proof kế thừa có timestamp/phạm vi trong INHERITED.json.
