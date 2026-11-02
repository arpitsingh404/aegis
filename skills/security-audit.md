---
name: security-audit
description: Audit a server or codebase for security issues — SSH hardening, open ports, secrets, dependency risks.
---

# Security Audit Skill

Use this when the user asks to audit a machine, VPS, or repository.

## Live host checklist
1. **SSH**: PermitRootLogin, PasswordAuthentication, MaxAuthTries, fail2ban status, auth.log/journalctl failed-login volume, top attacker IPs.
2. **Ports**: `ss -tlnp` vs firewall (ufw/iptables) — flag anything listening on 0.0.0.0 without need.
3. **Users**: accounts with shells, sudo group, authorized_keys for unknown keys.
4. **Updates**: `apt list --upgradable` / OS equivalent; unattended-upgrades state.
5. **Services**: run as root? containers with `--privileged`? databases bound to localhost only?
6. **Web**: TLS validity, security.txt, headers (CSP, HSTS), exposed admin panels.

## Code checklist
1. Secrets committed (API keys, tokens, .env in git history).
2. Command execution: shell string concat vs execFile with arg arrays.
3. Path handling: resolve + prefix check before file reads/writes.
4. Auth: token comparison should be constant-time; no default credentials.
5. Dependencies: known-vulnerable versions (`npm audit` / `pip-audit`).

## Output format
Report as a table: `Severity (Critical/High/Medium/Low) | Finding | Evidence | Fix`.
Apply only safe, reversible fixes immediately; ask before anything that can lock out access (auth changes, firewall defaults).
