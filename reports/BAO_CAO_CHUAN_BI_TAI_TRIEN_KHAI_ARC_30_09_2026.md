# BÁO CÁO THỰC THI TÁI TRIỂN KHAI ARC

**Ngày cập nhật:** 30/09/2026
**Trạng thái:** **ĐÃ HOÀN TẤT CLEANUP, SAFE 2-OF-3 VÀ DEPLOYMENT CANDIDATE MỚI**

Tài liệu này thay thế trạng thái “chỉ chuẩn bị/chưa phát giao dịch” trước đó. G5.1 đã hoàn tất trên Arc Testnet; G5 product acceptance và G6 vẫn chưa hoàn tất.

## 1. Cleanup deployment cũ

- Hub cũ: `0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a`.
- Campaign `1`, order `2` đã được hoàn tất delivery/confirm và rút hết phân bổ.
- Escrow cuối: `0`; số dư USDC của Hub cũ: `0`.
- Bằng chứng: [LEGACY_ARC_CLEANUP.json](./evidence/LEGACY_ARC_CLEANUP.json).

| Thao tác | Transaction | Block |
|---|---|---:|
| `recordDelivery` | `0x98e311c070e9bc1ada0600fc22fae43d9aa41967c3b3d2bd65e044e196cca0bd` | 64643699 |
| `confirmReceipt` | `0x2e09eb29833fcd0b10e31ec6aa29427d91c5ac065f16ab839fb0f1abed410100` | 64643709 |
| `claimBuyerFunds` | `0xb8dbee64e57256e81de28ff1c5d34561d7f99988b45f4eca7dc6b0bb246409ff` | 64643720 |
| `claimSellerProceeds` | `0x81bfe953e8f856cdcd1615854b04acb7c5dbe48f51ab3e90fc6ccf48e082667c` | 64643731 |

## 2. Security Safe 2-of-3

- Safe: `0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6`.
- Phiên bản: `1.5.0`; threshold: `2/3`.
- Owners:
  - `0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d`
  - `0xc289b853d90F2C604FD38458B1cE4B991156d18B`
  - `0x7366adBf19E511095e7737138498f625D737dB22`
- Deployment tx: `0xd72126237eb222c3e4c65f7aeef4536a642a8d1330f192f09b73bd0fb2e20e41`, block `64644253`.
- Bằng chứng owners/threshold/version/bytecode: [ARC_SECURITY_MULTISIG.json](./evidence/ARC_SECURITY_MULTISIG.json).

## 3. Candidate GroupDealHub mới

| Vai trò | Địa chỉ on-chain đã xác minh |
|---|---|
| Owner/deployer | `0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d` |
| Operator | `0xe48B30eA70F77E5FA6311471c2E9687f8A701Ead` |
| Authorized signer | `0xc9691f85f149e71C4e1C14c6E6204128546Eef17` |
| Security authority | `0xdDB2458855170cd4A0eF5aff1f65A78782Ca72e6` |

- Hub mới: `0x2A7aECd1CE90f1284EB060488c8dDEF4b1bE0574`.
- Deployment tx: `0x0eae9276292bbd4cf415223d40b71b0910adbb3d30911291a4d7ebda348bf254`, block `64644317`.
- Runtime bytecode hash: `0xf60bf0d51cf447ca2f17454696d1c8eceab500f18e49aee8c1df2e66a04064e7`.
- Fixed-block verify mới nhất tại block `64660310`: role, USDC predeploy, Safe, receipt, clean initial state và legacy cleanup đều PASS.
- Bằng chứng: [ARC_CANDIDATE_DEPLOYMENT_VERIFY.json](./evidence/ARC_CANDIDATE_DEPLOYMENT_VERIFY.json).

## 4. Kiểm thử sau deployment

`npm run verify:pipeline` đã PASS sau deployment mới:

- clean/compile 27 Solidity files;
- contract tests `24/24`;
- toàn bộ backend suites, bao gồm G5 fail-closed policy;
- Arc smoke trên chain `5042002`;
- backend, SDK và frontend build;
- backend/frontend typecheck;
- browser E2E `2/2`;
- diff hygiene.

## 5. Phần còn thiếu để hoàn tất dự án

Không còn blocker cleanup/deploy. Blocker còn lại thuộc G5 product acceptance và G6:

1. Private key/signer service của authorized signer phải dẫn xuất đúng `0xc969...ef17`.
2. Người giữ operator `0xe48...1ead` phải ký các action operator live.
3. Có ít nhất một owner Safe ngoài deployer để đồng ký emergency cancel 2-of-3.
4. Circle API key/App ID/email Console, Reown Project ID, email provider và các secret runtime phải được cấu hình cục bộ/secret manager.
5. Quyền sử dụng seller payout `0x24f0...7580` và Reown buyer `0x580c...21ae` phải sẵn sàng.
6. Chạy hành trình G5 qua browser/API/database/indexer/Arc và review độc lập G6.

Không gửi private key/seed phrase qua báo cáo hoặc commit vào repository.
