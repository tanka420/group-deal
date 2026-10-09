# GroupDeal tài chính quyền người mua và giao hàng

Phần 2 của đặc tả sản phẩm, gồm mục 6–9. Đọc cùng hai phần còn lại. Công thức early rebate đề xuất nằm trong [Contract và dữ liệu](./02B_CONTRACT_VA_DU_LIEU.md); các quyết định chưa chốt phải được xác nhận trước khi bật tính năng.

[Mục lục](./README.md) · [Phần trước](./01_SAN_PHAM_VA_NGHIEP_VU.md) · [Phần tiếp](./01C_MAN_HINH_VA_CHINH_SACH.md)

## 6 Quy tắc giá và ví dụ tính tiền

### Giá khóa và giá cuối

Khi một giao dịch mua được xử lý, lấy giá của tier đang mở **trước khi** cộng quantity/buyer của giao dịch đó. Giá này được khóa cho order. Sau đó cập nhật metric và mở các tier mới nếu đạt ngưỡng. Order tạo ra ngưỡng được hưởng chênh lệch khi quyết toán giá cuối.

Với `q` là quantity, `L` là giá khóa mỗi đơn vị, `F` là giá cuối mỗi đơn vị:

```text
committedGross = L × q
baseRebate = (L − F) × q
pendingProductAmount = committedGross − baseRebate
```

Tier không lùi nên `F ≤ L` cho các order hợp lệ. Gas là khoản riêng và không được ghi vào committed gross, rebate hoặc seller proceeds.

Ví dụ, một campaign dùng BUYER_COUNT có các tier sau:

| Ngưỡng tài khoản đã tham gia | Giá mỗi license |
|---|---|
| 1 | 120 USDC |
| 20 | 105 USDC |
| 50 | 89 USDC |
| 100 | 75 USDC |

Khi có 37 buyer và giá hiện tại là 105 USDC, buyer mới mua hai license cam kết **210 USDC**, cộng gas. Nếu final price là 89, rebate cơ bản là `(105 − 89) × 2 = 32 USDC`; phần sản phẩm chờ giao/xử lý là 178 USDC. Giá 120 không phải số tiền thực khóa của order mới này.

Trong phép đếm tăng từ 19 lên 20, order làm đạt ngưỡng 20 vẫn khóa giá 120 theo quy tắc trước cập nhật metric; các lần mua tiếp khóa 105. Nếu 37 buyer mỗi người mua một unit, 20 order khóa 120 và 17 order khóa 105 thì gross là `20 × 120 + 17 × 105 = 4.185 USDC`. Gross phải cộng amount từng order; không lấy giá hiện tại nhân buyer count.

### Early supporter

Slot chỉ dành cho đơn vị đầu tiên của lần cam kết đủ điều kiện đầu tiên của một buyer. Thứ tự xác định bằng giao dịch onchain đã xác nhận; mở checkout hoặc giữ draft không giữ slot. Buyer có thể đặt điều kiện bắt buộc còn slot; hết slot thì giao dịch phải revert.

Fixed rebate và percentage rebate là hai lựa chọn loại trừ nhau. Phải có giới hạn cấu hình và làm tròn số nguyên. Cơ sở tính phần trăm và cách cap tại final settlement là quyết định cần chốt trước khi bật; công thức tham chiếu an toàn được nêu trong tài liệu kiến trúc. Khi early rebate tắt, mọi giá trị early phải bằng 0.

### Sổ tiền của order

```text
buyerAllocation = rebateAllocated + buyerRefundAllocated
buyerAllocation + sellerGrossAllocation + stillUnallocated = committedGross
buyerClaimable = buyerAllocation − buyerClaimedAmount
sellerClaimable = sellerGrossAllocation − sellerClaimedAmount
```

Các số phải không âm; cumulative claimed không vượt allocation. Claim không hết hạn theo protocol và không chuyển quyền khi đổi account/contact/ví. Phân bổ tiền và rút tiền là hai sự kiện khác nhau.

Một order cam kết 210, đã phân bổ rebate 32 và buyer đã rút 32 vẫn có thể phát sinh refund 178 do giao hàng vi phạm SLA. Khi đó buyer allocation là 210, buyer claimed là 32 và buyer claimable còn 178. Một boolean `đã rút` không đủ mô tả order này.

## 7 Danh tính và quyền tài chính

Một account có campaign identity ổn định theo từng campaign, được lưu mapping/version ở offchain. Không đưa email, account ID, license hoặc định danh trực tiếp liên kết account giữa các campaign lên chain. Cùng địa chỉ ví trên chain vẫn có thể bị liên kết công khai.

Cam kết có tiền đầu tiên đồng thời ghim ví gửi tiền làm buyer principal. Sau đó ví khác của cùng account không được mua thêm hoặc thực hiện quyền tài chính thay principal đó. Ghim principal và nhận tiền phải nguyên tử: nếu chuyển tiền thất bại, toàn bộ giao dịch revert và không để lại principal giả.

Một ví ngoài chỉ có một liên kết account đang hoạt động tại một thời điểm, cưỡng chế bằng unique constraint và transaction. Đổi email, unlink/relink, khôi phục hoặc đình chỉ account không thay principal, seller payout snapshot hoặc người nhận claim cũ.

Authorization mua phải ràng buộc chain, contract/campaign, terms, campaign identity, ví, hành động, nonce, quantity và deadline. Contract kiểm replay, limits và principal. Backend phải kiểm lại policy và trạng thái sau các bước chờ RPC/provider; UI ẩn nút không thay thế kiểm quyền.

## 8 Giao hàng và xử lý quyền của order

SLA tính từ `finalizedAt`, không tính từ lúc buyer bấm mua. Seller cần hoàn tất delivery test trước publish. Entitlement bí mật ở offchain, mã hóa và chỉ được đọc theo quyền order; log, sự kiện chain, email và webhook công khai không chứa nội dung bí mật.

| Phương thức | Kết quả người mua cần nhận |
|---|---|
| License key | Key hợp lệ, cấp phát nguyên tử, không tái dùng trái điều khoản; mapping đủ quantity |
| File hoặc link bảo vệ | Tài nguyên thật; truy cập kiểm quyền, link có thời hạn và khả năng tải lại theo policy |
| Account invite hoặc activation | Provider tạo đúng quyền/seat cho đúng buyer; có xác nhận/callback kiểm chứng |
| Webhook hoặc API | Seller nhận event đúng order, xử lý cấp quyền và trả bằng chứng giao theo schema đã thống nhất |

Job đã xếp hàng, callback chưa xác minh hoặc transaction delivery còn pending không đủ để gọi đã giao. Giao thật phải gắn với order, snapshot và bằng chứng; contract ghi nhận hash/mốc thời gian cần thiết theo authority đã chốt. Chi tiết bí mật không đưa lên chain.

Nếu không có bằng chứng giao đúng hạn, phần tiền sản phẩm còn chưa phân bổ của order được chuyển allocation về buyer bằng transition onchain; backend phát hiện và chuẩn bị hành động nhưng không tự hoàn trong database.

Sau delivery onchain hợp lệ, buyer có 48 giờ để xác nhận sớm hoặc mở dispute. Xác nhận sớm hoặc hết cửa sổ mà không có dispute cho phép settlement phần còn lại về seller theo contract. Chỉ khi đã phân bổ thì seller mới có khoản claimable.

## 9 Tranh chấp và hủy khẩn cấp

Dispute giữ đúng phần còn chờ của order liên quan. Rebate đã phân bổ vẫn thuộc buyer. Operator chia khoản tranh chấp thành buyer share và seller share sao cho tổng bằng đúng khoản đó; người nhận chỉ là buyer principal và payout wallet đã ghim.

Ví dụ order còn 178 USDC đang tranh chấp, operator quyết định buyer nhận 100 và seller nhận 78. Rebate 32 đã rút không bị thu hồi; tổng phân bổ cuối là buyer 132 và seller 78, bằng gross 210.

Buyer cần đường mở dispute trực tiếp onchain trong thời hạn hợp lệ khi app/backend hoặc dịch vụ bằng chứng không hoạt động. Ví ngoài có thể gọi contract trực tiếp. Với ví Circle, cần cơ chế khẩn cấp do buyer kiểm soát, scope chỉ một order, thời hạn và nonce, chỉ được mở dispute; không được claim, chuyển hoặc phân bổ tiền. Luồng này phải được chuẩn bị trước outage và thử khi thành phần chính dừng.

Khả năng ký của Circle vẫn có phụ thuộc provider. Không diễn đạt cơ chế khẩn cấp là hoạt động khi mọi hạ tầng đều mất; đội kỹ thuật phải công bố dependency và kiểm chứng đúng tình huống outage đã cam kết.

Hủy toàn campaign do sự cố nghiêm trọng thuộc Security Multisig, có reason hash và audit. Với mỗi order, chỉ phần chưa phân bổ được allocation về buyer. Không đảo allocation cuối cùng, thu hồi seller proceeds đã rút hoặc tác động campaign khác. Các xử lý lớn phải chia batch, không lặp toàn bộ buyer trong một giao dịch.

Quyền buyer tự hủy cam kết, thời hạn, tiền hoàn, tồn kho và slot sau hủy chưa được xác định đủ trong yêu cầu gốc. Đó là một policy cần chốt trước khi có nút hủy mua; tier đã mở vẫn không được lùi.

