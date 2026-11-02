---
name: code-review
description: Structured code review — find bugs, security issues and performance problems, then rank fixes by severity.
---

# Code Review Skill

When asked to review code, follow this exact process:

1. **Scope** — identify the files/diff in question (git_diff, or the files the user named).
2. **Read** — read every file fully before judging. Never review from memory.
3. **Check in this order:**
   - Security: injection, path traversal, secrets in code, unsafe shell/command construction, auth gaps
   - Correctness: off-by-one, null/undefined handling, race conditions, wrong error handling, resource leaks
   - Performance: N+1 queries, unnecessary loops over large data, blocking calls on hot paths
   - Maintainability: dead code, duplicated logic, misleading names, missing tests
4. **Rank** — output as a table: `Severity (P0/P1/P2) | File:Line | Issue | Fix`.
   - P0 = will break or endanger users in production
   - P1 = real bug, likely to be hit
   - P2 = improvement
5. **Fix** — for each P0/P1, provide the exact patched code. Ask before applying.

Rules: never invent issues to pad the list. If the code is fine, say so plainly.
