# 018 — Register unused wearables on first authenticated use

Date: 2026-09-26.

Status: accepted MVP scope change; supersedes the manual-provisioning prerequisite preserved by decision 016 and the account/storage integration documents.

## Context

The physical wearable could display live data while Today stayed empty: the upload preflight rejected its unregistered identity. The operator explicitly requested dropping manual device provisioning for MVP.

## Decision

`POST /api/v1/devices` binds a new device ID, or an unowned device with no session history, to the signed-in account. Return the existing `200` response shape for both new registration and same-owner retries. The browser's existing upload preflight performs registration when the first positive-session snapshot is saved. Session-zero readings remain display-only.

Never transfer another account's device or attribute legacy unowned history. Both cases return the same `404 device_not_found` without owner/history details. Registration remains authenticated, CSRF-protected and strictly validated. The existing unique ID constraint and reload under row lock serialize competing claims: one account wins, the other receives `404`. Existing-owner retries are idempotent. No revoke/transfer/reset endpoint is added; the operator task remains optional.

## Consequences

This is trust on first authenticated HTTP claim, **not proof of hardware possession**. The BLE ID is public, and the server cannot verify that a caller read it over Bluetooth. Unused IDs now succeed, so registration can reveal availability. Stronger enrollment remains a prerequisite for an untrusted public rollout. Existing ownership, session owner immutability, atomic snapshot history and account-scoped summaries are unchanged. No schema or dependency change is needed.

## Related documents

- [Previous integration baseline](016-integrate-existing-hardware.md)
- [API contract](../app-api.md)
- [Accounts and ownership](../authentication-mvp.md)
- [Hosted storage gates](../data-storage.md)
