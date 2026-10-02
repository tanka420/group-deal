# RUNBOOK VẬN HÀNH GROUPDEAL TRÊN ARC TESTNET

**Ngày:** 29/09/2026

**Phạm vi:** release candidate Arc Testnet

**Nguyên tắc:** Arc/`GroupDealHub` là nguồn sự thật tài chính. Không sửa allocation, order status tài chính hoặc checkpoint bằng thao tác trực tiếp trong SQLite để “chữa” incident.

## 1. Tín hiệu và ngưỡng phản ứng

| Tín hiệu | Ngưỡng | Mức độ | Hành động đầu tiên |
|---|---:|---|---|
| `/api/health` không phản hồi | 2 lần kiểm tra liên tiếp/1 phút | HIGH | Dừng publish/commit ở UI, giữ read-only, kiểm process và manifest |
| Arc RPC lỗi hoặc chain ID khác `5042002` | 1 lần fail manifest; 3 lỗi RPC liên tiếp | CRITICAL | Fail closed mọi write, chuyển provider đã phê duyệt, không đổi manifest tùy tiện |
| Indexer lag | `>10` blocks | MEDIUM | Đặt UI `RECONCILING`, chạy backfill từ checkpoint |
| Reconciliation `UNVERIFIED` | 1 lần | HIGH | Chặn quyết định vận hành dựa trên balance DB |
| Reconciliation `DISCREPANCY_DETECTED` | bất kỳ sai lệch | CRITICAL | Đóng write path ứng dụng, chụp fixed block, không chỉnh DB thủ công |
| Email outbox `DLQ` | bất kỳ job | MEDIUM | Kiểm provider/token, replay có audit sau khi sửa nguyên nhân |
| Webhook DLQ | bất kỳ job; tăng liên tục trong 15 phút | MEDIUM/HIGH | Kiểm endpoint/SSRF/DNS/status code; seller replay từ API |
| Backup/restore checksum hoặc GCM fail | bất kỳ | CRITICAL | Cô lập bản backup, dùng bản gần nhất đã xác minh; không bỏ qua auth tag |
| Circle/Reown/Bridge credential thiếu | health flag hoặc frontend fail-closed | HIGH trước live test | Không nghiệm thu live, bổ sung credential qua secret manager |

## 2. Kiểm tra nhanh

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/health
npm run test:arc-smoke
npm run verify:pipeline
```

`/api/health` phải báo đúng Hub/USDC và các cờ `circleWalletsConfigured`, `transactionalEmailConfigured`. `test:arc-smoke` chỉ đọc mạng; không thay thế live journey.

## 3. Arc RPC hoặc manifest không hợp lệ

1. Giữ hệ thống ở fail-closed; không chuyển sang local chain/MockUSDC.
2. Kiểm RPC trả chain ID `5042002`, bytecode Hub khớp manifest và USDC predeploy là `0x3600000000000000000000000000000000000000`.
3. Chạy `npm run test:arc-smoke`; lưu block, hash probe và thời gian sự cố.
4. Nếu đổi RPC, chỉ đổi secret/config, khởi động lại và để manifest validator kiểm lại.
5. Sau phục hồi, backfill indexer từ checkpoint và chạy reconciliation tại fixed block trước khi mở write.

## 4. Giao dịch pending, dropped hoặc timeout

1. Không coi HTTP timeout là thất bại và không gửi lại với operation ID/payload khác.
2. Tra operation ID, tx hash, Circle challenge/transaction status và Arc receipt.
3. Nếu receipt thành công, chờ indexer/backfill; không cập nhật order/campaign bằng DB-only.
4. Nếu revert, ghi selector/revert reason đã giảm thiểu dữ liệu và cho user tạo intent mới.
5. Nếu dropped/replaced, xác minh sender/nonce; chỉ retry bằng cùng idempotency semantics và policy.

## 5. Indexer gap hoặc restart

1. Đọc checkpoint, latest Arc block và `indexerLagBlocks` từ reconciliation.
2. Khởi động lại indexer; poller phải backfill theo `(blockNumber, transactionIndex, logIndex)`.
3. Không sửa journal key `${chainId}_${emitter}_${txHash}_${logIndex}`.
4. Nếu projection nghi ngờ, chạy clean rebuild từ deployment block vào schema sạch.
5. So sánh projection và fixed-block reconciliation; chỉ mở write khi `HEALTHY`.

Arc deterministic finality không loại bỏ nhu cầu xử lý gap/RPC failure. Candidate không tự giả định hoặc áp dụng Ethereum-style reorg rollback.

## 6. Reconciliation discrepancy

1. Chụp fixed block number/hash, Hub USDC balance, liabilities, indexer checkpoint và report.
2. Chặn các thao tác UI phụ thuộc projection; vẫn giữ direct onchain fallback cho principal.
3. Phân loại: missing event, duplicate identity, decode fail-closed, wrong unit 6/18, hoặc contract liability.
4. Sửa indexer/decoder rồi rebuild; không sửa allocation trong SQLite.
5. Escalate CRITICAL nếu conservation law hoặc solvency sai; yêu cầu reviewer độc lập trước mở lại.

## 7. Backup và restore

1. Dừng writer hoặc tạo maintenance window; giữ nguyên file nguồn.
2. Dùng encrypted backup AES-256-GCM, kiểm checksum và auth tag.
3. Restore vào đường dẫn/schema sạch, không ghi đè bản đang chạy trước khi xác minh.
4. Chạy integrity chain, unique constraints, indexer rebuild và fixed-block reconciliation.
5. Chỉ chuyển traffic khi report `HEALTHY`; lưu audit của người thực hiện và checksum artifact.

## 8. Email/Webhook outbox và DLQ

- Email worker chạy mỗi 15 giây, tối đa 5 lần với exponential backoff. Sửa provider URL/token qua secret manager rồi replay có audit; không gửi entitlement/secret trong nội dung.
- Webhook queue kiểm HTTPS, DNS/redirect và private ranges ở mỗi lần gửi. Seller chỉ replay record thuộc chính mình qua `/api/seller/webhooks/dlq/:dlqId/replay`.
- Nếu DLQ tăng liên tục, tạm ngừng endpoint lỗi thay vì làm chậm indexer hoặc financial path.

## 9. Rotation credential

1. Rotate JWT, campaign identity, encryption, Circle, email và signer key riêng rẽ; không ghi key vào log/báo cáo.
2. Key mã hóa/campaign identity cần kế hoạch tương thích dữ liệu cũ; không thay nóng khi chưa có migration.
3. Restart và xác minh fail-fast production, health flags, Circle identity binding và EIP-712 signer address.
4. Thu hồi credential cũ sau khi candidate mới đã qua smoke.

## 10. Điều kiện đóng incident

- RPC/manifest hợp lệ, indexer không lag quá 10 block.
- Reconciliation tại fixed block là `HEALTHY`, không có conservation/solvency discrepancy.
- Không còn job bất thường trong outbox/DLQ hoặc đã có owner/ETA/audit rõ ràng.
- Pipeline candidate xanh; mọi giao dịch dùng làm bằng chứng có tx/receipt/event/explorer.
- Incident tài chính/credential phải được reviewer khác người sửa xác nhận trước khi đóng.
