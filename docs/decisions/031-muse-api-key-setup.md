# 031 — Configure local Muse with an API key

Date: 2026-09-27.

Status: accepted user request; supersedes the explicit model-configuration requirement in [decision 030](030-continuing-muse-chat.md).

## Context

The user requested a working Muse setup where adding a key to `.env` is sufficient.
The adapter already sends conversation context to Meta, but the environment template
omitted its settings and the adapter required both a key and a model name.

## Decision

Document `META_MUSE_API_KEY` in `.env.example` and default the existing adapter to
`muse-spark-1.3`, as specified in the [official quickstart](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions).
Keep `META_MUSE_MODEL` as an optional override; blank values use the default.
Preserve existing `.env` values when adding the missing key placeholder locally.

## Consequences

Restarting Rails after adding a valid, authorized Meta Model API key enables live
chat for signed-in local users. A configured key does not prove provider access;
only a successful request does. Scripted demo replies remain explicitly labeled
and make no provider calls. No new dependencies, schema changes, or public hosting
are introduced. Direct model/schema/migration review found no persistence changes
needed. Tests use a stubbed provider and isolated local PostgreSQL, not hosted data.

## Related documents

- [Setup and demo explanation](../../README.md#connect-live-muse-locally)
- [Local demo](../local-demo.md)
