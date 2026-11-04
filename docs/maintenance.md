# Temporary Mainnet website notice

This gate applies to **`groupdeal.tech`**, the Mainnet domain. **`testnet.groupdeal.tech`** is the Testnet application domain and is not closed by this notice. The two hosts still share application infrastructure at the last inspection; see [deployment status](deployment-status.md). The website gate does not create an isolated Mainnet environment.

`config/maintenance/index.html` is a standalone English/Vietnamese notice using the GroupDeal typeface and palette. It has no application bundle, authentication, telemetry or API calls.

The domain configuration serves it with HTTP 503, `Cache-Control: no-store`, `Retry-After` and `X-Robots-Tag: noindex, nofollow` when `/var/www/groupdeal/maintenance/ENABLED` exists. The gate covers the root, SPA routes, direct HTML and other static paths, including seller/admin. The notice's two font paths remain available. API and health routing stay unchanged; this is a website maintenance gate, not API access control.

For activation, pin the committed source and hashes, preserve the previous Nginx configuration, install the notice and flag, run `nginx -t`, then reload Nginx. Verify HTTP status/body on normal and nested routes, redirects, font responses, and API health. Record frontend/backend versions and the rollback configuration privately. Do not read or change runtime databases, application credentials or backend services.

The Mainnet website stays closed until the user explicitly requests reopening. Reopening requires verification of the release and environment being exposed, including the still-open separation work, before removing the maintenance flag. A frontend deployment alone must not reopen the site. Testnet review can continue at its own domain and in the local preview.
