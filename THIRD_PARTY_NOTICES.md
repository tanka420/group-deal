# Third-party notices

The root [MIT license](LICENSE) covers GroupDeal-authored software. Third-party material retains its original copyright and license. This index highlights bundled material; dependencies installed from lockfiles retain their package-specific notices too.

## Design tools

Pinned revisions and paths are recorded in [docs/ui-skills.json](docs/ui-skills.json). These are development tools, not application runtime dependencies.

| Material | Upstream and revision | License and retained notice |
| --- | --- | --- |
| Taste | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), `12af471f627f866411b4bd785b19646d3672784c` | MIT; copyright 2026 Leonxlnx; [license](.agents/skills/design-taste-frontend/LICENSE) |
| Impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable), `9fadc41729c38fd47d7ae622b501558653f9d2e9` | Apache-2.0; [license](.agents/skills/impeccable/LICENSE) and [notices](.agents/skills/impeccable/NOTICE.md) |

Impeccable's retained notices describe platform references derived from ehmo's MIT-licensed platform-design-skills. Keep those notices when redistributing the tool.

## Fonts

| Font | Copyright | License |
| --- | --- | --- |
| Be Vietnam Pro | 2021 The Be Vietnam Pro Project Authors | [SIL OFL 1.1](frontend/public/fonts/be-vietnam-pro/OFL.txt) |
| JetBrains Mono | 2020 The JetBrains Mono Project Authors | [SIL OFL 1.1](frontend/public/fonts/JetBrains-Mono-OFL.txt) |
| Plus Jakarta Sans | 2020 The Plus Jakarta Sans Project Authors | [SIL OFL 1.1](frontend/public/fonts/Plus-Jakarta-Sans-OFL.txt) |

Be Vietnam Pro is the interface font; JetBrains Mono is used for appropriate technical identifiers. The Plus Jakarta Sans package/notice remains, although its previous global stylesheet import was removed.

## Images and examples

The homepage banner was supplied by the maintainer and is bundled at `frontend/public/images/marketplace-banner.jpg`. [Screenshot provenance](docs/images/README.md) records the documentation captures. Illustrative products, prices and participation figures are not live business metrics.

The source-code license does not establish rights to third-party artwork, trademarks or depicted products. Confirm the relevant permissions before reusing those materials separately. Sample products can carry their own license files in [samples/](samples/).
