# Muse response diagnostics

## Local connection timeout fix

The Muse client resolves Meta's IPv4 address for each request, while retaining
`api.meta.ai` for HTTPS certificate verification and TLS SNI. This avoids the
observed IPv6 connection timeout without hardcoding a provider IP or disabling
certificate checks. Restart Rails to load the change, then submit one message.
No API key change is needed. This requires working IPv4 connectivity.

Credential-free connectivity checks reached Meta over IPv4 with Ruby in 0.12
seconds; the default Ruby connection and IPv6-only curl both timed out. A 401
on those checks is expected because they deliberately omit authorization. This
verifies connectivity, not a live model answer.

## Inspect new requests

Restart the local Rails server after updating, send a message once, then inspect
the server console or find diagnostic entries in the development log:

```sh
rg '"event":"muse_response"' log/development.log
```

Successful requests log at info level; failures log at warn level. Reloading the
page does not request a new answer. These entries describe new requests only.

## Reading an entry

- `outcome`: `success`, `empty_answer`, `http_error`, `invalid_json`, or `request_error`.
- `http_status`: HTTP status when a response is available.
- `error_category`: fixed label for request failures: `connect_timeout`, `read_timeout`, `write_timeout`, `timeout`, `dns_error`, `tls_error`, `connection_error`, or `processing_error`. Exception text is never included.
- `payload_type`, `choices_type`, `choice_count`, `content_type`, `content_blank`: structure of the expected reply, without its contents.
- `finish_reason`: a recognized completion reason, otherwise `unknown`.
- `refusal_present`: whether a non-null refusal field exists, without its text.
- `prompt_tokens`, `completion_tokens`, `total_tokens`, `reasoning_tokens`: nonnegative integer counts, when provided in the expected usage fields.
- `max_completion_tokens`: the current configured request limit, 4096.

An empty answer with `finish_reason: length` is evidence to investigate the token
budget. An array/object content type suggests a response-shape mismatch. Neither
is automatically retried or changed by this diagnostic addition.

## Privacy and verification

Entries exclude questions, conversation history, posture totals, reply/reasoning
text, raw bodies, headers, API keys, account identifiers, model overrides, and
exception messages. Arbitrary provider strings and keys are not copied. Rails
already filters the `question` request parameter. Token counts and structural
metadata still describe request activity; keep server logs private.

Direct model/schema/migration review found no persistence changes necessary.
Validation used stubbed provider responses and isolated local PostgreSQL:
18 Muse service/conversation/request tests passed with 135 assertions. Automated
tests make no live provider calls.

## Confirmed empty-answer cause

After the IPv4 change, a user-submitted live diagnostic showed HTTP 200 with
`finish_reason: length`, null content, and 1,197 reasoning tokens out of 1,200
completion tokens. The request budget is now 4,096 to leave more room for reply
text. Instructions still request concise answers. The higher ceiling can allow
more token usage and latency; it does not guarantee every answer will complete.
The existing timeouts and no-automatic-retry behavior remain in place. Verify a
new request's diagnostic after restarting Rails.
