export type Language = "vi" | "en";

export const translations = {
  vi: {
    // Header & Nav
    explore: "Khám phá",
    myOrders: "Đơn mua của tôi",
    sellerStudio: "Kênh Người Bán",
    operatorPortal: "Quản trị Hệ thống",
    devDocs: "Tài liệu & API",
    faucet: "Nhận 500 Test USDC",
    faucetSuccess: "Đã chuyển 500 USDC vào ví của bạn trên Arc Testnet!",
    connectWallet: "Kết nối ví",
    login: "Đăng nhập",
    logout: "Đăng xuất",
    arcNetwork: "Arc Testnet (5042002)",

    // Hero
    heroTitle: "Mua Chung Sản Phẩm Số",
    heroSub: "Càng đông người mua, giá càng rẻ. Cam kết USDC qua Smart Contract trên Arc Testnet, tự động hoàn trả chênh lệch và giao quyền truy cập riêng cho từng đơn hàng.",
    totalVolume: "Tổng giá trị cam kết",
    activeCampaigns: "Chiến dịch đang mở",
    avgDiscount: "Giảm giá trung bình",
    filterAll: "Tất cả",

    // Campaign Card
    currentPrice: "Giá hiện tại",
    nextPrice: "Giá tiếp theo",
    target: "Mục tiêu",
    timeLeft: "Thời gian còn lại",
    viewDetails: "Xem chi tiết",
    verifiedSeller: "Người bán xác minh",
    verifiedRights: "Bản quyền xác minh",
    slaGuaranteed: "SLA giao hàng",

    // Campaign Details
    tierProgression: "Bảng tiến trình mở khóa giá nhóm",
    threshold: "Ngưỡng",
    participants: "người tham gia",
    units: "đơn vị",
    deliveryInfo: "Cam kết giao hàng & Điều khoản bảo vệ",
    deliveryMethod: "Hình thức giao quyền truy cập",
    deliverySla: "Thời hạn giao sản phẩm (SLA)",
    disputeWindow: "Cửa sổ bảo vệ người mua",
    disputeWindowDesc: "48 giờ sau khi nhận để kiểm tra và mở tranh chấp nếu có sự cố",
    earlyRebateTitle: "Ưu đãi Early Supporter",
    earlyRebateSlotsLeft: "slot ưu đãi người tham gia sớm",
    commitToBuy: "Cam kết mua ngay",
    shareCampaign: "Chia sẻ & Mã QR",

    // Pre-Tx Modal
    confirmOrderTitle: "Xác nhận cam kết mua bằng USDC",
    quantity: "Số lượng mua",
    unitPriceLocked: "Đơn giá khóa hiện tại",
    totalCommitment: "Tổng USDC cam kết",
    estimatedGas: "Ước tính phí gas Arc",
    requireEarlySlot: "Bắt buộc có slot Early Supporter (Hủy lệnh nếu hết slot)",
    termsAgreement: "Tôi xác nhận hiểu rằng khoản tiền này được khóa trong Smart Contract Arc Testnet. Khi chiến dịch kết thúc, nếu mở khóa tier thấp hơn tôi sẽ nhận lại phần tiền chênh lệch (Rebate) tự động.",
    approveAndCommit: "Ký duyệt & Cam kết USDC",

    // Tx Tracker
    txSubmitted: "Giao dịch đã được gửi",
    txBroadcasting: "Đang phát sóng lên Arc Testnet...",
    txPending: "Đang chờ thợ đào xác nhận trên mempool...",
    txConfirmed: "Giao dịch thành công trên Arc Testnet!",
    viewOnArcScan: "Xem trên ArcScan Explorer",

    // Buyer Dashboard
    buyerDashboardTitle: "Quản lý đơn hàng & Quyền truy cập số",
    claimableRebate: "Rebate có thể rút",
    claimableRefund: "Hoàn tiền có thể rút",
    claimAllFunds: "Rút tiền về ví (Claim USDC)",
    deliveredEntitlement: "Quyền truy cập số đã giao",
    decryptKey: "Mở khóa & Xem mã bản quyền",
    copied: "Đã sao chép!",
    confirmReceipt: "Xác nhận đã nhận sản phẩm",
    openDispute: "Mở tranh chấp",
    rateSeller: "Đánh giá người bán",
    orderStatus: "Trạng thái",

    // Seller Dashboard
    sellerDashboardTitle: "Trung tâm vận hành của Người Bán",
    createCampaignBtn: "Tạo chiến dịch mới",
    pendingFulfillment: "Đơn chờ giao hàng",
    sellerClaimable: "Doanh thu có thể rút",
    claimProceeds: "Rút doanh thu về ví",
    fulfillBtn: "Giao mã bản quyền",
    testDeliveryDryRun: "Kiểm tra thử luồng giao (Dry-run test)",
    webhookConfig: "Cấu hình Webhook & Chữ ký HMAC",

    // Operator
    operatorTitle: "Bảng điều khiển Quản trị & Phán quyết Trọng tài",
    activeDisputes: "Tranh chấp cần giải quyết",
    arbitrate: "Phán quyết & Phân bổ tiền",
    verifySellers: "Duyệt huy hiệu người bán",
    reconciliationTitle: "Đối soát tự động Smart Contract & CSDL",
    conservationLaw: "Định luật bảo toàn tiền",
    auditLogs: "Nhật ký kiểm toán hệ thống",
  },
  en: {
    // Header & Nav
    explore: "Explore",
    myOrders: "My Orders",
    sellerStudio: "Seller Studio",
    operatorPortal: "Operator Portal",
    devDocs: "Docs & API",
    faucet: "Get 500 Test USDC",
    faucetSuccess: "Transferred 500 USDC to your wallet on Arc Testnet!",
    connectWallet: "Connect Wallet",
    login: "Log In",
    logout: "Log Out",
    arcNetwork: "Arc Testnet (5042002)",

    // Hero
    heroTitle: "Group Buying for Digital Goods",
    heroSub: "More buyers, lower prices. Commit USDC via Smart Contracts on Arc Testnet, auto-rebate price differences, and receive individual digital entitlements.",
    totalVolume: "Total Volume Committed",
    activeCampaigns: "Active Campaigns",
    avgDiscount: "Average Discount",
    filterAll: "All",

    // Campaign Card
    currentPrice: "Current Price",
    nextPrice: "Next Price",
    target: "Target",
    timeLeft: "Time Left",
    viewDetails: "View Campaign",
    verifiedSeller: "Verified Seller",
    verifiedRights: "Verified Rights",
    slaGuaranteed: "Delivery SLA",

    // Campaign Details
    tierProgression: "Tier Pricing Progression",
    threshold: "Threshold",
    participants: "participants",
    units: "units",
    deliveryInfo: "Delivery & Protection Terms",
    deliveryMethod: "Access Delivery Method",
    deliverySla: "Delivery Deadline (SLA)",
    disputeWindow: "Buyer Protection Window",
    disputeWindowDesc: "48 hours after delivery to inspect and open dispute if needed",
    earlyRebateTitle: "Early Supporter Rebate",
    earlyRebateSlotsLeft: "early supporter slots remaining",
    commitToBuy: "Commit to Buy",
    shareCampaign: "Share & QR Code",

    // Pre-Tx Modal
    confirmOrderTitle: "Confirm USDC Commitment",
    quantity: "Quantity",
    unitPriceLocked: "Locked Unit Price",
    totalCommitment: "Total USDC Committed",
    estimatedGas: "Estimated Arc Gas Fee",
    requireEarlySlot: "Require Early Supporter Slot (Revert if full)",
    termsAgreement: "I understand that these funds are escrowed in the Arc Testnet contract. When the campaign concludes at a lower tier, I will pull the price difference as a rebate.",
    approveAndCommit: "Sign & Commit USDC",

    // Tx Tracker
    txSubmitted: "Transaction Broadcasted",
    txBroadcasting: "Broadcasting to Arc Testnet...",
    txPending: "Pending miner confirmation on mempool...",
    txConfirmed: "Transaction Confirmed on Arc Testnet!",
    viewOnArcScan: "View on ArcScan Explorer",

    // Buyer Dashboard
    buyerDashboardTitle: "Order Management & Digital Access",
    claimableRebate: "Claimable Rebates",
    claimableRefund: "Claimable Refunds",
    claimAllFunds: "Pull Claim (Claim USDC)",
    deliveredEntitlement: "Delivered Entitlements",
    decryptKey: "Decrypt & Reveal License Key",
    copied: "Copied!",
    confirmReceipt: "Confirm Receipt",
    openDispute: "Open Dispute",
    rateSeller: "Rate Seller",
    orderStatus: "Status",

    // Seller Dashboard
    sellerDashboardTitle: "Seller Studio & Fulfillment Hub",
    createCampaignBtn: "Create New Campaign",
    pendingFulfillment: "Orders Pending Delivery",
    sellerClaimable: "Claimable Seller Proceeds",
    claimProceeds: "Pull Seller Proceeds",
    fulfillBtn: "Deliver License Key",
    testDeliveryDryRun: "Test Delivery Flow (Dry-run)",
    webhookConfig: "Webhook Config & HMAC Signatures",

    // Operator
    operatorTitle: "Operator Portal & Dispute Arbitration",
    activeDisputes: "Active Disputes",
    arbitrate: "Arbitrate & Split Funds",
    verifySellers: "Verify Seller Badges",
    reconciliationTitle: "Smart Contract & Database Reconciliation",
    conservationLaw: "Conservation of Funds Law",
    auditLogs: "Audit Trail",
  },
};
