import { uiMessage, UiError, type UiMessage } from "../utils/uiMessage";

/** Provider diagnostics may contain credentials. Only recognised meanings reach the UI. */
export const requiresWalletReload = (error: unknown): boolean => error instanceof Error && error.message === "WALLET_RELOAD_REQUIRED";
export function walletReloadError(): UiError {
  const error = new UiError(uiMessage("Kết nối ví không tải được trong phiên trang này. Tải lại trang để thử lại; bạn vẫn có thể đăng nhập qua Circle.", "The wallet connection could not load in this page session. Reload the page to retry; Circle sign-in remains available."));
  error.message = "WALLET_RELOAD_REQUIRED";
  return error;
}

export function authErrorMessage(error: unknown, action: "SEND" | "VERIFY" | "WALLET"): UiMessage {
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error ? (error as { code?: unknown }).code : undefined;
  if (requiresWalletReload(error))
    return walletReloadError().displayMessage;
  if (code === 4001 || code === "ACTION_REJECTED" || /user rejected|user denied|Bạn đã đóng (?:xác thực Circle|kết nối ví)/i.test(message))
    return uiMessage("Bạn đã từ chối hoặc đóng xác thực. Có thể mở lại khi sẵn sàng.", "You declined or closed authentication. You can reopen it when ready.");
  if (/Quá nhiều yêu cầu|Vui lòng đợi|RATE_LIMIT|TOO_MANY_REQUESTS/.test(message))
    return uiMessage("Đã gửi nhiều yêu cầu. Vui lòng chờ trước khi thử lại.", "Too many requests were sent. Please wait before trying again.");
  if (/AUTH_RESPONSE_INVALID|Phiên đăng nhập đã|AUTH_SESSION_INACTIVE|WALLET_CONNECTION_ENDED/.test(message))
    return uiMessage("Phiên hoặc phản hồi đăng nhập không còn phù hợp. Kiểm tra tài khoản hiện tại rồi thử lại.", "The session or sign-in response is no longer valid. Check the current account before trying again.");
  if (/Hết thời gian|timeout|timed out/i.test(message))
    return uiMessage("Chưa hoàn tất xác thực trong thời gian chờ. Kiểm tra cửa sổ ví hoặc Circle trước khi thử lại.", "Authentication did not complete before the timeout. Check the wallet or Circle window before trying again.");
  if (message === "REOWN_AUTH_CONFIGURATION")
    return uiMessage("Cấu hình kết nối ví cần được cập nhật. Vui lòng thử lại sau; bạn vẫn có thể đăng nhập qua Circle.", "Wallet connection settings need an update. Please try later; Circle sign-in remains available.");
  if (action === "SEND") return uiMessage("Chưa xác nhận được yêu cầu gửi OTP. Kiểm tra email và kết nối rồi thử lại.", "The OTP request could not be confirmed. Check your email address and connection before trying again.");
  if (action === "WALLET") return uiMessage("Chưa đăng nhập được bằng ví. Kiểm tra kết nối và mạng Arc Testnet rồi thử lại.", "Wallet sign-in did not complete. Check the connection and Arc Testnet network before trying again.");
  return uiMessage("Circle chưa hoàn tất đăng nhập. Kiểm tra cửa sổ xác thực rồi thử lại.", "Circle sign-in did not complete. Check the authentication window before trying again.");
}

export function authProgressText(progress: string | null, language: "vi" | "en"): string {
  if (progress === "Đang tạo phiên đăng nhập GroupDeal...") return language === "en" ? "Creating your GroupDeal sign-in session…" : "Đang tạo phiên đăng nhập GroupDeal…";
  return language === "en" ? "Complete authentication in Circle’s window. You can cancel there." : "Hoàn tất xác thực trong cửa sổ Circle. Bạn có thể hủy tại đó.";
}
