# GroupDeal receiver on Cloudflare Workers + D1

This independently deployed receiver uses the pinned SDK 2.0.0 package and a durable D1 inbox. It does not connect to the GroupDeal application database, hold wallet keys, or issue transactions.

The deployed worker queues verified events. A CSV Studio provider is prepared and locally tested, but has not been deployed or enabled. HTTP 202 or a queued event alone does not demonstrate H5 acceptance.

## Current deployment

The receiver is deployed at `https://groupdeal-csv-studio-receiver.tanmai-26d.workers.dev/webhooks/groupdeal`. Six remote synthetic checks and a duplicate check after redeployment passed on 21 October 2026. All three synthetic inbox rows and both temporary test secrets were then removed. The account holder subsequently connected the real subscription and secret through private input. Readback at 06:59 UTC confirms `200 READY`, both secret binding names and an empty inbox. A real producer signature has not yet been verified.

The account holder authorized Free usage only. No paid-plan upgrade, billing subscription or GroupDeal DNS change was performed. Real GroupDeal delivery, provider entitlement and producer retry/DLQ remain unverified.

## Local checks

`npm test` now covers16tests, including actual protected ZIP download, concurrent order deduplication, durable grant recovery, context isolation, expiry/revocation and business-schema failure without a false acknowledgement. These are synthetic local checks, separate from the earlier deployed receiver proof.

The optional provider requires both `CSV_STUDIO_CAMPAIGN_ID` and `CSV_STUDIO_HUB_ADDRESS`. Configure them only after verifying a new campaign with zero orders. Migration0002is prepared, not applied remotely. Each allowed Arc Testnet order gets one capability for the purchased seat count; download lasts30days from provider grant creation. Capability URLs are private bearer secrets. No public inbox/grant listing exists. The prepared provider does not automate delivery transactions, financial lifecycle or Mainnet revocation.

See `reports/H5_CSV_STUDIO_PROVIDER_NEXT_2026-10-21.md` for the next draft product and actor steps.

```sh
npm ci --ignore-scripts
npm test
```

Tests use synthetic events and local Miniflare/D1. No Cloudflare account or production secret is required. `npm run build` only bundles with `wrangler deploy --dry-run`; it does not deploy.

## Deployment after the account is authorized

The configuration targets account `26d1e0308af3e38f5348b223cd991260` and the dedicated D1 database `groupdeal-csv-studio-inbox` (`de241d11-29e9-4667-95ad-eb8f69308860`). The account holder confirmed Workers Free on 21 October 2026. This database was created in APAC and migration `0001_inbox.sql` was applied only to it. For a different deployment, create a new database and replace both account and database IDs first. Store `GROUPDEAL_WEBHOOK_SECRET` and `GROUPDEAL_WEBHOOK_SUBSCRIPTION_ID` as Worker secrets using private input; never commit or paste them in chat.

First deploy on the account's `workers.dev` HTTPS address. Do not change the GroupDeal domain, DNS or current VPS. A production custom domain can be considered separately after ownership is known. Confirm the account plan and usage before deploying; Free quotas are not a capacity or availability guarantee.

Then create/review a new seller subscription for `/webhooks/groupdeal`. Verify fresh signed delivery, durable deduplication and controlled outage/retry/DLQ on new jobs. Keep all old orders and 95 held jobs untouched. Implement and verify the actual provider entitlement before treating H5 as complete.

The receiver stores allowlisted order/campaign webhook metadata privately in D1. It exposes no inbox listing and logs neither bodies nor signatures. Account connection, deployment and real event transmission are not established by local tests.

## Limits checked on 21 October 2026

Workers Free includes 100,000 requests/day and 10 ms CPU/request. D1 Free includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Stay on Free for this small integration; do not enable a paid plan automatically.

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Node crypto compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

Pinned SDK archive SHA-256: `474af3cedf3d15b91e77fe4d7b1ce285880ea69d17e9f4cdfe824d3685669d54`.
