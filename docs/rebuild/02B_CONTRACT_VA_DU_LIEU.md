# GroupDeal contract kế toán và dữ liệu

Phần 2 của thiết kế kỹ thuật, gồm mục 5–6. Module, bảng và interface là thiết kế đề xuất cho codebase mới. Quy tắc sản phẩm xem nhóm 01; early rebate cần chốt trước bật.

[Mục lục](./README.md) · [Phần trước](./02_KIEN_TRUC_VA_DU_LIEU.md) · [Phần tiếp](./02C_GIAO_DICH_VA_TICH_HOP.md)

## 5 Đặc tả contract cần có

### Các nhóm hành động

| Nhóm | Hành vi cần cưỡng chế |
|---|---|
| Tạo/chỉnh campaign | Validate tier/limits/SLA/policy; payout proof; material terms chỉ đổi trước first paid commit |
| Commit | Authorization hợp lệ, nonce, principal, quantity cap, inventory, early slot, maximum amount theo intent và chuyển USDC nguyên tử |
| Finalise | Đóng campaign khi đủ điều kiện, chốt tier tốt nhất và final price; không xử lý toàn bộ buyer trong một loop |
| Rebate allocation | Tính theo protocol/version, idempotent theo order; lazy hoặc bounded batch |
| Delivery | Kiểm authority, order/campaign, deadline và proof hash; ghi timestamp/window theo đặc tả |
| Confirm/timeout | Buyer principal xác nhận sớm hoặc settlement sau hết cửa sổ khi không có dispute |
| Breach | Sau SLA và chưa có bằng chứng giao hợp lệ, phân bổ phần còn chờ về buyer |
| Dispute/resolve | Buyer mở đúng cửa sổ; operator chia chính xác phần đang tranh chấp, hai người nhận đã ghim |
| Claim | Pull-claim vào đúng principal; cumulative claimed ≤ allocation; có thể rút allocation mới phát sinh |
| Emergency cancel | Security authority; reason/audit; chỉ xử lý unallocated theo order/batch |

Contract cần chống reentrancy, replay, over-allocation, duplicate settlement và race. Một campaign phải ghim protocol version; thay economics phải dùng version/deployment rõ ràng. Quyền quản trị và khả năng thay signer/operator cũng cần đặc tả, không dùng owner toàn quyền như lối tắt nghiệm thu.

### Authorization mua

Thiết kế typed data nên chứa domain/version/chain/verifying contract và intent gồm campaign, terms hash, campaign identity, buyer principal, action, nonce, requested quantity, cumulative cap, maximum gross, require-early-slot và deadline. Trường cụ thể phải thống nhất với ABI và reference model.

Contract phải kiểm số tiền thực không vượt buyer cap. `maxQuantity` cần ghi rõ là giới hạn cho lần mua hay tổng lũy kế; nếu chọn tổng lũy kế, kiểm `unitsAlreadyBought + requestedQuantity ≤ maxQuantity`. Không dùng một field với hai nghĩa giữa API và contract.

Nonce được tiêu thụ chỉ trong transaction thành công. Hai ví cùng tranh principal/slot/tồn kho chỉ được một kết quả hợp lệ theo thứ tự chain. Deadline không vượt campaign end; authorization cũ không trở thành authorization mới khi retry.

### Early rebate đề xuất cần phê duyệt trước bật

Candidate V2 trong repository đưa ra cách giới hạn early benefit trên một unit. Công thức dưới đây là **đề xuất cho protocol mới**, không phải policy đã được chốt chỉ từ `PLAN.md`:

```text
L = lockedUnitPrice, F = finalUnitPrice, q = quantity
G = L × q
earlyValue = fixedAmount
          hoặc floor(L × earlyBps / 10000)
effectiveEarly = min(earlyValue, F)
totalBuyerRebate = (L − F) × q + effectiveEarly
remainingProductAmount = G − totalBuyerRebate
```

Với tier không lùi, `F ≤ L`; cap bằng `F` giữ early benefit trong giá trị một unit sau giảm tier. Percentage có cơ sở `L` trong đề xuất này và làm tròn xuống. Fixed/BPS loại trừ nhau; BPS không quá 10000; disabled fields bằng 0. Team phải chốt threshold đầu, tính khả thi các threshold theo metric/inventory và cap cấu hình trước publish.

Ví dụ `L=105`, `F=89`, `q=3`, early fixed 10: gross 315, base rebate 48, early 10, tổng rebate 58 và còn 257. Early fixed 100 được cap 89: tổng rebate 137, còn 178, tức hai unit còn lại vẫn có giá trị 89 mỗi unit. Khi chưa có quyết định, giữ early mặc định tắt và hoàn thiện các nhánh không phụ thuộc.

### Định luật bảo toàn

```text
B = rebateAllocated + buyerRefundAllocated
S = sellerGrossAllocated
U = committedGross − B − S
B + S + U = committedGross
0 ≤ buyerClaimed ≤ B
0 ≤ sellerClaimed ≤ S
outstandingLiability = Σ[(B − buyerClaimed) + (S − sellerClaimed) + U]
```

Fee 0 nên seller gross bằng phần của seller trong baseline. Nếu có phí tương lai, cần quy định seller net/platform allocation và conservation theo version; không thêm deduction trong UI/backend vào campaign cũ.

Hub balance phải đủ outstanding liability; khoản chuyển trực tiếp vào hub có thể tạo surplus và cần ghi riêng. Gas của buyer/seller không là escrow. Hai order có sai lệch bù trừ tổng vẫn phải bị phát hiện bởi per-order reconciliation.

### Event schema

Thiết kế event cho create/terms lock/tier/commit/finalise/rebate/delivery/breach/confirm/dispute/resolve/claim/cancel và authority changes. Mỗi event cần đủ ID và amount để dựng đúng projection theo version, hoặc có quy trình đọc state tại block tương ứng đã đặc tả. Claim phải biểu diễn amount và liên hệ order/campaign/principal đủ rõ để dựng claimed lũy kế.

Mọi event journal ghi chain, hub/emitter, transaction hash, block number/hash, transaction index, log index và ABI version. Không dùng một `txHash` duy nhất cho cả lịch sử order.

## 6 Mô hình dữ liệu tối thiểu

| Nhóm | Bảng hoặc thực thể | Trường và quan hệ trọng yếu |
|---|---|---|
| Danh tính | accounts, contacts, auth_sessions, auth_challenges | Subject được provider xác thực, contact verification, nonce/expiry/attempts, revocation |
| Ví | wallet_bindings, wallet_proofs | Account, normalized address, provider wallet ID, purpose, proof, active state/version |
| Seller | seller_profiles, seller_verifications | Hồ sơ, payout proof, identity badge, review/audit |
| Sản phẩm | products, product_versions, license_versions | Seller, edition, seats/unit, usage scope, duration, activation, support, media, content hash |
| Quyền phân phối | rights_declarations, rights_reviews | Product/license version, scope, private evidence, validUntil, reviewer/decision/history |
| Campaign | campaign_drafts, campaigns, campaign_terms, campaign_amendments | Snapshot/version, metric, tiers, limits, SLA, visibility, terms hash, payout, chain binding |
| Buyer trong campaign | campaign_identities | Account + deployment + campaign, stable identity, key version, pinned principal |
| Order | orders, order_allocations, order_claims | Composite chain ID, campaign/order ID, quantity, locked price, gross, B/S/U, claimed amounts, snapshot |
| Hành động | operations, operation_attempts | Actor, action, idempotency key, immutable payload hash, expected calldata/event, phase, tx/nonce/witness |
| Chain projection | event_journal, projection_checkpoints, deployment_bindings | Event uniqueness, block cursor, scope, projection generation/version |
| Giao hàng | resources, license_inventory, delivery_jobs, grants, delivery_proofs | Reserve/assign/consume state, order/quantity mapping, encrypted payload/key ID, provider idempotency/evidence |
| Tranh chấp | disputes, dispute_evidence, resolution_records | Order, window, reason hash, private files, two shares, operator proof, chain receipt |
| Hỗ trợ và review | support_threads, messages, attachments, reviews, seller_replies | Account/order ownership, ACL, retention, moderation, một review đủ điều kiện/order |
| Thông báo | notifications, preferences, follows, email_outbox | Recipient, source event, read state, retry, verified contact, unsubscribe |
| Tích hợp | webhook_subscriptions, webhook_jobs, webhook_dlq, receiver_inbox | Subscription scope, encrypted secret/version, event ID, attempts, signature, dedup |
| Vận hành | audit_log, reconciliation_runs, backup_manifests | Actor/action/result, fixed block/coverage/delta, restore validation, environment/source hash |

Tất cả amount lưu integer hoặc decimal integer string theo 6 decimals. JSON không dùng number cho tiền lớn. Timestamp phải ghi đơn vị rõ; API có thể dùng ISO 8601 UTC. Quantity/ID cũng cần integer bounds phù hợp, không chuyển uint256 thành JavaScript number thiếu kiểm tra.

### Constraints và transaction boundaries

- Unique ví ngoài đang active; unique provider subject; một campaign identity cho account/deployment/campaign.
- Unique binding `(chainId, hubAddress, onchainCampaignId)` và `(chainId, hubAddress, onchainOrderId)`; không lấy order ID trần làm ID toàn hệ thống.
- Unique event `(chainId, emitter, txHash, logIndex)`; projection mutation và checkpoint cùng transaction.
- Idempotency theo actor/scope/key, kèm payload hash. Cùng key khác payload phải conflict; retry cùng key trả hoặc resume cùng operation.
- Reserve/assign tài nguyên và lượng tồn kho giao hàng nguyên tử; một license không được cấp đồng thời cho hai order.
- Draft/product mutation có version hoặc locking; hai edit không ghi đè âm thầm. Session/authority được kiểm lại khi chuẩn bị phát hành kết quả nhạy cảm.
- Ghi source event và outbox job nguyên tử; replay projection không tự tạo lại side effect.

