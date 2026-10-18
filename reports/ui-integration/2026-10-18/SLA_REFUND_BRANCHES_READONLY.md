# SLA quá hạn và hoàn đủ buyer — 18/10/2026

Đơn3 đã được đối chiếu bằng52 public RPC chỉ đọc tại finalized 67782927 (0x468d62fa2031643c9f93a10e98308c07226d68868afe59ce32b830ff1c7c17be). Ba receipt cũ đều thành công, exact call/calldata/principal/nonce/value0/event/native operation/history và canonical block khớp. BUY nonce12/block66794310 tự finalize sold-out; BREACH nonce13/block66966699 ghi vi phạm; BUYER_CLAIM nonce14/block66966882 chuyển đủ tiền. Không phát lại giao dịch.

SLA86400giây bắt đầu tại finalizedAt1791795861 của receipt mua đủ hàng, deadline1791882261 (13/10/2026 16:04:21 UTC+7), điều kiện breach là strictly greater. Snapshot ngay block trước breach vẫn PENDING, không delivery timestamp/proof. Sau breach, gross2000000 gồm rebate400000 và buyerRefund1600000, sellerAllocated0; escrow/Hub vẫn2000000 và buyerClaimed0. Ghi nhận allocation chưa chuyển token.

Receipt claim có FundsClaimed buyer/2000000/type0 và đúng một USDC Transfer từHub sangbuyer2000000. Buyer nhận đủ2USDC; escrow campaign3 và Hub balance về0, seller0. Snapshot current/native vẫn BREACHED_REFUNDED/buyerClaimed2000000, không grant giao hàng; ba operation PROJECTED. Năm snapshot cùng block cho từng bước/previous/current kiểm conservation. Chỉ scope order3, không chứng nhận mọi đơn hoặc mọi tình huống outage.

Hai reservation BUY/BREACH RELEASED có completion hash/nonce/block khớp. Reservation claim cuối sr_60abf8cb8128026bb43ecbad5060982762a89b72839e3ca958547408c88d95a7 vẫn ACTIVE, chưa completion; nonce14 được đọc từ receipt. Không gọi đó là release proof, không release/chỉnh DB. Ledger52flows/64reservations giữ SHA256 209d178f55e26c607962caabe5265e7a922678849fe81f70733a565f17f7d6b4;95held jobs giữ nguyên.

Giữ hai lượt READ_UNCONFIRMED: lượt đầu guard của exporter gán BUYER_CLAIM theo orderId trong khi schema source dùng campaignId; lượt sau giả định mọi reservation đã hoàn tất phải có completion, trong khi claim cuối đang ACTIVE. Diagnostic whitelist xác nhận đúng schema/phase; công cụ được sửa phân loại đúng, không sửa sản phẩm/DB. Log và các phiên bản công cụ lưu nguyên. Không biến lượt chưa xác minh thành PASS.

Hồ sơ ngày12–13/10 về hosted native UI/human wallet được kiểm hash. Claim cũ từng RECEIPT_UNVERIFIED rồi nút native receipt khôi phục cùng intent thành PROJECTED, không duplicate transaction. Đây là bằng chứng lịch sử, không tái chạy current authenticated frontend/session/device recovery. G5-05/06/07/09/10 cập nhật đúng tầng. Order1 delivery và order2 claim proofs kế thừa timestamp riêng.

Source checkout trước gói e20d91bd7d4dca989e7d72a3ab545aecbb082cf6 sạch; 51 source/test inventory hashes khớp, không phải test execution. Backend30fea223380affc471cc91f4ab2390814ddaa87c/frontend8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07/SDK5458925313a8b8f2d6d4a63eb6c77f4e5df9eb6c/ops73b6fae5a33eda1dfc9ab6c3364d9fcfa65809b8 giữ. VPS sole writer:377runtime/185public/PID97197/NRestarts0/backup VERIFIED/privateRestore/BACKUP_CURRENT/timers quan sát 2026-10-18T04:21:30.607Z. Safe authority/control kế thừa04:10UTC, user đã xác nhận3người ký khác nhau; không yêu cầu ký lại hoặc giữ kết luận1người hiện hành.

Không source/deploy/restart/fulltest/CI, app/DB local snapshot, credentials/private resources/license reads, ký/broadcast/OTP, Circle/provider create/transfer/email hoặc quyền tài khoản thật. Circle/admin live vẫn hoãn; username/social POST-V1. Offhost/RPO/RTO, các nhánh live/provider/receiver/current UI còn thiếu và G5/G6 review vẫn OPEN. NOT_FROZEN; acceptanceEligible=false; wholeProjectAccepted=false.

Chuẩn hóa metadata trước bàn giao: cờ strictly-after-deadline thuộc nhánh BREACH; BUY khởi tạo đồng hồ SLA. Receipt, kết quả RPC và snapshot giữ nguyên; gói ban đầu được giữ lịch sử.

Proof: reports/evidence/breach-branches-readonly/2026-10-18T04-25-34-432Z-final/CHECKS.json
SHA256: 2421629aab3026c04f2d595545a35d7d592f82187306bbfe7636a08b2cfddc7b
