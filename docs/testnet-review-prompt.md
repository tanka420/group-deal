# Prompt review GroupDeal Testnet

Khuyến nghị bắt đầu với **GPT-6-Astra · High** trong chat mới tại `E:/apps/group-deal`. Skill đã cài theo project; phiên bản upstream được pin trong [security-audit-skill.json](security-audit-skill.json). Việc chuẩn bị này chưa phải kết quả review ứng dụng.

Sao chép nội dung khối dưới đây:

```text
Review độc lập, tổng quan GroupDeal Testnet tại E:/apps/group-deal, kết hợp full security audit bằng skill đã cài. Trả báo cáo tiếng Việt, ưu tiên lỗi có tác động và bằng chứng cụ thể.

Trước tiên kiểm tra branch, commit, git status; đọc E:/apps/group-deal/AGENTS.md, PRODUCT.md, docs/architecture.md, docs/deployment-status.md và docs/security-audit-skill.json. Theo các hướng dẫn có hiệu lực; phân biệt source hiện tại, release record và runtime thực tế. Không dùng historical clone trong .cache/ci làm target; không khôi phục UI/stash cũ hoặc đụng worktree Mainnet.

Đọc E:/apps/group-deal/.agents/skills/security-audit/SKILL.md; dùng full audit mode, profile standard và các companion phù hợp. Được dùng subagent theo workflow, với verifier độc lập cho finding bảo mật. Validator CLI đã kiểm tra qua Ubuntu WSL; trên Windows hiện tại nó từ chối chạy do thiếu cờ mở file an toàn. Giữ các điều kiện kiểm chứng của skill, không nới guard để lấy PASS.

Phạm vi cần bao phủ:
1. Kiến trúc/cấu hình: manifest, chain/Hub/ABI/protocol version, RPC/WS, origins, routing và guard khi thiếu/sai cấu hình.
2. Contract/kế toán: EIP-712, signer/quyền, nonce/expiry/replay, escrow, rebate/refund/proceeds/claim, rounding, invariant và concurrency. Phân biệt contract đang được Testnet dùng với V2 chưa kích hoạt; bổ sung kiểm tra Solidity/EVM riêng.
3. Backend: auth/session/Circle identity, wallet binding, authorization/IDOR, validation, transaction verification, indexer/projection, retry/idempotency, delivery/webhook và backup/recovery barriers.
4. Frontend: buyer/seller/operator, login/ví, approve/mua/claim, bridge/swap, pending/recovery, trạng thái/fee/approval scope, mobile/accessibility và Việt/Anh. Theo UI skills được pin trong docs/ui-skills.json; không redesign.
5. Dependency/CI/release: advisory hiện hành, đường dependency và khả năng tiếp cận mã lỗi, lockfile/toolchain, test/build, phạm vi fixture, exact commit/artifact và rollback.

Các vấn đề đã nêu trong chat về explorer cũ, Hub chưa verify, RPC fallback, gas cố định, lockfile và dependency chỉ là đầu mối. Xác minh lại; không kế thừa số liệu hoặc kết luận cũ. Gas price cao hơn base fee tự nó không phải lỗi. Dry-run npm ci không chứng minh cài sạch/build đầy đủ.

Chỉ review: không sửa source/dependency/lockfile, commit/push/deploy/restart, đọc secrets/database runtime, gửi OTP hoặc thực hiện giao dịch. Giữ nguyên file chưa commit của người dùng. Chạy target code/test và giữ artifact đúng sandbox/promotion policy của skill; thiếu kiểm soát thì ghi blocker và needs_validation, tiếp tục phần đọc source. Không thử lỗi trên endpoint live. Có thể tra tài liệu/advisory chính thức bằng công cụ đọc thông tin riêng.

Tôi chọn output E:/apps/group-deal/.cache/reviews/testnet/run-<UTC timestamp>/; kiểm tra được Git ignore trước khi ghi. Giữ artifact bắt buộc của skill và tạo PROJECT-REVIEW.md làm báo cáo tổng hợp; không ép lỗi UX/chức năng vào schema security.

Mỗi finding cần file/dòng hiện tại, điều kiện kích hoạt, tác động, bằng chứng, guard hiện hữu, hướng sửa nhỏ nhất và kiểm tra hồi quy. Tách confirmed/needs_validation/rejected đúng schema; chỉ confirmed có severity. Không đặt chỉ tiêu số finding hoặc lặp lại kiểm tra đã đủ bằng chứng mà không có lý do mới; vẫn giữ các vòng kiểm chứng bắt buộc của skill.

Báo cáo chính: findings theo tác động; command/exit code và giới hạn các check đã chạy; coverage đã làm/còn thiếu; kết luận cho sáu đầu mối trên; kế hoạch khắc phục ưu tiên. Nêu source commit, skill commit, trạng thái complete/incomplete và blocker. Không suy diễn local test thành full CI, xác nhận runtime hay bảo đảm an toàn production. Tiếp tục đến điều kiện kết thúc hợp lệ của skill.
```

Các validator kiểm tra cấu trúc và tính nhất quán của báo cáo; PASS không xác nhận finding đúng hoặc ứng dụng an toàn. Bộ test upstream đã đạt **65/65** trên Ubuntu WSL với Node v18.19.1. CLI bị chặn khi chạy trực tiếp bằng Node v24.11.1 trên Windows vì thiếu `O_NOFOLLOW`/`O_NONBLOCK`; giữ nguyên guard upstream.

Chạy lại bộ test validator bằng WSL:

```powershell
wsl.exe -d Ubuntu --exec node --test /mnt/e/apps/group-deal/.agents/skills/security-audit/validate-findings.test.cjs /mnt/e/apps/group-deal/.agents/skills/security-audit/validate-coverage-ledger.test.cjs
```

Validator và môi trường chạy code của project là hai phần riêng: WSL có sẵn không chứng minh đã đáp ứng sandbox/promotion policy của skill. Lượt audit phải kiểm tra các điều kiện đó trước khi thực thi target code.
