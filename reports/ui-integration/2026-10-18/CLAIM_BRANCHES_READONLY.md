# Claim theo phân bổ và refund bổ sung — 18/10/2026

Đã đối lại bốn giao dịch **đã hoàn tất** của đơn#2 bằng 49 public RPC methods chỉ đọc; không gọi lại giao dịch, không ký/broadcast hay ghi metadata. Frontend 8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07, backend 30fea223380affc471cc91f4ab2390814ddaa87c, SDK 416ab71a7f94cd8b71aa6b34780d373eb9f7bf52 và source checkout 3d8b86f5ef00aeda369f19a7f90d023eaaa87b64 giữ nguyên. Gói này chỉ bổ sung proof/map, không sửa hoặc deploy ứng dụng.

| Nhánh lịch sử | Block | Kết quả đã đọc lại |
|---|---|---|
| T201 buyer rút rebate trước settlement cuối | 66492038 | Transfer400000; gross2000000, rebate400000, buyer cumulative400000, còn1600000 chưa phân bổ. |
| T204 phân xử phần còn lại | 66494377 | Buyer refund800000 + seller800000 =1600000; rebate400000 không được phân bổ lần hai. |
| T205 buyer rút refund bổ sung | 66495069 | Transfer800000; buyer cumulative1200000, escrow còn800000. |
| T206 seller rút phần đã phân bổ | 66495595 | Transfer800000; seller cumulative800000, escrow0. |

Mỗi receipt khớp transaction hash/from/to/nonce/calldata đầy đủ/value0/status1, event/args/log index, block hash so với proof cũ và đọc canonical lần hai. Ba claim có ERC20 Transfer đúng Hub→principal và đúng số tiền. getOrderDetails/buyerClaimedAmount/campaignStates/campaignEscrowBalance/campaignOrderIds/USDC balance được đọc tại chính block receipt; single-order campaign và totalSellerClaimed kiểm dẫn xuất seller claim của protocol1. Conservation và tất cả trường tài chính khớp snapshot cũ. Manifest và bytecode Hub đúng deployment; không gán V2 cho protocol1.

Đọc hiện hành tại finalized 67766041/0x0e92087d6eade06f6eebabb5463c88607fbe3ba618540d39dcc286c4862d87c0: order2 RESOLVED, buyer cumulative1200000, seller800000, rebate400000/refund800000/seller allocation800000, campaign escrow0 và Hub USDC0. Native order2 cùng bốn operation PROJECTED/tx hash/history khớp; fields/ledger trước-sau đọc không đổi. Ledger52flows/64reservations SHA256 209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4;95held giữ. 377 runtime files khớp admission và PID97197 giữ.

Đây là bằng chứng đã thực thi lịch sử và được đọc canonical mới, **không** phải chạy lại UI trên frontend mới. “Claim từng phần” ở đây là rút hết phần đã phân bổ tại thời điểm đó, rồi rút phân bổ mới; không xác nhận tính năng nhập tùy ý một phần số tiền. Số dư bằng0 chỉ là đọc trạng thái, không là proof gửi lại claim rồi revert. Không suy thành mọi order/batch/principal/recovery hoặc global realtime reconciliation đều đã đạt.

G5-08/09/10 đã có mapping chi tiết đúng nhánh, các phần khác kế thừa đúng thời điểm. Circle chiều ngược/cirBTC, current authenticated seller/admin (admin user đang hoãn), email nghiệp vụ, receiver/provider độc lập, Safe control/custody và offhost/RPO–RTO còn OPEN. Username/social sau bản đầu. NOT_FROZEN; G5/G6 OPEN.

Proof: reports/evidence/claim-branches-readonly/2026-10-18T02-04-50-874Z/CHECKS.json
SHA256: f6d66ca5a96dc7b3f6876348392f747cffcc92aae982ef24ce57a143cabf0132
