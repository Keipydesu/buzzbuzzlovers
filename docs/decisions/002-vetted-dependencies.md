# 002 — Require established, vetted dependencies

Date: 2026-09-26

Status: accepted

## Context

Dependencies require scrutiny of provenance and safety before installation, rather than adoption merely because a package or release is new or convenient.

## Decision

Use established dependencies with documented independent scrutiny, maintenance history, verified provenance, and review of the exact version and transitive changes. Avoid brand-new packages and unreviewed latest releases. Apply this to gems, JavaScript packages, firmware libraries, and build/development tools.

## Consequences

Record review evidence, advisory checks, reviewed lockfile changes, and relevant tests. A clean scan or popularity alone does not certify safety. Review security fixes promptly rather than retaining a known vulnerability for an arbitrary waiting period. Existing scaffold dependencies are not automatically certified.

## Related documents

- [Dependency safety policy](../dependency-safety.md)
- [Repository guidance](../../AGENTS.md)
