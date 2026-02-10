# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Mycelium Memory Hub, please report it responsibly.

**DO NOT** file a public issue for security vulnerabilities.

### How to Report

1. Email: security@scri.ai
2. Include a description of the vulnerability, steps to reproduce, and potential impact
3. Allow up to 72 hours for an initial response

### What to Expect

- Acknowledgment of your report within 72 hours
- Regular updates on the progress of addressing the vulnerability
- Credit in the security advisory (if desired)

### Scope

The following are in scope:

- Authentication and authorization bypass
- Injection vulnerabilities (SQL, command, etc.)
- Cross-site scripting (XSS) in web interfaces
- Sensitive data exposure
- CORS misconfiguration
- WebSocket security issues

### Out of Scope

- Denial of service attacks
- Social engineering
- Issues in third-party dependencies (report upstream)

## Security Best Practices for Deployment

1. **Never commit `.env` files** with real credentials
2. **Set `CORS_ORIGIN`** to your specific allowed origins in production
3. **Use PostgreSQL** (not SQLite) for production deployments
4. **Set `SECRETS_ENCRYPTION_KEY`** to a strong, persistent key
5. **Set `EXTERNAL_BRIDGE_TOKEN`** to a strong random value
6. **Enable HTTPS** via a reverse proxy (nginx, Caddy, etc.)
7. **Keep dependencies updated** — run `npm audit` regularly
