# Feature parity register

The approved design is authoritative. `source-actions.json` lists application controller methods at upstream commit aee05fb18aef1b603de2006beeb11a75704481f4; helper methods are not automatically public requirements. Inherited music administration is also covered below. Live-site visual parity remains unverified because access was blocked.

| Area | Replacement | Status | Verification |
|---|---|---|---|
| Runtime and persistent data | Workers / D1 / R2 | Foundation implemented | Build, typecheck, data integrity tests; local health/readiness |
| Browse, categories, composers | Familiar source-shaped navigation | Planned | Discovery browser flows |
| Live search and sticky filters | Indexed FTS5 / URL state | Planned | Search tests and browser flows |
| Song previews and files | Ordered score/audio/downloads | Planned | Owned fixture/browser flows |
| Bookmarks | Anonymous persistent list | Planned | Two-session browser test |
| Accounts and composer editing | Ownership-limited persistent tools | Planned | Permission/account/editor tests |
| Comments and competitions | Persisted feedback and closing rules | Planned | Fixed-clock and browser tests |
| Administration and content | Private catalog, taxonomy, accounts, content and diagnostics | Planned | Admin flows |
| Mail and announcements | Private captured outbox | Approved preview difference | No live recipients; reset test through private inbox |
| Original catalog/media and identities | Fictional data and owned fixtures | Approved preview difference | Provenance manifest |
| Bundled commerce | No store/checkout | Inactive legacy per approved design | Public cart links disabled; paid songs rejected in upstream view |
| Third-party trackers and original sponsor identities | Omitted from independent preview | Approved preview difference | Static inspection |
