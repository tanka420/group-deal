# GroupDeal sign-in email

Standalone email templates aligned with the current Testnet website. These files do not change the live email-provider configuration.

| Language | HTML body | Plain-text body | Suggested subject |
| --- | --- | --- | --- |
| English | `groupdeal-otp-email.html` | `groupdeal-otp-email.txt` | Your GroupDeal sign-in code |
| Vietnamese | `groupdeal-otp-email.vi.html` | `groupdeal-otp-email.vi.txt` | Mã đăng nhập GroupDeal của bạn |

Keep `{{code}}` and `{{expiry_long}}` unchanged when importing the HTML into the existing provider. Both names come from the supplied v2 template. The provider supplies the real code and expiry; no duration is hardcoded. Use the localized template and subject that match the user's language, with English as the website's default. A provider that supplies an English `expiry_long` value needs to localize that value for the Vietnamese template as well.

The email directs the reader to the verification window opened from GroupDeal, matching the existing Circle sign-in flow. It does not add a new sign-in link or token in a URL. The Testnet return links, contact email and footer credit match the website.

The layout uses presentation tables and inline styles, with mobile adjustments and an Outlook desktop width wrapper. It has no scripts, remote fonts, tracking, or image dependencies. The text wordmark remains visible when email images are blocked. Be Vietnam Pro is preferred where available; Arial/Helvetica is the email fallback. Browser previews check layout only; validate a test send in the target email clients before updating the live template.
