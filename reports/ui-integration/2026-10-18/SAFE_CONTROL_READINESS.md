# Safe control: gói sẵn sàng cho owner — 18/10/2026

Đã kiểm public authority lúc 2026-10-18T03:35:51.019Z, finalized 67776814: Hub/manifest/runtime/roles và Safe 1.5.0 đúng; 3 owner, quorum 2/3, nonce 0, modules rỗng, không pending transfer. 12 kiểm đạt. Block cũ 67761173 của challenge vẫn canonical. Chưa có chữ ký hoặc bằng chứng custody độc lập.

Giữ nguyên challenge đã chuẩn bị, không tạo challenge mới: backend 30fea223380affc471cc91f4ab2390814ddaa87c; digest **0x21207e4bbe6a41efad99f8b398254370c8784abdd7dd78d5a599436cbc64f7d4**. Hết hạn **08:27:27 ngày 19/10/2026 (UTC+7)** (2026-10-19T01:27:27.814Z). SDK 5458925313a8b8f2d6d4a63eb6c77f4e5df9eb6c không thuộc admitted app runtime nên không đổi context backend của challenge. Phải đọc lại context/authority/expiry ngay trước khi nhận chữ ký; nếu hết hạn hoặc context đổi thì không sử dụng.

Cần 2 owner khác nhau tự ký chính xác toàn bộ thông điệp EIP-191 trong tệp OWNER tương ứng. Bắt buộc gồm **0x73307bdd39d875f98857ffce0fed1cdc62f50b6d**, cộng một trong hai owner còn lại. Tệp là đúng 982 byte, không thêm newline cuối hoặc sửa nội dung. Trợ lý không ký hoặc điều khiển ví thay owner. Đây là thông điệp control-only; không có giao dịch, approval hay Safe execution trong gói này.

- [Thông điệp owner 73307bdd](E:/apps/group-deal/reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/OWNER_73307bdd39d875f98857ffce0fed1cdc62f50b6d.txt)
- [Thông điệp owner c289b853](E:/apps/group-deal/reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/OWNER_c289b853d90f2c604fd38458b1ce4b991156d18b.txt)
- [Thông điệp owner 7366adbf](E:/apps/group-deal/reports/evidence/account-access-followup/2026-10-18T01-19-03-731Z/OWNER_7366adbf19e511095e7737138498f625d737db22.txt)

Kết quả cần trả: hai mục JSON {"owner":"0x...","signature":"0x..."}, cùng xác nhận thật của từng người giữ khóa: owner nào họ ký được, người khác có quyền dùng/khôi phục khóa đó không, và cách tách quyền kiểm soát. Có thể dùng nhãn người giữ thay tên riêng; không cung cấp seed/private key. Mẫu CUSTODY_ATTESTATION.template.json chỉ là mẫu trống, chưa phải proof. Hai chữ ký chứng minh control, không tự chứng minh hai người/custody độc lập.

Verifier offline: scripts/verify_safe_owner_control.cjs trong checkout sạch, dùng challenge gốc, JSON chữ ký và digest ở trên. Verifier hiện hành byte-identical với bản pin trong gói gốc; từ chối zero signatures. Chưa nhận dữ liệu người dùng, chưa chạy verifier với chữ ký thật. Sau khi có chữ ký và attestation vẫn cần đọc authority mới, kiểm principal/custody và các điều kiện G5 khác trước kết luận.

Audit G5: 21 artifact CURRENT, 28 source file và 23 test file duy nhất khớp checkout; 8 execution reference kế thừa khớp path/hash; 7 tệp gói Safe khớp hash và toàn bộ message khớp verifier. Phát hiện header ma trận G5 còn ghi SDK416ab71 trong gói trước; sửa thành5458925 tại hồ sơ mới, giữ nguyên artifact cũ. Không coi kiểm hash/inventory là execution PASS hoặc chạy lại các test cũ.

VPS lúc 2026-10-18T03:38:16.174Z: resolved cwd /home/ubuntu/groupdeal/releases/47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a/backend, runtime/public paths đúng; PID97197/NRestarts0, 377 runtime/181 public hash khớp, backup VERIFIED/privateRestore/BACKUP_CURRENT, timer active, 95 held giữ. Không deploy/restart, mở DB, tạo archive mới hoặc xuất credentials. Ledger/email giữ timestamp proof trước; không đọc lại trong gói này. Hai giả định sai của công cụ kiểm ban đầu (newline/cwd root) được sửa theo bytes/cwd thực và ghi TOOLING_CORRECTIONS.json; không sửa product hoặc gói challenge.

Circle và admin live hoãn theo người dùng; username/social POST-V1. Chưa offhost target, incident RPO/RTO, Safe custody, receiver/provider/email thật và các branch live còn mở. NOT_FROZEN; G5/G6 OPEN; acceptanceEligible=false.

Proof: reports/evidence/safe-control-readiness/2026-10-18T03-39-47-536Z/CHECKS.json
SHA256: e9bc4537262b953f677625a1864254698f5cb3381e24f7c0e61fb41079f110cd
