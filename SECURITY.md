# Security

GroupDeal is a personal project in active Testnet development. Full live validation and independent security review remain open; see the [roadmap](ROADMAP.md). There is no separately maintained stable-release support schedule yet.

## Report a vulnerability

Use [Issues](https://github.com/tanka420/group-deal/issues) for ordinary UI defects and feature ideas.

For a security-sensitive problem, use **Security → Advisories → Report a vulnerability** if GitHub private reporting is available. If that option is unavailable, open a minimal issue asking the maintainer to establish a private reporting channel. Do not include vulnerability details in that public request. No separate security email or response-time commitment is published.

In the private report, include the affected revision/component, expected and observed behavior, impact and a minimal reproduction using an isolated test environment. Redact credentials, sessions and private customer content. Do not access other users' accounts, alter a live deployment or use real funds to demonstrate a finding.

## Sensitive material

Never publish private keys, provider tokens, session cookies, wallet challenges, private license keys, runtime databases or backups. Review screenshots and browser traces before sharing them.

If a credential is exposed, revoke or rotate it at its issuer. Removing a later copy does not revoke it. The repository's literal-secret scan is a local check, not proof that every secret format or historical object is safe.
