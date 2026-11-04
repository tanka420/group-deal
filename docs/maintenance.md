# Temporary public website notice

`config/maintenance/index.html` is a standalone English/Vietnamese notice using the GroupDeal typeface and palette. It has no application bundle, authentication, telemetry or API calls.

The domain configuration serves it with HTTP 503, `Cache-Control: no-store`, `Retry-After` and `X-Robots-Tag: noindex, nofollow` when `/var/www/groupdeal/maintenance/ENABLED` exists. The gate covers the root, SPA routes, direct HTML and other static paths, including seller/admin. The notice's two font paths remain available. API and health routing stay unchanged; this is a website maintenance gate, not API access control.

For activation, pin the committed source and hashes, preserve the previous Nginx configuration, install the notice and flag, run `nginx -t`, then reload Nginx. Verify HTTP status/body on normal and nested routes, redirects, font responses, and API health. Record frontend/backend versions and the rollback configuration privately. Do not read or change runtime databases, application credentials or backend services.

The website stays closed while interface work continues locally. Reopening requires an explicit request, verification of the frontend release being exposed, and removal of the maintenance flag. A frontend deployment alone must not reopen the site.
