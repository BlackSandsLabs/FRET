# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.2.x | ✅ |
| < 1.2 | ❌ Please update |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's **private vulnerability reporting** (*Security* tab → *Report a vulnerability*). Include:

- what is affected (app, firmware, exports, case files)
- steps to reproduce
- the impact you expect

You'll get an acknowledgement within 7 days.

## Scope and design notes

- **Local only.** The app's API listens on `127.0.0.1` only, so it is not reachable from other machines.
- **Outbound network.** The only outbound connection is the user-initiated IEEE vendor update to `standards-oui.ieee.org`.
- **Case data is sensitive.** Case folders contain radio identifiers that may be personal data. Store them on encrypted, access-controlled storage.
- **Integrity.** Exports are hashed (SHA-256), but the case database is not signed. Treat the case folder's chain of custody as you would any other digital evidence.
