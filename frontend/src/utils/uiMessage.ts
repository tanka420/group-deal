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
