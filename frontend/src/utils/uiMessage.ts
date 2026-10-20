export type UiMessage = string | { vi: string; en: string };

export const uiMessage = (vi: string, en: string): UiMessage => ({ vi, en });
export const messageText = (message: UiMessage, language: "vi" | "en") =>
  typeof message === "string" ? message : message[language];

/** Keep presentation messages separate from the language-independent write checkpoint. */
export class UiError extends Error {
  constructor(public readonly displayMessage: UiMessage) {
    super(messageText(displayMessage, "en"));
  }
}

export function errorMessage(error: unknown, fallback: UiMessage): UiMessage {
  if (error instanceof UiError) return error.displayMessage;
  if (error instanceof Error) {
    if (/SELLER_USERNAME_REQUIRED/.test(error.message)) return uiMessage(
      "Chọn username tại Hồ sơ người bán trước khi xuất bản deal mới. Bản nháp được giữ nguyên.",
      "Choose a username in Seller profile before publishing a new deal. Your draft is preserved.",
    );
    if (/ACCOUNT_NEW_ACTIONS_RESTRICTED/.test(error.message)) return uiMessage(
      "Tài khoản đang bị hạn chế hoạt động mới. Bạn vẫn có thể xem và xử lý đơn cũ; liên hệ hỗ trợ để được kiểm tra.",
      "New activity is restricted for this account. You can still view and process existing orders; contact support for a review.",
    );
    if (/ACCOUNT_SELLER_PERMISSION_REVOKED/.test(error.message)) return uiMessage(
      "Quyền bắt đầu hoạt động người bán đã bị thu hồi. Bạn vẫn có thể xử lý dữ liệu lịch sử và liên hệ hỗ trợ.",
      "Permission to start new seller activity has been revoked. You can still process historical records and contact support.",
    );
    if (error.name === "TimeoutError" || error.name === "AbortError") return uiMessage(
      "Chưa xác nhận kết quả do kết nối hết thời gian. Giữ yêu cầu hiện tại để kiểm tra lại.",
      "The connection timed out before the result was confirmed. Keep the current request for recovery.",
    );
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) return uiMessage(
      "Chưa xác nhận kết quả do lỗi kết nối. Giữ yêu cầu hiện tại để kiểm tra lại.",
      "A connection error left the result unconfirmed. Keep the current request for recovery.",
    );
    return error.message;
  }
  return fallback;
}
