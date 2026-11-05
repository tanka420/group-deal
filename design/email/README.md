# GroupDeal sign-in email

Standalone email templates aligned with the current Testnet website. These files do not change the live email-provider configuration.

| Language | HTML body | Plain-text body | Suggested subject |
| --- | --- | --- | --- |
| English | `groupdeal-otp-email.html` | `groupdeal-otp-email.txt` | Your GroupDeal sign-in code |
| Vietnamese | `groupdeal-otp-email.vi.html` | `groupdeal-otp-email.vi.txt` | Mã đăng nhập GroupDeal của bạn |

Keep `{{code}}` and `{{expiry_long}}` unchanged. Both names come from the supplied v2 template. The provider supplies the real code and expiry; no duration is hardcoded. Use the localized template and subject that match the user's language, with English as the website's default. A provider that supplies an English `expiry_long` value needs to localize that value for the Vietnamese template as well.

The email directs the reader to the verification window opened from GroupDeal, matching the existing Circle sign-in flow. It does not add a new sign-in link or token in a URL. The Testnet return links, contact email and footer credit match the website.

The layout uses presentation tables and inline styles, with mobile adjustments and an Outlook desktop width wrapper. It has no scripts, remote fonts, tracking, or image dependencies. The text wordmark remains visible when email images are blocked. Be Vietnam Pro is preferred where available; Arial/Helvetica is the email fallback. Browser previews check layout only; validate a test send in the target email clients before updating the live template.

## Circle Console editor

The user's Console screenshot shows that the saved template lost inline `style`, class names and other presentation attributes. The hidden preheader consequently became visible and the message lost its colors, spacing and code size. This demonstrates a change in the pasted/saved source; it does not establish whether the editor, the paste path or server-side filtering caused it. Browser previews of the standalone files do not verify Circle's save/send pipeline.

- `groupdeal-otp-circle-body.html` and `.vi.html`: body fragments with inline styles, no document/head/style tags, no hidden preheader and a code block that can wrap longer codes. Open the file as text in an editor, copy its source, and paste that source into Circle's HTML editor. Save, reopen, and check that `style=` is still present before testing delivery. Styling is conditional on the Console retaining it.
- `groupdeal-otp-circle-basic.html` and `.vi.html`: a semantic fallback using paragraphs, headings, emphasis and links. This version remains readable if presentation attributes are removed. It intentionally does not promise the website's precise colors or card layout.

Do not copy the rendered browser preview into the source editor. Do not paste the full standalone HTML document into the body-only field. The OTP and expiry placeholders must remain literal in the saved template.

## Sender display name

The template changes the body, not the message's `From` header. SMTP `Username` is an authentication identifier and must remain the provider's required value. The standard message-header form for the desired sender is `GroupDeal <admin@groupdeal.tech>`. Circle's public guide documents a From email address but does not confirm display-name syntax support in this field. If Console accepts this form, inspect the From header in a newly received test message. If it rejects anything except a bare address, use a Circle-supported sender-name setting or an SMTP relay/provider feature that sets the outgoing From display name; changing HTML or SMTP Username will not supply that header.

References: [Circle Email OTP setup](https://developers.circle.com/wallets/user-controlled/build-a-wallet-app#step-2-configure-the-circle-console-1), [RFC 5322 address syntax](https://www.rfc-editor.org/rfc/rfc5322#section-3.4).
