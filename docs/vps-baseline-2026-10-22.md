# Bản nền theo VPS ngày 22/10/2026

Theo yêu cầu người dùng, lấy bản đang chạy trên VPS làm chuẩn; lượt này chỉ đồng bộ local và GitHub. Không phát hành thay đổi lên VPS.

## Phiên bản thực tế

| Thành phần | Nguồn đang chạy |
| --- | --- |
| Frontend | `5e7a012c790084a6c7ff59dfc3e9f31a4764b3f2` |
| Backend runtime | `4b5af7604df53be680e7af9986d45810ac4d26e2` |
| Release đang phục vụ | `47d853f79ff5c2b1c8ac7f0f8163ca613fb82d9a` |
| Lịch sử tài liệu/tooling kế thừa | `5178ef6206b766ae32ffc2daba7da8a5c58581a3` |

VPS đã phát hành frontend và backend ở hai thời điểm khác nhau. Vì vậy bản đồng bộ là một commit tổng hợp: frontend giữ nguyên nguồn đã phát hành, backend/src khớp nguồn backend đang chạy. Năm dịch vụ backup/recovery được đưa về đúng bản đã triển khai; 15 dòng khai báo dependency mới hơn chưa triển khai được giữ lại trong lịch sử Git. Các script kiểm tra và tài liệu mới hơn vẫn được giữ. Đây không phải tuyên bố rằng mọi thành phần VPS cùng xuất phát từ một commit.

## Kiểm chứng

- Đọc lại dấu vân tay từ VPS: 182 file frontend và 189 file JavaScript backend. Không mở database hay đọc secrets.
- Backend build local thành công; frontend typecheck thành công.
- Toàn bộ 182 file frontend local khớp SHA-256 với bản VPS. Đây là artifact phát hành có sẵn, không phải một bản frontend mới build với môi trường khác.
- Toàn bộ 189 file JavaScript backend build local khớp SHA-256 với VPS sau khi giữ nguồn ở định dạng xuống dòng LF. Thêm quy tắc Git để Windows không gây lệch byte khi build lại.
- Bộ kiểm tra đầy đủ trước đây thuộc source `5e7a012`; lượt đồng bộ này không chạy lại full CI, không thao tác giao dịch thật và không xác nhận nghiệm thu toàn sản phẩm.

Danh sách hash từng file nằm trong [manifest](vps-baseline-2026-10-22.json). `node scripts/verify_vps_baseline.cjs` kiểm tra nguồn; thêm `--artifacts` để đối chiếu cả các thư mục build local khi có đủ artifact. Công cụ chỉ đọc file/Git, không kết nối VPS hoặc database. Sau khi sửa tính năng mới, việc nguồn khác manifest cũ là dự kiến; không sửa manifest cũ để biến thay đổi mới thành bằng chứng bản VPS cũ.

## Bảo toàn công việc cũ

Checkout cũ ở root đã lạc hậu so với clone phát hành nằm trong `.cache/ci/c-322e58ff`. Việc sửa UI trên checkout cũ và preview dùng dữ liệu mẫu gây ra sai khác với VPS.

Đã giữ nguyên công việc cũ tại `E:/apps/group-deal/local-preservation/2026-10-22-before-vps-sync/`, kèm manifest SHA-256, patch, bản build cũ và stash `61708ada734f2050673e2736a59e792cc186ab1e`. Bản lưu này và dữ liệu/evidence local không được đưa lên repository công khai. UI cũ chưa được tích hợp; cần xem lại từng thay đổi trên nguồn chuẩn khi người dùng cho làm tiếp. Preview mẫu cũ đã dừng.

## Luồng làm việc từ đây

1. Chỉ sửa tại repository chính `E:/apps/group-deal`; kiểm tra branch và trạng thái Git trước khi sửa. Không tiếp tục phát triển trong clone CI/cache.
2. Xem diff và build/kiểm tra phần bị ảnh hưởng tại local. Dùng đúng cấu hình môi trường để xem trước; ghi rõ nếu preview dùng dữ liệu mẫu hoặc API thật.
3. Commit, push lên GitHub và ghi mã commit ứng viên. Không lấy thư mục chưa commit làm nguồn triển khai.
4. Khi được yêu cầu triển khai, build đúng commit ứng viên, ghi hash artifact, kiểm tra backup và phát hành lên VPS. Ghi riêng commit frontend/backend nếu chỉ cập nhật một phần.

Lượt này giữ nguyên dịch vụ, database, đường dẫn dữ liệu và lịch backup trên VPS. Dữ liệu vận hành và secrets thuộc môi trường chạy; đồng bộ mã nguồn không có nghĩa sao chép database production về máy hay đưa lên GitHub.
