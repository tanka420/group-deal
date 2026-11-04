import type {ReadingContent} from './readingContent';

export const userGuide:ReadingContent = {
  "title": [
    "Hướng dẫn sử dụng GroupDeal",
    "GroupDeal user guide"
  ],
  "intro": [
    "Hướng dẫn từ lần đăng nhập đầu tiên đến khi chọn deal, nhận sản phẩm và theo dõi tiền của đơn. Bạn cũng có thể chuyển nhanh đến phần ví, người bán hoặc xử lý sự cố.",
    "Follow the steps from your first sign-in through choosing a deal, receiving a product and tracking order funds. You can also jump directly to wallets, seller tools or troubleshooting."
  ],
  "sections": [
    {
      "id": "start",
      "title": [
        "Trước khi bắt đầu",
        "Before you start"
      ],
      "paragraphs": [
        [
          "Bạn đang sử dụng GroupDeal trên Arc Testnet, chain ID 5042002, với tài sản thử nghiệm. Kiểm tra mạng trong ứng dụng và ví trước mỗi thao tác. Chuẩn bị quyền truy cập email hoặc ví bạn chọn dùng để đăng nhập.",
          "You are using GroupDeal on Arc Testnet, chain ID 5042002, with test assets. Check the network in the application and wallet before acting. Keep access to the email account or wallet you choose for sign-in."
        ],
        [
          "Bạn có thể xem deal mà chưa đăng nhập. Để mua, xem đơn riêng hoặc dùng các thao tác ví, hãy đăng nhập theo luồng tương ứng. Không gửi seed phrase, private key, mật khẩu hay OTP vào tin nhắn hỗ trợ.",
          "You can browse deals without signing in. To buy, view private orders or use wallet actions, sign in through the appropriate flow. Never send recovery phrases, private keys, passwords or OTPs in support messages."
        ]
      ]
    },
    {
      "id": "sign-in",
      "title": [
        "Đăng nhập và thiết lập tài khoản",
        "Sign in and set up your account"
      ],
      "ordered": true,
      "items": [
        [
          "Chọn Đăng nhập ở header. Dùng phương thức email/Circle hoặc ví EVM bên ngoài mà giao diện cung cấp. Các phương thức khả dụng phụ thuộc cấu hình dịch vụ.",
          "Choose Sign in in the header. Use the email/Circle or external EVM wallet method offered by the interface. Available methods depend on service configuration."
        ],
        [
          "Với email, làm theo cửa sổ xác thực của Circle. Với ví bên ngoài, kiểm tra ví, mạng và nội dung yêu cầu kết nối hoặc chữ ký đăng nhập. Đăng nhập không đồng nghĩa bạn đã mua một deal.",
          "For email, follow Circle’s authentication window. For an external wallet, check the wallet, network and connection or sign-in message. Signing in does not mean you have purchased a deal."
        ],
        [
          "Mở Tài khoản để xem thông tin và ví liên kết. Username hiện chỉ được tạo một lần; đọc lại trước khi lưu. Xem các phiên và đăng xuất khi dùng xong trên thiết bị chung.",
          "Open Account to review your information and linked wallets. A username can currently be created once, so check it before saving. Review sessions and sign out after using a shared device."
        ]
      ],
      "links": [
        {
          "href": "/account",
          "label": [
            "Mở Tài khoản",
            "Open Account"
          ]
        }
      ]
    },
    {
      "id": "choose",
      "title": [
        "Tìm và đánh giá một deal",
        "Find and evaluate a deal"
      ],
      "ordered": true,
      "items": [
        [
          "Vào Khám phá, dùng danh mục, tìm kiếm và bộ lọc để tìm sản phẩm. Xem giá nhóm đang mở và thời gian còn lại trên card.",
          "Open Explore and use categories, search and filters to find a product. Review the current group price and remaining time on its card."
        ],
        [
          "Mở chi tiết. Đọc sản phẩm, người bán, phiên bản license, edition, số chỗ hoặc số lượng và phạm vi sử dụng. Kiểm tra nội dung có phù hợp nhu cầu của bạn.",
          "Open the details. Read the product, seller, license version, edition, seats or quantity and usage scope. Check that the content fits your needs."
        ],
        [
          "Xem các bậc giá và ngưỡng của chúng. Kiểm tra chiến dịch đếm số tài khoản hay số đơn vị; một bậc giá tốt hơn chỉ mở khi đạt điều kiện.",
          "Review the price tiers and their thresholds. Check whether the campaign counts accounts or units. A better price tier opens only when its conditions are met."
        ],
        [
          "Đọc hạn tham gia, SLA giao tính từ khi chốt, cách giao và điều kiện tranh chấp. Đồng hồ đếm ngược giúp theo dõi nhưng không thay trạng thái được ghi nhận của chiến dịch.",
          "Read the joining deadline, delivery SLA measured from finalization, delivery method and dispute conditions. The countdown helps you follow time but does not replace the campaign’s recorded state."
        ]
      ],
      "links": [
        {
          "href": "/explore",
          "label": [
            "Khám phá sản phẩm",
            "Explore products"
          ]
        },
        {
          "href": "/policies/how",
          "label": [
            "Hiểu cơ chế mua chung",
            "Understand group buying"
          ]
        }
      ]
    },
    {
      "id": "buy",
      "title": [
        "Cam kết mua và xác nhận ví",
        "Commit to buy and confirm in your wallet"
      ],
      "ordered": true,
      "items": [
        [
          "Chọn số lượng và bấm Cam kết mua ngay. Trên mobile, nút trong trang và nút cố định phía dưới mở cùng luồng mua.",
          "Choose a quantity and select Commit to buy. On mobile, the inline button and fixed bottom shortcut open the same purchase flow."
        ],
        [
          "Đọc phần rà soát: sản phẩm, giá, số lượng, tổng cam kết, các khoản phí và ví thực hiện. Đồng ý các điều kiện được yêu cầu sau khi đã kiểm tra nội dung.",
          "Read the review: product, price, quantity, committed total, fees and acting wallet. Accept the required conditions after reviewing them."
        ],
        [
          "Hoàn thành bước chuẩn bị ví hoặc phê duyệt token nếu được yêu cầu, rồi xác nhận giao dịch mua. Chỉ ký yêu cầu khớp mạng, ví và nội dung bạn đang định thực hiện.",
          "Complete wallet preparation or token approval when requested, then confirm the purchase transaction. Sign only requests matching the intended network, wallet and action."
        ],
        [
          "Theo dõi trạng thái đến khi có kết quả được ghi nhận. Nếu popup đóng hoặc hết thời gian chờ, kiểm tra lịch sử và phục hồi trước khi tạo yêu cầu mới; thao tác cũ có thể vẫn đang xử lý.",
          "Follow status until a result is recorded. If a popup closes or times out, check history and recovery before creating another request. The existing operation may still be processing."
        ]
      ]
    },
    {
      "id": "orders",
      "title": [
        "Tìm lại đơn đã mua",
        "Find your purchased orders"
      ],
      "ordered": true,
      "items": [
        [
          "Mở Đơn hàng bằng đúng tài khoản đã mua. Dùng mã đơn hoặc tên sản phẩm, trạng thái và khoảng ngày ghi nhận để lọc danh sách.",
          "Open Orders using the purchasing account. Filter by order ID or product, status and recorded-date range."
        ],
        [
          "Mỗi trang hiển thị tối đa 20 đơn; dùng Trước/Sau để chuyển trang. Mở đúng đơn để xem điều khoản đã ghim, tiến trình giao, thông tin tiền hàng và các thao tác được phép.",
          "Each page shows up to 20 orders. Use Previous/Next to change pages. Open the relevant order to review pinned terms, delivery progress, financial information and available actions."
        ],
        [
          "Nếu đơn yêu cầu thao tác ví, chọn ví được ghi nhận cho đơn. Đổi ví đang hoạt động không chuyển đơn hoặc tự đổi ví có quyền xử lý đơn đó.",
          "When an order action requires a wallet, select the wallet recorded for that order. Changing the active wallet does not transfer the order or replace its authorized wallet."
        ]
      ],
      "links": [
        {
          "href": "/orders",
          "label": [
            "Xem đơn hàng",
            "View orders"
          ]
        }
      ]
    },
    {
      "id": "receive",
      "title": [
        "Nhận và kiểm tra sản phẩm",
        "Receive and inspect the product"
      ],
      "ordered": true,
      "items": [
        [
          "Theo dõi thời điểm chốt chiến dịch và SLA giao trong đơn. Sau khi ghi nhận giao, mở tài nguyên hoặc hướng dẫn mà đơn cung cấp.",
          "Follow campaign finalization and the order’s delivery SLA. After recorded delivery, open the resources or instructions provided in the order."
        ],
        [
          "Kiểm tra sản phẩm đúng phiên bản, đủ số chỗ hoặc số lượng và sử dụng được theo mô tả trước khi xác nhận đã nhận.",
          "Check the version, seats or quantity and usability against the description before confirming receipt."
        ],
        [
          "Nếu có vấn đề, dùng thao tác tranh chấp của đơn trong cửa sổ cho phép. Luồng hiện tại tính 48 giờ từ lúc giao đã được ghi nhận; ticket hay tin nhắn riêng không tự mở tranh chấp.",
          "If there is a problem, use the order’s dispute action within its allowed window. The current flow counts 48 hours from recorded delivery. A ticket or separate message does not automatically open a dispute."
        ]
      ],
      "links": [
        {
          "href": "/policies/delivery",
          "label": [
            "Đọc hướng dẫn giao hàng",
            "Read the delivery guide"
          ]
        }
      ]
    },
    {
      "id": "claims",
      "title": [
        "Theo dõi rebate và khoản hoàn",
        "Track rebates and refunds"
      ],
      "ordered": true,
      "items": [
        [
          "Trong chi tiết đơn, phân biệt tổng đã cam kết, khoản được phân bổ, khoản đã rút và khoản còn có thể rút. Dữ liệu chưa xác minh không đồng nghĩa bằng không.",
          "In order details, distinguish committed totals, allocations, previous claims and remaining claimable amounts. Unverified data does not mean zero."
        ],
        [
          "Khi thao tác claim đủ điều kiện, đọc phần rà soát và xác nhận bằng ví được phép của đơn. Phân bổ không tự chuyển tiền về ví.",
          "When a claim becomes eligible, read the review and confirm with the order’s authorized wallet. Allocation does not automatically send funds to your wallet."
        ],
        [
          "Chờ kết quả của yêu cầu và kiểm tra receipt. Nếu chưa rõ, mở lịch sử và phục hồi của yêu cầu đang có. Không mặc định mọi đơn đều được hủy mua hoặc hoàn vô điều kiện.",
          "Wait for the request result and check the receipt. If unresolved, open history and recovery for the existing request. Do not assume every purchase can be cancelled or refunded unconditionally."
        ]
      ],
      "links": [
        {
          "href": "/policies/refunds",
          "label": [
            "Hiểu rebate và hoàn tiền",
            "Understand rebates and refunds"
          ]
        }
      ]
    },
    {
      "id": "wallet",
      "title": [
        "Nhận, gửi và hoán đổi trong Ví",
        "Receive, send and swap in Wallet"
      ],
      "items": [
        [
          "Nhận: mở Ví → Nhận, kiểm tra mạng Arc Testnet và địa chỉ đang hiển thị trước khi sao chép hoặc chia sẻ QR. Người gửi cần kiểm tra đúng mạng và tài sản; QR không thay cho việc kiểm tra địa chỉ.",
          "Receive: open Wallet → Receive and check Arc Testnet and the displayed address before copying it or sharing the QR code. The sender must check the network and asset; a QR code does not replace address verification."
        ],
        [
          "Gửi: mở Gửi, nhập địa chỉ nhận và số USDC, rồi rà soát người nhận, số tiền và phí trước khi xác nhận trong ví. Kiểm tra lại địa chỉ đầy đủ khi dán từ clipboard.",
          "Send: open Send, enter the recipient and USDC amount, then review recipient, amount and fees before wallet confirmation. Check the full address after pasting from your clipboard."
        ],
        [
          "Hoán đổi: chọn tài sản, nhập số lượng và xem báo giá, mức tối thiểu nhận, trượt giá cùng phí. Nếu quote hết hiệu lực, yêu cầu quote mới thay vì dùng bản đã hết hạn.",
          "Swap: choose assets, enter an amount and review the quote, minimum received, slippage and fees. If the quote expires, refresh it rather than using an expired review."
        ],
        [
          "Mục giao dịch gửi/hoán đổi giữ thông tin yêu cầu và trạng thái phục hồi của luồng Ví. Một bản xem trước chưa phải giao dịch được gửi. Với yêu cầu đã phát đi, theo dõi cùng yêu cầu thay vì gửi lặp.",
          "Transfers & swaps keeps wallet request information and recovery status. A preview is not a submitted transaction. For a submitted request, follow that request instead of sending a duplicate."
        ],
        [
          "USDC dùng trả gas và số dư token có cách biểu diễn khác nhau trên Arc. Không cộng hai cách hiển thị thành hai khoản tiền riêng. Nếu số dư đang hiện chưa khả dụng, làm mới để kiểm tra lại.",
          "Gas USDC and token balances have different representations on Arc. Do not add the two views as separate funds. Refresh if the balance is shown as unavailable."
        ]
      ],
      "links": [
        {
          "href": "/wallet",
          "label": [
            "Mở Ví",
            "Open Wallet"
          ]
        },
        {
          "href": "https://docs.arc.io/arc/references/connect-to-arc",
          "label": [
            "Tham khảo mạng và số dư USDC từ Arc",
            "Arc network and USDC balance reference"
          ]
        }
      ]
    },
    {
      "id": "seller",
      "title": [
        "Bắt đầu với Kênh người bán",
        "Get started with Seller channel"
      ],
      "ordered": true,
      "items": [
        [
          "Mở Kênh người bán và hoàn thành hồ sơ hoặc bước cấp quyền mà giao diện yêu cầu. Phiên quản trị là luồng riêng; quyền buyer không tự cho phép thao tác operator.",
          "Open Seller channel and complete the profile or access steps requested by the interface. Administration uses a separate flow; buyer access does not automatically authorize operator actions."
        ],
        [
          "Chuẩn bị sản phẩm, phiên bản license và quyền phân phối. Kiểm tra edition, số chỗ, thời hạn và phương thức giao trước khi dùng phiên bản đó cho chiến dịch.",
          "Prepare the product, license version and distribution rights. Check edition, seats, duration and delivery method before using that version in a campaign."
        ],
        [
          "Rà soát bậc giá, cách đếm, hạn tham gia và SLA khi tạo chiến dịch. Theo dõi đơn, tài nguyên và giao hàng từ workspace của người bán.",
          "Review price tiers, the metric, joining deadline and SLA when creating a campaign. Track orders, resources and fulfillment in the seller workspace."
        ],
        [
          "Nếu tích hợp hệ thống ngoài, đọc tài liệu API, SDK và webhook. Theo dõi receipt, yêu cầu đang có và cơ chế xử lý sự kiện trùng trước khi thử lại một thao tác giao hàng.",
          "For external integrations, read the API, SDK and webhook documentation. Check receipts, existing requests and duplicate-event handling before retrying delivery operations."
        ]
      ],
      "links": [
        {
          "href": "/seller",
          "label": [
            "Mở Kênh người bán",
            "Open Seller channel"
          ]
        },
        {
          "href": "/docs",
          "label": [
            "Tài liệu tích hợp",
            "Integration documentation"
          ]
        }
      ]
    },
    {
      "id": "troubleshooting",
      "title": [
        "Xử lý các tình huống thường gặp",
        "Troubleshoot common situations"
      ],
      "items": [
        [
          "Không thấy đơn: kiểm tra đúng tài khoản, bỏ bộ lọc đang dùng và xem lại lịch sử giao dịch mua. Việc đổi ví không tự chuyển đơn sang một tài khoản khác.",
          "An order is missing: check the account, clear active filters and inspect the purchase transaction history. Changing a wallet does not automatically move an order to another account."
        ],
        [
          "Giao dịch chờ lâu hoặc mất popup: mở yêu cầu trong lịch sử và phục hồi. Nếu đã có hash, đối chiếu trạng thái và receipt; chờ quá hạn không tự có nghĩa là thất bại.",
          "A transaction is taking time or its popup closed: open the request in history and recovery. When a hash exists, check status and receipt. A timeout does not automatically mean failure."
        ],
        [
          "Ví yêu cầu xác thực lại: tiếp tục trong luồng của yêu cầu đang có và kiểm tra đúng tài khoản/ví. Không cung cấp OTP hay thông tin bí mật qua ticket.",
          "The wallet requests authentication again: continue within the existing request and check the account and wallet. Do not provide OTPs or secrets through a ticket."
        ],
        [
          "Không mở được tài nguyên: kiểm tra trạng thái giao, phiên đăng nhập và quyền của đơn. Gửi thông báo lỗi đã che dữ liệu riêng qua hỗ trợ của đơn.",
          "A resource cannot be opened: check delivery status, session and order authority. Send a redacted error message through the order’s support flow."
        ],
        [
          "Không thấy khoản claim: kiểm tra trạng thái, quyền của ví, khoản đã rút và điều kiện của đơn. Một ticket đã xử lý không tự tạo phân bổ hoặc giao dịch claim.",
          "A claim is unavailable: check status, wallet authority, previous claims and order conditions. A resolved ticket does not itself create an allocation or claim transaction."
        ]
      ]
    },
    {
      "id": "support",
      "title": [
        "Gửi yêu cầu hỗ trợ rõ ràng",
        "Submit a useful support request"
      ],
      "paragraphs": [
        [
          "Đăng nhập rồi mở Hỗ trợ, hoặc tạo ticket từ đúng đơn để giữ ngữ cảnh. Mô tả bạn định làm gì, đã xảy ra điều gì, thời điểm, ID đơn và hash nếu có. Đọc lại ảnh chụp để che dữ liệu riêng trước khi gửi.",
          "Sign in and open Support, or create a ticket from the relevant order to retain context. Describe what you intended to do, what happened, the time, order ID and hash when available. Review screenshots and redact private data before sending."
        ],
        [
          "Không gửi private key, seed phrase, mật khẩu, OTP, token phiên, license key hay nội dung được bảo vệ. Ticket là kênh trao đổi; các thao tác tranh chấp, claim và xác nhận trên chain vẫn phải theo luồng riêng của đơn hoặc ví.",
          "Do not send private keys, recovery phrases, passwords, OTPs, session tokens, license keys or protected content. Tickets are a communication channel; onchain disputes, claims and confirmations still follow the order or wallet’s own action flow."
        ]
      ],
      "links": [
        {
          "href": "/support",
          "label": [
            "Mở ticket hỗ trợ",
            "Open support tickets"
          ]
        },
        {
          "href": "/policies/privacy",
          "label": [
            "Cách dữ liệu được sử dụng",
            "How your data is used"
          ]
        }
      ]
    }
  ]
};
