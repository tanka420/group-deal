# Ứng dụng Mainnet nội bộ trên VPS

Ngày 03/11/2026. Hub V2 và Safe đã finalized; ứng dụng đã activation **nội bộ** theo scope owner duyệt cho gói `98ea809`. API chỉ ở localhost 4100; public domain và hành trình mua bán chưa chuyển sang Mainnet.

## Gói đã duyệt và kích hoạt nội bộ

| Mục | Giá trị |
|---|---|
| Nguồn frontend và backend | `98ea809408a463a7b0a54518e299097da4abcb80`, đã push trên `codex/mainnet` |
| Source fingerprint | `bb200707afd239256d71cc865e60493e6fafff3488a3e42fe7b29b6acc6e05fd` |
| Archive SHA-256 | `8b3a22190c7be609f9291607f0115104f922cd690a1f811c507903397a94c487` |
| Local package | `.cache/mainnet-release/fe4155a8-58d2-48c7-8883-2faef5b16f4d/PACKAGE.json` và `PACKAGE.tar.gz` |
| Linux staging | `/home/ubuntu/groupdeal-mainnet-staging/98ea809408a463a7b0a54518e299097da4abcb80/payload` |
| Linux Node binary SHA-256 | `7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c` (v24.21.0) |
| Dependencies production | 3.598 file/link; tree fingerprint `8d8c96410d7fdc81570f13939b8468af641d706fc4892802926979d993039247` |
| Giai đoạn đã hoàn tất | Credential Mainnet → env root 0600; user/data riêng; API localhost 4100; local encrypted backup và health timers |
| Quyền hiện tại | Owner đã trả lời “Cho phép triển khai nội bộ trong phạm vi này” cho gói này; credential/internal service/backup/health được duyệt. Public cutover, restart Testnet, giao dịch tài chính và email thử chưa được cấp quyền. Package/preflight cũ giữ `activationAuthorized: false` như ảnh chụp bước chuẩn bị, không sửa artifact đã pin. |

**PASS build** từ exact commit trên: `.cache/mainnet-build/2e432576-5bf2-4b88-8bec-2c8a19e77d69/BUILD.json`; TypeScript backend/frontend và Vite PASS, còn cảnh báo chunk lớn. **PASS_LINUX_MAINNET_STAGING**: đối chiếu SHA archive + 418 file, `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` với config/cache riêng; module runtime và SQLite memory check PASS. Candidate Nginx `nginx -t` PASS trong config thử riêng, không install/reload config đang chạy. Systemd verify theo đường runtime/user thật thực hiện sau khi cài các prerequisites của giai đoạn được duyệt, chưa ghi PASS cho service thực.

Proof `.cache/mainnet-vps-preparation/STAGING.json` và `VERIFIED.json`, bản trên VPS tại thư mục staging cùng `STAGING.json`/`payload/LINUX_PREFLIGHT.json`. **PASS_STAGING_WITH_TESTNET_PRESERVED**: PID `1253620`, restart count `0`, bốn hash config Nginx public và deployment Testnet giữ nguyên; cả hai domain vẫn Testnet. Mainnet unit `not-found`, port 4100 trống; `/opt`, `/etc`, `/var/lib` Mainnet chưa tạo. Lượt staging command đầu tiên FAIL do escape chuỗi Python trước khi bất kỳ mã Python nào thực thi; lượt sửa sau PASS, không nâng lượt lỗi thành thành công.

## Lịch sử kiểm kê chỉ đọc trước activation

- Ubuntu 24.04.4 LTS, Linux x86_64/glibc 2.39. Node hiện có `/home/ubuntu/groupdeal-runtime/node-v24.21.0-linux-x64/bin/node`, npm 11.6.2; Node không nằm trên PATH mặc định. Không nâng cấp runtime Testnet.
- `groupdeal-testnet.service` active, localhost `18420`; health trả chain 5042002, protocol 1, Hub Testnet cũ. `groupdeal-mainnet.service` chưa tồn tại, port 4100 trống; các thư mục Mainnet được đề xuất chưa tồn tại.
- Apex và subdomain Testnet hiện cùng trỏ frontend Testnet `47d853f...`, backend `8c32212...`. TLS apex gồm apex/www, hết hạn 19/01/2027. UFW inactive; không mở thêm port, Mainnet phải bind `127.0.0.1` trong chính ứng dụng.
- Không đọc secret hoặc DB, không đổi routing, service, timer, source hoặc held work. Một lượt inventory dừng vì `node` không trên PATH; lượt kế tiếp dùng đường runtime thật. Hai shell lượt có CR cuối input trả lỗi sau phần dữ liệu đã đọc, không thực hiện mutation. Không ghi toàn bộ inventory thành một lượt deployment PASS.

## Artifact và phạm vi giai đoạn 1

`scripts/prepare_mainnet_release.cjs <BUILD.json>` chỉ nhận build từ exact commit sạch đã push, cùng fingerprint, manifest VERIFIED và hash từng file. Gói có frontend build, backend build/lockfile, shared modules/manifests và ops. Không có `.env`, DB, secret, node_modules Windows hoặc dữ liệu Testnet. Sau khi staging trên Linux, cài dependencies production từ lockfile bằng npm ci, tắt lifecycle scripts/audit/fund. Kiểm lại hash gói và các module cần thiết; không startup backend khi staging.

| Thành phần | Đích đã triển khai nội bộ |
|---|---|
| Mã ứng dụng | `/opt/groupdeal-mainnet/releases/<sourceCommit>`; symlink `current` riêng |
| User dịch vụ | `groupdeal-mainnet`, system user riêng, không đăng nhập shell |
| Node | `/opt/groupdeal-mainnet/runtime/node`, copy binary hiện có đã đối chiếu hash, root sở hữu; không cấp quyền đọc thư mục/private key của ubuntu |
| Credential | `/etc/groupdeal-mainnet/runtime.env`, root 0600, thư mục root 0700; systemd đọc EnvironmentFile |
| Dữ liệu mới | `/var/lib/groupdeal-mainnet/data`, user riêng 0700; `backend/data/arc-mainnet` trỏ đúng thư mục này |
| API | `127.0.0.1:4100`, `groupdeal-mainnet.service`; chỉ đọc Arc qua RPC, không ký giao dịch on-chain khi startup |
| Backup | `/var/lib/groupdeal-mainnet/backups`, user riêng 0700; online SQLite connection read-only, copy/restore biệt lập, AES-GCM có xác thực; giữ ba archive managed mới nhất |
| Theo dõi | Timer backup mỗi giờ và timer health nội bộ mỗi phút; health chỉ xác nhận liveness/deployment + tuổi/hash backup, không ghi nghiệm thu tài chính |
| Frontend | Gói đã build sẵn; chưa đổi root/proxy Nginx hoặc domain trong giai đoạn 1 |

`scripts/mainnet-ops/start.cjs` kiểm môi trường/mạng/origin/storage cố định, sau đó gọi startup guard hiện hành. Mainnet bind loopback trực tiếp trong `backend/src/index.ts`; Testnet giữ hành vi trước đó. Service user không có khóa owner/deployer/operator/Safe. Chỉ signer backend C có trong runtime cùng Circle/SMTP/Blockscout và ba secret ứng dụng riêng.

## Credential đã chuyển theo phạm vi đã duyệt

`scripts/export_mainnet_credentials.ps1 -ReleaseCommit <sourceCommit> -InstallApproved` phải chạy bằng Windows account giữ DPAPI. Không chạy trước khi chốt gói/phạm vi giai đoạn 1. Script kiểm owner/ACL/chain của ba vault; JSON plaintext chỉ qua stdin của SSH xác thực đến alias `tan-picks`, không qua argv, log, Git hoặc file plaintext local. Remote receiver xác minh signer bằng suy ra địa chỉ local, không gọi API/ký; chỉ tạo env lần đầu bằng thao tác atomic, không ghi đè credential hiện có. Dùng quoting cho systemd EnvironmentFile; từ chối newline/control/khóa ngoài danh sách. Không copy `.env` hay DB Testnet.

Kết quả SSH không rõ phải đọc lại metadata trạng thái đích trước khi quyết định tiếp; không tự lặp để thay secret. Giữ nguyên ba vault local. SMTP connection/OTP/transaction acceptance vẫn có kiểm riêng; việc tạo env không chứng minh các dịch vụ đã hoạt động.

Lượt cài thật ngày 03/11 đã PASS: ba vault không đổi, signer receiver khớp manifest, env root 0600 trong thư mục root 0700. Probe từ chính VPS sau cài cũng PASS Circle LIVE GET/App ID, SMTP TLS/auth và Blockscout GET; không gửi email, OTP, chữ ký hoặc giao dịch. OTP/wallet login, email delivery và số dư/multipage chưa nghiệm thu.

## Quy trình activation đã áp dụng và rollback

1. Pin hash archive/commit/frontend/backend và Linux dependency receipt đã chuẩn bị. Đối chiếu lại health Testnet, port, đường dẫn và state chưa có Mainnet writer. Giữ hash/copy các file ops sắp cài để rollback; không đụng `.env`, DB hoặc units Testnet.
2. Tạo system user và thư mục Mainnet riêng; cài Node binary đã pin, app package/dependencies, liên kết data mới và current. Code/config root sở hữu, user dịch vụ chỉ có quyền ghi data/backup.
3. Chuyển đúng credential Mainnet đã staging DPAPI vào env file ban đầu bằng công cụ stdin; không nhập lại key trong chat. Kiểm metadata mode/owner và signer, không in giá trị.
4. Cài ba service/hai timer **Mainnet**, `systemd-analyze verify`, daemon-reload và start riêng `groupdeal-mainnet.service`. Lần đầu tạo SQLite mới, không seed fixture/campaign/user; indexer backfill từ block Hub. Startup guard phải khớp finalized chain/runtime/token/roles/Safe trước khi mở cổng/workers.
5. Kiểm socket chỉ `127.0.0.1:4100`, health Mainnet 5042/V2/Hub thật và nguồn frontend/backend; chạy backup lần đầu và xác minh archive/restore; start hai timer Mainnet. Kiểm lại Testnet 18420/subdomain, PID/restart count và routing không đổi.
6. Nếu có lỗi: stop/disable **chỉ** service/timers Mainnet mới tạo, giữ DB/env/backup để điều tra, giữ receipt lỗi. Không reset DB, không tự tạo lại secret hoặc replay transaction. Với cài mới này, public domain vẫn không đổi; rollback không cần sửa dịch vụ Testnet.

## Chưa nằm trong giai đoạn 1

- Nginx apex candidate trong gói chỉ dùng review/`nginx -t`, **không cài/reload**. Cắt apex sang Mainnet, bỏ apex khỏi allowlist Testnet và sửa redirect hostname cũ là scope giai đoạn sau, cần rollback đồng bộ. Không restart Testnet ở giai đoạn 1.
- Không funding, ký/gửi giao dịch, Safe execution, tạo campaign/đơn hàng, gửi email thử hoặc thao tác mua bán. Startup workers trên DB mới không có hàng chờ cũ để replay.
- Offhost backup Mainnet chưa cấu hình; không copy rclone/private config của Testnet. Cần chọn đích/quyền trước public launch. Monitoring giai đoạn này là nội bộ; chưa public HTTPS/alert delivery acceptance.
- M05 review độc lập, M02 OTP/wallet login/delivery, M07 hành trình tiền thật có ngân sách và M11 đối soát token ví thật vẫn chưa hoàn tất. Fixture hoặc liveness không thay thế các mục này.

## Kiểm phù hợp

Năm nhóm Node ops kiểm retention fail-closed/unknown files, integrity/path scope, health đúng chain + backup, artifact không lẫn data/env và **SQLite backup/restore thật với contact mã hóa giả lập**, nguồn fixture được giữ nguyên. Hai nhóm Python kiểm quoting và từ chối newline/extra key/commit sai/secret trùng; chạy qua stdin trên Python VPS, không tạo file hoặc cài credential. PowerShell parser PASS; export thật sau khi owner duyệt cũng PASS. `check:mainnet` PASS fixture mạng/runtime/roles/Safe và holdings; không chạy full CI hoặc nghiệm thu ứng dụng live.

## Kết quả activation thật

- Authority, before/install/credential/start/health/backup/enable/postcheck/provider receipts nằm tại `.cache/mainnet-vps-activation/e6f4809c-266e-43a6-83bd-e7525950ea4b/`. File `VERIFIED.json` có result **PASS_MAINNET_INTERNAL_ACTIVATION**, kiểm lúc 12:23 ngày 03/11 (UTC 05:23); bản trên VPS `/opt/groupdeal-mainnet/VERIFIED.json`, root 0600. Không đưa private receipt/env/database/archive vào Git.
- `groupdeal-mainnet.service` active/enabled, PID 461592/NRestarts 0, user riêng UID 999; process cwd/Node và 418 code/artifact hashes/3.598 dependency file-link còn khớp gói đã duyệt. Health đúng chain 5042/V2/Hub, socket `127.0.0.1:4100`. Frontend cùng source được cài trong `/opt` nhưng chưa phục vụ public; ghi riêng backend runtime và frontend installed version, đều `98ea809`.
- DB Mainnet mới SQLite quick_check `ok`, không seed users/deals/orders/operations hoặc hàng chờ email/webhook; chỉ metadata/audit/deployment journal. Data và backups user riêng 0700; env root 0600/thư mục root 0700. Không dùng database hay key của Testnet.
- Systemd verify ba service/hai timer PASS. Backup lần đầu và lần do timer khởi động đã mã hóa/restore verify thành công; 2 archive hiện tại trong policy giữ tối đa 3. Local backup hourly và health mỗi phút enabled/active/waiting; oneshot exit 0. Chưa offhost, public HTTPS health hoặc email alert delivery acceptance.
- **PASS_VPS_MAINNET_READONLY_PROVIDERS**: Circle LIVE GET HTTP 200/App ID khớp, SMTP TLS/auth verify PASS, Blockscout chain 5042 GET HTTP 200. Chạy transient process riêng nhận env qua systemd; không thay artifact, không in credential, không gửi email hay giao dịch. Nguồn checker SHA `35943cf5c93452a9543b804fea216d891735b9bb655d6dfea2f1a729eeca4fda`; proof `PROVIDERS.json` trong receipt folder. Đây chưa phải OTP/login/delivery/holdings acceptance.
- Testnet vẫn PID 1253620/NRestarts 0; bốn hash config public không đổi. Health cả apex/subdomain vẫn Testnet 5042002/V1/Hub cũ, chưa reload Nginx hoặc cutover; Testnet source `478a91f` và báo cáo chưa track giữ nguyên. Không có giao dịch blockchain do lượt activation gửi.
