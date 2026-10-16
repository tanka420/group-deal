# OKX Arc Testnet — Failed to fetch

Kiểm lúc 2026-10-16T17:32:12.621Z (ngày 17/10 theo UTC+7). User báo lỗi trong OKX khi thêm/chuyển Arc Testnet; RPC lưu trong ví là https://rpc.testnet.arc.network.

Đã tái hiện host cũ không resolve DNS từ Windows và VPS (ENOTFOUND), không có HTTP redirect. Chrome riêng từ origin GroupDeal báo ERR_NAME_NOT_RESOLVED và TypeError: Failed to fetch. RPC https://rpc.testnet.arc.io trả HTTP 200, eth_chainId=0x4cef52 (5042002) ở cả ba vị trí. Bốn endpoint .io chính thức đều đạt khi kiểm Windows/VPS/Chrome; Chrome không có lỗi CORS/CSP ở những request này. Không kết luận Arc toàn cầu bị outage hoặc lỗi mật khẩu/khóa/phiên.

Khắc phục cụ thể: user sửa RPC Arc Testnet trong OKX thành https://rpc.testnet.arc.io, giữ chain ID 5042002 và symbol USDC; explorer hiện hành https://explorer.testnet.arc.io. Chỉ kiểm kết nối mạng, chưa cần ký/login/giao dịch. Nếu chưa hết sau đổi URL thì cần kiểm riêng cấu hình OKX/proxy/DNS hiện hành; chưa đánh dấu ví thật phục hồi trước phản hồi user.

[Tài liệu Arc](https://docs.arc.io/arc/references/connect-to-arc) và [hướng dẫn RPC OKX](https://web3.okx.com/help/how-do-i-add-a-custom-rpc-to-the-okx-web3-wallet). GroupDeal đã dùng .io trong wallet add/Reown/read RPC/manifest; gói này không sửa hoặc deploy source. Frontend aa7bff792ffd421bb636fb64d9747f085d6f4a59, backend 324bca2dc3230bd2721e2582ba282eb42c0ba10b giữ nguyên; không restart, DB/app cũ, ký, replay, release 95 held hoặc full CI. Chỉ dùng browser riêng không extension/phiên user; không tự sửa ví OKX của user.

Proof reports/evidence/arc-okx-rpc-diagnostic/2026-10-16T17-32-12-616Z/CHECKS.json; SHA256 58799631dfd610297cff80bfce271bd2e63802d30227bee5f567dfe712aa978e. CURRENT_ARC_WALLET_RPC_DIAGNOSTIC_LATEST ghi riêng; không thay CURRENT deployment/candidate/G5 hoặc suy kết nối RPC thành nghiệm thu hành trình ví. G5/G6 vẫn OPEN.
