# MVP accounts and device ownership

Implemented first slice of the [competition plan](social-competition-implementation-plan.md): username/password accounts, cookie sessions, account-scoped API access, and administrator-provisioned devices. Groups and live tracking integration are separate steps.

## Account flow

Visit `/signup` or `/login`. Usernames normalize to lowercase and accept 3–24 ASCII letters, digits or underscores. Passwords require at least 12 characters and at most bcrypt's 72 bytes. Passwords are hashed with Rails `has_secure_password`; never log or store their plaintext. Login resets the cookie session, and authentication expires after two weeks. Logout clears the current browser session. Password recovery is deferred.

Login is limited to 10 attempts per IP per 3 minutes; signup to 5. This uses the Rails cache store (development memory cache; production Solid Cache). Production forces HTTPS. Deployment must configure the production cache/database and HTTPS; this change does not provision hosting.

## Device provisioning

After the user signs up, an operator with access to the Rails environment runs:

```sh
bin/rails 'devices:provision[00112233445566778899aabbccddeeff,alice]'
```

This is an administrator action, not an HTTP endpoint. It cannot transfer an owned device or attribute legacy unowned history. Repeating the same binding is harmless. Existing prototype history remains unowned and inaccessible to accounts; any future import requires an explicit audited mapping. Device transfers are outside MVP scope.

Every API endpoint requires login (`401` otherwise). Device lists and summaries are scoped to the account; unknown and other-owned devices both return `404`. `POST /api/v1/devices` now acknowledges only an already provisioned device with `200`; it no longer registers arbitrary identities with `201`. Snapshot bodies and reconciliation semantics are unchanged. New sessions freeze their device owner's user ID; personal summaries use that owner.

## Dependency review: bcrypt 3.1.22

Reviewed 2026-09-26 before installation. Rails `has_secure_password` requires bcrypt; existing bcrypt_pbkdf is a different SSH dependency, not a password-auth replacement.

- Registry/upstream: [RubyGems release and signed provenance](https://rubygems.org/gems/bcrypt/versions/3.1.22) links the bcrypt-ruby repository and source commit 831ce64. Listed owners include tenderlove, codahale and tjschuck; the release uses that repository's GitHub Actions workflow. No unexplained ownership change was found in the reviewed release metadata.
- Established independent integration: the installed Rails 8.1.4 scaffold recommends bcrypt and Active Model implements `has_secure_password` on it. Upstream history extends many years; this is not selection based only on popularity.
- Reviewed upstream v3.1.20…v3.1.22 diff: constant-time comparison, Ractor annotation, CI/release changes, and JRuby overflow fix. [Maintainer advisory](https://github.com/bcrypt-ruby/bcrypt-ruby/security/advisories/GHSA-f27w-vcwj-c954) identifies 3.1.22 as the fix for CVE-2026-33306. No older version was previously vetted by this project; the comparison is review context, not a prior approval claim.
- Read gemspec and native `ext/mri/extconf.rb`: no runtime transitive dependencies; conventional local mkmf compilation of the bundled bcrypt/Openwall C implementation, no network/install download hooks. No new runtime source behavior beyond the reviewed delta was identified; this is a scoped source review, not a cryptographic audit.
- Ran the existing pinned `bundle-audit check --update` against RubySec advisory DB fb34fedf8a96f99e54bcfb9306519996a70baa25; no advisories in the existing tree. Ran `bundle-audit check` again after installation: none found. Lockfile adds only bcrypt 3.1.22; no unrelated upgrades.

## Local verification

Use only an isolated local PostgreSQL test database:

```sh
env -u DATABASE_URL -u PRIMARY_DATABASE_URL -u PGHOST -u PGSERVICE -u PGSERVICEFILE -u PGDATABASE -u PGUSER -u PGPASSWORD SKIP_DOTENV=1 RAILS_ENV=test DATABASE_URL=postgresql://127.0.0.1:5432/bbl_competition_test_20260926 bin/rails db:migrate
env -u DATABASE_URL -u PRIMARY_DATABASE_URL -u PGHOST -u PGSERVICE -u PGSERVICEFILE -u PGDATABASE -u PGUSER -u PGPASSWORD SKIP_DOTENV=1 RAILS_ENV=test DATABASE_URL=postgresql://127.0.0.1:5432/bbl_competition_test_20260926 PARALLEL_WORKERS=1 bin/rails test
bin/rubocop --cache false
bundle exec bundle-audit check
```

Directly reviewed models, schema and migrations; no generated data-model tasks exist. Hosted data and physical hardware have not been exercised.

Independent review found an unrelated orphan `posture_snapshots` table in the pre-existing local databases. Final schema verification therefore used a fresh disposable database, `postgresql://127.0.0.1:5432/bbl_competition_test_20260926`, with `PRIMARY_DATABASE_URL` and PostgreSQL environment overrides unset. Ran `ActiveRecord::Base.connection_pool.migration_context.migrate` through `RAILS_ENV=test bin/rails runner` to execute only checkout migrations (Rails' ordinary initial `db:migrate` can preload the existing schema), then `bin/rails db:schema:dump`. The resulting tables are users, devices, and posture_sessions. The full test suite was rerun against this clean database; existing development data was not dropped.
