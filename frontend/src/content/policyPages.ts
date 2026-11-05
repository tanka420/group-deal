import type {ReadingContent} from './readingContent';

const CONTACT_EMAIL = "admin@groupdeal.tech";

export const policyPages:Record<string,ReadingContent> = {
  "contact": {
    "title": [
      "Liên hệ",
      "Contact"
    ],
    "intro": [
      "Nếu bạn có câu hỏi về GroupDeal, hãy gửi email cho chúng tôi.",
      "If you have questions about GroupDeal, you are welcome to email us."
    ],
    "sections": [
      {
        "id": "email",
        "title": [
          "Liên hệ qua email",
          "Contact by email"
        ],
        "paragraphs": [
          [
            "Bạn có thể gửi câu hỏi về GroupDeal tới địa chỉ email dưới đây.",
            "You can send questions about GroupDeal to the email address below."
          ]
        ],
        "links": [
          {
            "href": "mailto:" + CONTACT_EMAIL,
            "label": [
              CONTACT_EMAIL,
              CONTACT_EMAIL
            ]
          }
        ]
      }
    ]
  },
  "how": {
    "title": [
      "Cách GroupDeal hoạt động",
      "How GroupDeal works"
    ],
    "intro": [
      "Cùng mua một sản phẩm số theo những bậc giá được công bố trước. Từ lúc chọn deal đến khi nhận sản phẩm và rút khoản được phân bổ, mỗi bước có trạng thái và điều kiện riêng.",
      "Buy a digital product together under published group price tiers. Choosing a deal, committing funds, receiving the product and claiming an allocation are separate steps with their own conditions."
    ],
    "sections": [
      {
        "id": "purpose",
        "title": [
          "GroupDeal giải quyết điều gì?",
          "What GroupDeal does"
        ],
        "paragraphs": [
          [
            "GroupDeal là dự án cá nhân đang thử nghiệm mô hình mua chung phần mềm và sản phẩm số trên Arc Testnet. Người bán công bố sản phẩm, điều kiện license, thời hạn tham gia, bậc giá và cách giao; người mua xem các thông tin này trước khi cam kết USDC.",
            "GroupDeal is a personal project testing group purchases of software and digital goods on Arc Testnet. Sellers publish the product, license conditions, joining deadline, price tiers and delivery method. Buyers review these details before committing USDC."
          ],
          [
            "Giao diện hiện dùng tài sản thử nghiệm. Một deal xuất hiện trên trang khám phá không tự chứng minh sản phẩm phù hợp với nhu cầu của bạn; hãy kiểm tra nội dung, quyền sử dụng và điều kiện của chính deal đó.",
            "The current interface uses test assets. A listing in Explore does not by itself establish that a product meets your needs. Check that deal’s contents, usage rights and conditions."
          ]
        ]
      },
      {
        "id": "before-buying",
        "title": [
          "Đọc deal trước khi mua",
          "Read the deal before buying"
        ],
        "items": [
          [
            "Kiểm tra edition, số chỗ hoặc số lượng, phạm vi sử dụng, thời hạn license và người bán.",
            "Check the edition, seats or quantity, usage scope, license duration and seller."
          ],
          [
            "Xem giá hiện tại, mốc mở bậc tiếp theo và cách đếm của chiến dịch: số tài khoản hay số đơn vị.",
            "Review the current price, next threshold and campaign metric: participating accounts or units."
          ],
          [
            "Đọc thời điểm kết thúc, SLA giao hàng và các điều kiện xác nhận nhận hàng hoặc tranh chấp.",
            "Read the closing time, delivery SLA and conditions for confirming receipt or opening a dispute."
          ]
        ],
        "links": [
          {
            "href": "/explore",
            "label": [
              "Khám phá deal",
              "Explore deals"
            ]
          }
        ]
      },
      {
        "id": "group-price",
        "title": [
          "Các bậc giá nhóm",
          "Group price tiers"
        ],
        "paragraphs": [
          [
            "Các mốc và giá được công bố trong deal. Một bậc tốt hơn chỉ mở khi nhóm đạt điều kiện tương ứng; số người đang xem hoặc việc bấm vào sản phẩm không được tính là mua hàng.",
            "A deal publishes its thresholds and prices. A better tier unlocks only when the relevant conditions are met. Viewing a product or clicking its card does not count as a purchase."
          ],
          [
            "Giá mở bán, giá khóa lúc mua và giá chốt có thể khác nhau. Rebate tùy phiên bản giao thức và điều khoản của đơn. Đọc số tiền được ghi nhận trong đơn thay vì mặc định lấy giá trên card trừ cho một bậc giá tương lai.",
            "The opening price, price locked at purchase and final price can differ. Rebates depend on the order’s protocol version and terms. Read the amounts recorded in your order rather than assuming a rebate from a future card price."
          ]
        ]
      },
      {
        "id": "commitment",
        "title": [
          "Cam kết mua được ghi nhận thế nào?",
          "How a commitment is recorded"
        ],
        "paragraphs": [
          [
            "Chọn số lượng rồi mở phần rà soát mua. Kiểm tra số tiền, phí được hiển thị, mạng và ví thực hiện. Ví có thể yêu cầu phê duyệt token trước giao dịch mua; đây là những bước khác nhau.",
            "Choose a quantity and open the purchase review. Check the amount, displayed fees, network and acting wallet. Your wallet may request token approval before the purchase transaction; these are separate steps."
          ],
          [
            "Chỉ coi việc mua đã được ghi nhận khi trạng thái giao dịch được xác nhận và đơn xuất hiện. Đóng cửa sổ, mất kết nối hoặc hết thời gian chờ không chứng minh giao dịch đã thất bại. Dùng phần phục hồi để kiểm tra yêu cầu đang có trước khi thử tạo giao dịch mới.",
            "Treat a purchase as recorded when its transaction is confirmed and the order appears. Closing a window, disconnecting or timing out does not prove failure. Check the existing request in recovery before preparing another transaction."
          ]
        ]
      },
      {
        "id": "after-closing",
        "title": [
          "Sau thời hạn tham gia",
          "After the joining deadline"
        ],
        "paragraphs": [
          [
            "Đồng hồ đếm ngược giúp theo dõi thời hạn; kết quả cuối cần được ghi nhận bằng thao tác chốt trên chain. Sau khi chiến dịch chốt, theo dõi SLA và việc giao sản phẩm trong Đơn hàng.",
            "The countdown helps you track the deadline; the final outcome requires a recorded onchain finalization. After finalization, follow the delivery SLA and fulfillment in Orders."
          ],
          [
            "Sản phẩm và license được ghim theo phiên bản của đơn. Hãy kiểm tra tài nguyên đã nhận trước khi xác nhận nhận hàng. Nếu có vấn đề, dùng thao tác tranh chấp của đơn trong cửa sổ cho phép và gửi thông tin hỗ trợ phù hợp.",
            "The order pins its product and license version. Inspect the delivered resources before confirming receipt. If something is wrong, use the order’s dispute action within the permitted window and provide relevant support information."
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
        "id": "allocations",
        "title": [
          "Rebate và khoản hoàn",
          "Rebates and refunds"
        ],
        "paragraphs": [
          [
            "Khoản đã được phân bổ chưa có nghĩa là tiền đã về ví. Khi đủ điều kiện, đơn sẽ hiển thị số còn có thể rút và thao tác tương ứng. Bạn cần dùng ví được phép của đơn để xác nhận yêu cầu rút.",
            "An allocation does not mean funds have arrived in your wallet. When eligible, the order shows the remaining claimable amount and its action. Use the wallet authorized for that order to confirm the claim."
          ],
          [
            "Ticket hỗ trợ giúp trao đổi và kiểm tra sự cố; nó không thay thế thao tác chốt, tranh chấp hoặc rút tiền trên chain. Xem hướng dẫn sử dụng để đi qua từng bước và cách xử lý giao dịch chưa rõ kết quả.",
            "Support tickets help communicate and investigate issues. They do not replace onchain finalization, dispute or claim actions. The user guide explains each step and how to handle an unresolved transaction."
          ]
        ],
        "links": [
          {
            "href": "/policies/help",
            "label": [
              "Đọc hướng dẫn sử dụng",
              "Read the user guide"
            ]
          },
          {
            "href": "/policies/refunds",
            "label": [
              "Hiểu khoản được phân bổ",
              "Understand allocations"
            ]
          }
        ]
      }
    ]
  },
  "terms": {
    "title": [
      "Điều khoản sử dụng",
      "Terms of use"
    ],
    "intro": [
      "Những điều kiện sử dụng giao diện Testnet hiện tại, trách nhiệm khi thao tác và các giới hạn cần hiểu trước khi tham gia một deal.",
      "Usage conditions for the current Testnet interface, your responsibilities when acting, and the limits to understand before joining a deal."
    ],
    "sections": [
      {
        "id": "scope",
        "title": [
          "Phạm vi hiện tại",
          "Current scope"
        ],
        "paragraphs": [
          [
            "GroupDeal hiện được cung cấp như một dự án thử nghiệm cá nhân trên Arc Testnet, dùng tài sản thử nghiệm. Trang này áp dụng cho việc sử dụng giao diện Testnet hiện tại.",
            "GroupDeal is currently provided as a personal experimental project on Arc Testnet using test assets. These conditions apply to use of the current Testnet interface."
          ],
          [
            "Mỗi deal có điều kiện sản phẩm, giá, thời hạn và giao hàng riêng. Hãy đọc cả trang deal và phần rà soát trước khi xác nhận; một mô tả chung ở footer không thay thế các điều kiện được ghi nhận cho đơn cụ thể.",
            "Each deal has its own product, pricing, deadline and delivery conditions. Read the deal and review screen before confirming. General footer information does not replace the terms recorded for a particular order."
          ]
        ]
      },
      {
        "id": "accounts",
        "title": [
          "Tài khoản và quyền của ví",
          "Accounts and wallet authority"
        ],
        "items": [
          [
            "Chỉ đăng nhập, liên kết ví và sử dụng tài nguyên mà bạn có quyền truy cập. Giữ an toàn phương thức đăng nhập và kiểm tra các phiên trong Tài khoản.",
            "Only sign in, link wallets and use resources you are authorized to access. Protect your sign-in method and review sessions in Account."
          ],
          [
            "Username chỉ được tạo một lần theo chức năng hiện tại. Kiểm tra kỹ tên trước khi lưu.",
            "The current username feature allows a name to be created once. Review it carefully before saving."
          ],
          [
            "Chuyển ví đang hoạt động không chuyển quyền sở hữu đơn và không đổi ví được phép xử lý đơn cũ. Một thao tác có thể yêu cầu đúng tài khoản và đúng ví đã được ghi nhận.",
            "Switching the active wallet does not transfer order ownership or replace the wallet authorized for an existing order. An action may require both the correct account and the recorded wallet."
          ]
        ]
      },
      {
        "id": "purchase-terms",
        "title": [
          "Điều kiện của đơn mua",
          "Purchase conditions"
        ],
        "paragraphs": [
          [
            "Thông tin sản phẩm và license được ghim theo phiên bản tại thời điểm mua. Một phiên bản mới hoặc việc sửa hồ sơ người bán không tự thay nội dung của đơn trước đó. Quyền sử dụng phải được đọc theo edition, số chỗ, thời hạn và phạm vi đã công bố.",
            "Product and license information is pinned to the purchased version. A new version or seller profile edit does not automatically change an earlier order. Read usage rights according to the published edition, seats, duration and scope."
          ],
          [
            "Giá và quote có thể hết hiệu lực hoặc thay đổi trước lúc ký. Dùng phần rà soát còn hiệu lực, kiểm tra số lượng và tổng tiền. Không mặc định có thể hủy mua bất kỳ lúc nào hoặc chắc chắn mở được bậc giá tiếp theo.",
            "Prices and quotes can expire or change before signing. Use a valid review and check quantity and totals. Do not assume that purchases can be cancelled at any time or that the next price tier is guaranteed."
          ]
        ]
      },
      {
        "id": "transactions",
        "title": [
          "Xác nhận giao dịch",
          "Confirming transactions"
        ],
        "items": [
          [
            "Đọc mạng, ví, số tiền, người nhận và phí trước mỗi lần xác nhận. Phê duyệt token, mua, xác nhận nhận hàng, tranh chấp và claim là các thao tác riêng.",
            "Read the network, wallet, amount, recipient and fees before each confirmation. Token approval, purchase, receipt confirmation, dispute and claim are separate actions."
          ],
          [
            "Giao dịch đã phát đi cần được kiểm tra bằng trạng thái và receipt. Một hash, một HTTP thành công hoặc việc đóng popup không tự chứng minh kết quả cuối.",
            "A submitted transaction needs status and receipt checks. A hash, successful HTTP response or closed popup does not by itself establish the final outcome."
          ],
          [
            "Nếu chưa rõ kết quả, kiểm tra yêu cầu đang có trong lịch sử và phục hồi. Không coi một lần chờ quá hạn là lý do đủ để ký lại một giao dịch mới.",
            "If the result is unresolved, inspect the existing request in history and recovery. A timeout alone is not enough reason to sign a new transaction."
          ]
        ]
      },
      {
        "id": "delivery-and-use",
        "title": [
          "Giao hàng và sử dụng sản phẩm",
          "Delivery and product use"
        ],
        "paragraphs": [
          [
            "Người bán cần công bố đúng sản phẩm, quyền phân phối và điều kiện giao. Người mua cần kiểm tra sản phẩm trước khi xác nhận đã nhận. Các thời hạn giao, tranh chấp và điều kiện hoàn phải được đối chiếu với đơn.",
            "Sellers need to describe the product, distribution rights and delivery conditions accurately. Buyers need to inspect the product before confirming receipt. Check the order for delivery deadlines, dispute windows and refund conditions."
          ],
          [
            "Sử dụng license và tài nguyên đúng phạm vi đã mua. Không dùng tính năng của ứng dụng để truy cập tài nguyên của người khác, giả mạo danh tính hoặc làm lộ mã truy cập riêng.",
            "Use licenses and resources within their purchased scope. Do not use application features to access another person’s resources, impersonate someone or expose private access codes."
          ]
        ]
      },
      {
        "id": "availability-and-support",
        "title": [
          "Tính sẵn sàng và hỗ trợ",
          "Availability and support"
        ],
        "paragraphs": [
          [
            "Giao diện, indexer, nhà cung cấp ví hoặc mạng có thể trả chậm hay tạm thời không khả dụng. Nếu dữ liệu chưa được xác minh, chờ hoặc làm mới theo hướng dẫn thay vì suy đoán số dư, trạng thái giao dịch hay quyền nhận tiền.",
            "The interface, indexer, wallet provider or network may be slow or temporarily unavailable. When data is unverified, wait or refresh as instructed rather than inferring balances, transaction status or entitlement to funds."
          ],
          [
            "Gửi ticket trong ứng dụng để hỏi về tài khoản, đơn hoặc dữ liệu. Việc tạo, trả lời hay đóng ticket không tự đảo ngược giao dịch hoặc thực hiện thao tác tài chính thay bạn.",
            "Use in-app tickets for account, order or data questions. Creating, answering or closing a ticket does not automatically reverse a transaction or perform a financial action on your behalf."
          ]
        ],
        "links": [
          {
            "href": "/policies/help",
            "label": [
              "Hướng dẫn thao tác",
              "Read the user guide"
            ]
          },
          {
            "href": "/support",
            "label": [
              "Gửi yêu cầu hỗ trợ",
              "Open support tickets"
            ]
          }
        ]
      }
    ]
  },
  "privacy": {
    "title": [
      "Quyền riêng tư",
      "Privacy"
    ],
    "intro": [
      "Hiểu thông tin nào phục vụ tài khoản và đơn hàng, phần nào được hiển thị công khai, và cách tự bảo vệ dữ liệu khi dùng GroupDeal.",
      "Understand which information supports your account and orders, what is public, and how to protect your data while using GroupDeal."
    ],
    "sections": [
      {
        "id": "account-data",
        "title": [
          "Thông tin phục vụ tài khoản",
          "Information used for your account"
        ],
        "paragraphs": [
          [
            "Ứng dụng xử lý định danh đăng nhập, username, ví đã liên kết, phiên đăng nhập và lựa chọn thông báo để cung cấp tài khoản và kiểm tra quyền. Tùy cách đăng nhập, thông tin có thể gồm địa chỉ email hoặc địa chỉ ví.",
            "The application processes sign-in identifiers, username, linked wallets, sessions and notification preferences to provide account access and authorization. Depending on your sign-in method, this can include an email address or wallet address."
          ],
          [
            "Thông tin đơn, thao tác giao dịch, trạng thái giao hàng và trao đổi hỗ trợ được sử dụng để hiển thị lịch sử, phục hồi yêu cầu và xử lý các chức năng bạn sử dụng. Chỉ gửi thông tin cần thiết cho mục đích đó.",
            "Order information, transaction operations, delivery status and support messages are used to display history, recover requests and provide the features you use. Submit only information needed for that purpose."
          ]
        ]
      },
      {
        "id": "public-information",
        "title": [
          "Nội dung nào là công khai?",
          "What is public?"
        ],
        "items": [
          [
            "Username và thông tin hồ sơ người bán có thể được hiển thị cho người khác. Đọc lại phần giới thiệu, đường dẫn và thông tin bạn công bố trước khi lưu.",
            "Usernames and seller profile information can be displayed to others. Review descriptions, links and information you publish before saving."
          ],
          [
            "Deal public và thông tin sản phẩm được công bố có thể được xem mà không cần đăng nhập. Deal unlisted vẫn có thể được truy cập bởi người có liên kết.",
            "Public deals and published product information can be viewed without signing in. An unlisted deal can still be accessed by someone who has its link."
          ],
          [
            "Địa chỉ, hash và hoạt động được ghi trên blockchain có thể xem qua explorer. Việc dùng một ticket riêng tư không làm lịch sử trên chain trở thành riêng tư.",
            "Addresses, hashes and activity recorded on the blockchain can be viewed through an explorer. A private support ticket does not make onchain history private."
          ]
        ]
      },
      {
        "id": "protected-resources",
        "title": [
          "Đơn và tài nguyên riêng",
          "Orders and private resources"
        ],
        "paragraphs": [
          [
            "Đơn, ticket và tài nguyên được bảo vệ yêu cầu phiên đăng nhập cùng kiểm tra quyền phù hợp. Một người biết ID đơn hoặc xem được deal công khai không vì thế được quyền tải nội dung riêng của đơn.",
            "Orders, tickets and protected resources require a session and appropriate authorization checks. Knowing an order ID or viewing its public deal does not by itself authorize someone to download the order’s private content."
          ],
          [
            "License key và một số nội dung giao hàng được mã hóa ở backend. Backend có thể giải mã để phục vụ luồng được cấp quyền; đây không phải cơ chế mã hóa đầu cuối chỉ người mua mới giải mã được. Không đưa mã truy cập vào hồ sơ công khai, ảnh chụp hoặc ticket.",
            "License keys and some delivery content are encrypted at the backend. The backend can decrypt them for authorized workflows; this is not buyer-only end-to-end encryption. Keep access codes out of public profiles, screenshots and support tickets."
          ]
        ]
      },
      {
        "id": "browser-and-providers",
        "title": [
          "Trình duyệt và dịch vụ liên quan",
          "Your browser and related services"
        ],
        "paragraphs": [
          [
            "Trình duyệt lưu lựa chọn ngôn ngữ, thông tin phiên và các tham chiếu cần cho phục hồi thao tác. Xóa dữ liệu trang có thể đăng xuất hoặc xóa tham chiếu phục hồi cục bộ; việc đó không xóa giao dịch đã ghi trên chain.",
            "Your browser stores language preferences, session information and references used for operation recovery. Clearing site data can sign you out or remove local recovery references; it does not erase recorded blockchain transactions."
          ],
          [
            "Đăng nhập, kết nối ví, nạp tiền hoặc gửi email có thể sử dụng nhà cung cấp được cấu hình, bao gồm Circle và Reown. Các luồng này có thể mở cửa sổ riêng và xử lý thông tin theo dịch vụ của nhà cung cấp. Kiểm tra cửa sổ và thao tác bạn đang cho phép.",
            "Sign-in, wallet connections, funding or email delivery can involve configured providers, including Circle and Reown. These flows may open their own windows and process information through the provider’s service. Check the window and action you are authorizing."
          ]
        ]
      },
      {
        "id": "your-controls",
        "title": [
          "Các lựa chọn của bạn",
          "Controls available to you"
        ],
        "items": [
          [
            "Trong Tài khoản, xem ví liên kết, phiên đăng nhập và các thiết lập hiện có. Đăng xuất khỏi thiết bị dùng chung khi hoàn tất.",
            "In Account, review linked wallets, sessions and the available settings. Sign out when finished on a shared device."
          ],
          [
            "Dùng các tùy chọn thông báo được cung cấp để chọn cách nhận cập nhật. Thay lựa chọn thông báo không thay trạng thái hoặc thời hạn của đơn.",
            "Use the provided notification preferences to choose how updates reach you. Notification choices do not change an order’s status or deadlines."
          ],
          [
            "Gửi ticket tài khoản để hỏi về thông tin được lưu hoặc quyền truy cập dữ liệu. Không coi việc đóng ticket hoặc xóa dữ liệu trình duyệt là thao tác xóa tài khoản hay xóa dữ liệu trên chain.",
            "Use an account ticket to ask about stored information or data access. Closing a ticket or clearing browser storage is not an account-deletion or onchain-erasure action."
          ]
        ],
        "links": [
          {
            "href": "/account",
            "label": [
              "Mở Tài khoản",
              "Open Account"
            ]
          },
          {
            "href": "/support",
            "label": [
              "Hỏi về dữ liệu của bạn",
              "Ask about your data"
            ]
          }
        ]
      },
      {
        "id": "safe-sharing",
        "title": [
          "Chia sẻ thông tin an toàn",
          "Sharing information safely"
        ],
        "paragraphs": [
          [
            "Khi cần hỗ trợ, thường chỉ nên gửi ID đơn, hash giao dịch, thời điểm xảy ra sự cố và thông báo lỗi đã che thông tin riêng. Đọc lại ảnh chụp trước khi gửi.",
            "For support, usually provide an order ID, transaction hash, incident time and a redacted error message. Review screenshots before sending them."
          ],
          [
            "Không chia sẻ private key, seed phrase, mật khẩu, OTP, token phiên, license key hoặc nội dung tải xuống có quyền truy cập riêng. Chỉ xác nhận yêu cầu đăng nhập và chữ ký trong luồng bạn chủ động mở.",
            "Do not share private keys, recovery phrases, passwords, OTPs, session tokens, license keys or access-controlled downloads. Confirm sign-in and signature requests only in a flow you initiated."
          ]
        ]
      }
    ]
  },
  "delivery": {
    "title": [
      "Giao sản phẩm số",
      "Digital delivery"
    ],
    "intro": [
      "Theo dõi thời điểm bắt đầu giao, cách mở tài nguyên của đơn, việc xác nhận nhận hàng và các bước cần làm nếu nội dung chưa đúng.",
      "Follow when delivery starts, how to access your order’s resources, when to confirm receipt, and what to do if the content is not right."
    ],
    "sections": [
      {
        "id": "purchased-version",
        "title": [
          "Bạn sẽ nhận phiên bản nào?",
          "Which version will you receive?"
        ],
        "paragraphs": [
          [
            "Đơn giữ phiên bản sản phẩm và license được ghim tại lúc mua. Xem edition, số chỗ, thời hạn, phạm vi sử dụng và cách giao trong deal hoặc chi tiết đơn. Các mục này giúp phân biệt một key, một tài khoản, một tệp hoặc một quyền truy cập được cấp.",
            "An order retains the product and license version pinned at purchase. Review the edition, seats, duration, usage scope and delivery method in the deal or order details. These distinguish a key, account, file or granted access."
          ],
          [
            "Phiên bản mới do người bán xuất bản không tự thay nội dung đơn cũ. Nếu mô tả và tài nguyên nhận được không khớp, giữ lại thông tin liên quan để trao đổi từ chính đơn đó.",
            "A newly published seller version does not automatically replace an existing order’s contents. If the description and delivered resource do not match, keep relevant information and start the conversation from that order."
          ]
        ]
      },
      {
        "id": "delivery-clock",
        "title": [
          "Thời hạn giao bắt đầu khi nào?",
          "When does the delivery clock start?"
        ],
        "paragraphs": [
          [
            "SLA giao hàng bắt đầu từ khi chiến dịch được chốt, không phải mặc định từ thời điểm bạn mở trang hoặc bấm mua. Kiểm tra thời điểm chốt và hạn giao được hiển thị cho đơn.",
            "The delivery SLA starts at campaign finalization, not automatically when you open the page or click buy. Check the finalization time and delivery deadline shown for the order."
          ],
          [
            "Theo dõi trạng thái thay vì chỉ dựa vào đồng hồ trên trình duyệt. Đang chờ hoặc đã chuẩn bị chưa đồng nghĩa với đã giao. Khi chưa tải được dữ liệu, làm mới trước khi kết luận người bán đã quá hạn.",
            "Follow the recorded status rather than relying only on a browser timer. Pending or prepared does not mean delivered. Refresh unavailable data before concluding that a seller is overdue."
          ]
        ]
      },
      {
        "id": "access",
        "title": [
          "Mở sản phẩm đã giao",
          "Access the delivered product"
        ],
        "ordered": true,
        "items": [
          [
            "Đăng nhập đúng tài khoản đã mua và mở Đơn hàng. Dùng bộ lọc hoặc tìm kiếm để chọn đơn cần xem.",
            "Sign in to the purchasing account and open Orders. Use filters or search to select the relevant order."
          ],
          [
            "Mở chi tiết đơn và xem phần giao hàng, tài nguyên cùng hướng dẫn do người bán cung cấp. Các thao tác cần ví phải dùng đúng ví được phép của đơn.",
            "Open order details and review delivery, resources and the seller’s instructions. Wallet-required actions must use the order’s authorized wallet."
          ],
          [
            "Chỉ mở, sao chép hoặc tải tài nguyên qua chức năng được cấp quyền. Lưu nội dung ở nơi riêng tư và sử dụng trong phạm vi license.",
            "Open, copy or download resources through the authorized controls. Store them privately and use them within the license scope."
          ]
        ],
        "links": [
          {
            "href": "/orders",
            "label": [
              "Mở đơn hàng",
              "Open orders"
            ]
          }
        ]
      },
      {
        "id": "receipt-and-dispute",
        "title": [
          "Kiểm tra trước khi xác nhận",
          "Inspect before confirming receipt"
        ],
        "paragraphs": [
          [
            "Kiểm tra rằng bạn nhận đúng loại sản phẩm, đủ số lượng hoặc số chỗ và có thể sử dụng theo hướng dẫn. Chỉ xác nhận đã nhận sau khi kiểm tra; thao tác này có thể ảnh hưởng đến các quyền xử lý tiếp theo của đơn.",
            "Check that the product type, quantity or seats are correct and that it works according to the instructions. Confirm receipt after inspection; the action can affect the order’s subsequent handling rights."
          ],
          [
            "Cửa sổ mở tranh chấp của luồng hiện tại là 48 giờ từ thời điểm giao được ghi nhận, không phải 48 giờ từ lúc mua. Đối chiếu hạn của đơn và dùng thao tác tranh chấp trước khi cửa sổ kết thúc. Ticket hỗ trợ hoặc tin nhắn không tự mở tranh chấp trên chain.",
            "The current flow’s dispute window is 48 hours from recorded delivery, not 48 hours from purchase. Check the order’s deadline and use its dispute action before the window closes. A support ticket or message does not automatically open an onchain dispute."
          ]
        ]
      },
      {
        "id": "late-or-missing",
        "title": [
          "Giao trễ, thiếu hoặc chưa truy cập được",
          "Late, incomplete or inaccessible delivery"
        ],
        "items": [
          [
            "Nếu chưa thấy tài nguyên, kiểm tra lại tài khoản, trạng thái giao, phiên đăng nhập và thông báo lỗi. Một liên kết riêng có thể yêu cầu được cấp quyền trước khi dùng.",
            "If resources are missing, recheck the account, delivery status, session and error message. A private link can require authorization before use."
          ],
          [
            "Nếu đã đủ điều kiện quá SLA, dùng thao tác mà đơn cung cấp để ghi nhận vi phạm. Việc phân bổ khoản hoàn và việc rút khoản đó là hai bước riêng.",
            "When an SLA-breach action becomes eligible, use the control provided by the order. Refund allocation and claiming that allocation are separate steps."
          ],
          [
            "Gửi thông tin từ đơn: nội dung cần nhận, vấn đề quan sát được, thời điểm và hash nếu có. Che key, mật khẩu, OTP và nội dung tài nguyên riêng trong ảnh hoặc tin nhắn hỗ trợ.",
            "Provide order context: the expected content, observed problem, time and hash when available. Redact keys, passwords, OTPs and private resource content from support screenshots or messages."
          ]
        ],
        "links": [
          {
            "href": "/policies/refunds",
            "label": [
              "Xem hoàn tiền và tranh chấp",
              "Read about refunds and disputes"
            ]
          },
          {
            "href": "/support",
            "label": [
              "Mở ticket hỗ trợ",
              "Open support tickets"
            ]
          }
        ]
      }
    ]
  },
  "refunds": {
    "title": [
      "Rebate, hoàn tiền & tranh chấp",
      "Rebates, refunds & disputes"
    ],
    "intro": [
      "Phân biệt giá của đơn, khoản được phân bổ và tiền đã thực sự nhận về ví. Quyền thao tác phụ thuộc vào trạng thái, điều khoản và ví được ghi nhận cho đơn.",
      "Distinguish order prices, allocated amounts and funds actually received in your wallet. Available actions depend on the order’s state, terms and recorded wallet."
    ],
    "sections": [
      {
        "id": "prices",
        "title": [
          "Hiểu các loại giá",
          "Understand the different prices"
        ],
        "items": [
          [
            "Giá mở bán là mức được công bố khi chiến dịch bắt đầu. Giá hiện tại cho biết bậc nhóm đang mở trên deal.",
            "The opening price is published when the campaign starts. The current price shows the group tier presently unlocked on the deal."
          ],
          [
            "Giá khóa của đơn và tổng cam kết là các giá trị được ghi nhận cho lần mua của bạn. Kiểm tra số lượng và phần rà soát để hiểu số tiền đã cam kết.",
            "The order’s locked price and committed total are recorded for your purchase. Review quantity and the purchase review to understand the amount committed."
          ],
          [
            "Giá chốt và rebate phụ thuộc kết quả, phiên bản giao thức và điều khoản đơn. Giá trên card không cộng sẵn rebate riêng của bạn.",
            "The final price and rebate depend on the outcome, protocol version and order terms. A card price does not include your personal rebate."
          ]
        ]
      },
      {
        "id": "allocation-vs-payment",
        "title": [
          "Phân bổ khác với chuyển tiền",
          "Allocation is different from payment"
        ],
        "paragraphs": [
          [
            "Rebate hoặc khoản hoàn được phân bổ là một quyền có thể rút theo điều kiện của đơn; chưa phải bằng chứng rằng ví đã nhận tiền. Xem mục còn có thể rút và lịch sử đã rút để biết trạng thái hiện tại.",
            "An allocated rebate or refund is an entitlement that can be claimed under the order’s conditions. It is not evidence that the wallet has received funds. Check remaining claimable amounts and previous claims for the current state."
          ],
          [
            "Ví dụ minh họa: nếu giao diện ghi còn có thể rút 4 USDC, bạn vẫn cần thực hiện claim khi đủ điều kiện. Chỉ xác nhận đã nhận tiền sau khi giao dịch claim có kết quả được ghi nhận. Không cộng khoản đã rút vào khoản còn lại lần nữa.",
            "Illustrative example: if the interface shows 4 USDC remaining claimable, a claim is still needed when eligible. Confirm receipt of funds after the claim transaction has a recorded result. Do not add amounts already claimed to the remaining amount again."
          ]
        ]
      },
      {
        "id": "when-refunds-apply",
        "title": [
          "Khi nào có thể có khoản hoàn?",
          "When can a refund apply?"
        ],
        "paragraphs": [
          [
            "Không có quyền hủy mua vô điều kiện ở mọi thời điểm. Khoản hoàn phụ thuộc trạng thái của chiến dịch, việc giao hàng, tình huống quá SLA hoặc kết quả tranh chấp theo quy tắc áp dụng cho đơn.",
            "Purchases do not have an unconditional cancellation right at every stage. Refunds depend on campaign state, delivery, an eligible SLA breach or a dispute outcome under the order’s applicable rules."
          ],
          [
            "Một trạng thái đã giao, một ticket đã đóng hay việc người bán trả lời tin nhắn không tự tạo khoản hoàn. Dùng các thao tác mà chi tiết đơn cung cấp và kiểm tra số tiền được ghi nhận sau khi yêu cầu hoàn tất.",
            "A delivered status, closed ticket or seller reply does not itself create a refund. Use the actions available in order details and check the recorded amounts after the request completes."
          ]
        ]
      },
      {
        "id": "dispute",
        "title": [
          "Mở và theo dõi tranh chấp",
          "Open and follow a dispute"
        ],
        "ordered": true,
        "items": [
          [
            "Kiểm tra thời điểm giao đã ghi nhận và hạn mở tranh chấp. Luồng hiện tại cho phép mở trong 48 giờ từ thời điểm giao; đối chiếu mốc cụ thể của đơn.",
            "Check the recorded delivery time and dispute deadline. The current flow permits opening within 48 hours of delivery; confirm the order’s specific timestamp."
          ],
          [
            "Mở tranh chấp từ đúng đơn, mô tả vấn đề và cung cấp bằng chứng phù hợp. Che nội dung bí mật; một tin nhắn hay ticket riêng không thay thao tác mở tranh chấp.",
            "Open the dispute from the relevant order, describe the issue and provide suitable evidence. Redact secrets; a message or support ticket does not replace the dispute action."
          ],
          [
            "Theo dõi trạng thái xử lý và kết quả phân bổ. Operator phân xử trong quy tắc contract; việc rút khoản được phân bổ được thực hiện riêng khi đủ điều kiện.",
            "Follow handling status and the allocation result. Operators resolve disputes within contract rules. Claiming an allocation is a separate action when eligible."
          ]
        ]
      },
      {
        "id": "claim",
        "title": [
          "Rút khoản đủ điều kiện",
          "Claim an eligible amount"
        ],
        "ordered": true,
        "items": [
          [
            "Đăng nhập đúng tài khoản, mở đơn và chọn ví được phép của đơn. Chọn ví đang hoạt động khác không tự đổi quyền của đơn.",
            "Sign in to the correct account, open the order and select its authorized wallet. Selecting another active wallet does not automatically change order authority."
          ],
          [
            "Kiểm tra số còn có thể rút và phần rà soát. Xác nhận yêu cầu ví chỉ khi mạng, ví và số tiền khớp điều bạn định làm.",
            "Check the remaining claimable amount and review. Confirm the wallet request only when the network, wallet and amount match your intent."
          ],
          [
            "Chờ trạng thái và receipt. Nếu chưa rõ kết quả, mở lịch sử và phục hồi để kiểm tra cùng yêu cầu trước khi thử lại.",
            "Wait for status and receipt confirmation. If unresolved, use history and recovery to inspect the same request before retrying."
          ]
        ],
        "links": [
          {
            "href": "/orders",
            "label": [
              "Kiểm tra khoản của đơn",
              "Check order allocations"
            ]
          }
        ]
      },
      {
        "id": "unresolved",
        "title": [
          "Nếu số tiền hoặc trạng thái chưa rõ",
          "If an amount or status is unresolved"
        ],
        "paragraphs": [
          [
            "Dữ liệu chưa tải được hoặc chưa xác minh không đồng nghĩa số dư bằng không hay giao dịch thất bại. Làm mới và kiểm tra lịch sử của yêu cầu. Hash giao dịch giúp đối chiếu trên explorer, nhưng riêng hash chưa chứng minh đã hoàn tất.",
            "Unavailable or unverified data does not mean a zero balance or failed transaction. Refresh and inspect the request history. A hash helps locate a transaction on the explorer, but the hash alone does not prove completion."
          ],
          [
            "Khi gửi ticket, cung cấp ID đơn, loại thao tác, thời điểm, hash nếu có và thông báo lỗi đã che dữ liệu riêng. Không gửi private key, seed phrase, OTP hoặc token phiên.",
            "For a ticket, provide the order ID, action type, time, hash when available and a redacted error message. Do not send private keys, recovery phrases, OTPs or session tokens."
          ]
        ],
        "links": [
          {
            "href": "/policies/help",
            "label": [
              "Hướng dẫn phục hồi",
              "Read the recovery guide"
            ]
          },
          {
            "href": "/support",
            "label": [
              "Mở hỗ trợ",
              "Open support"
            ]
          }
        ]
      }
    ]
  }
};
