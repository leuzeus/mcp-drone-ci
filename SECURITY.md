# Security Policy

## Supported Versions
This project is in early development.

Security fixes are applied on the `main` branch.

## Reporting a Vulnerability
Do not open a public issue for security vulnerabilities.

Please report vulnerabilities through GitHub private vulnerability reporting:
`Security` -> `Advisories` -> `Report a vulnerability`.

If private reporting is unavailable, contact the maintainer directly and include:
- affected component and version/commit,
- impact summary,
- reproduction steps,
- proposed mitigation if available.

## Security Baseline
- Secrets must come from environment variables only.
- `.env` files are local-only and must never be committed.
- Write actions are disabled by default.
- Webhook signatures are validated with HMAC SHA-256.
