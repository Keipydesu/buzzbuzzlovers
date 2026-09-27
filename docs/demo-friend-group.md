# Demo friend group

Group: **Slouch boys**

Invite code: **POSEFRIENDS1**

Local invite link: <http://localhost:3000/groups/join/POSEFRIENDS1>

Sign in with your own account, open the invite link, and confirm joining. You can
also enter the code in **Join friends**. The seed does not join your account
automatically or modify your wearable readings.

## Demo participants

All three participants and their tracking history are synthetic.

| Username | Current slouch share | Previous week | Tracked per sample session |
| --- | --- | --- | --- |
| `ava` | 5% | 8% | 60 minutes |
| `ben` | 10% | 15% | 60 minutes |
| `cam` | 15% | 16% | 60 minutes |

The initial seed creates one ended session today and one seven days earlier for
each participant, with canonical sessions and accepted snapshot history written
through the normal ingestion service. Ben has the greatest improvement: five
percentage points. Demo accounts receive random passwords that are not exposed;
use your own account to join and inspect the rankings.

## Seed again

Run `bin/rails db:seed` after preparing your local development database. Development
loads synthetic samples by default; set `POSE_DEMO_SEED=0` to skip them (including
during `db:setup`). Tests require `POSE_DEMO_SEED=1`. The helper permits only local
PostgreSQL in development/test, even when explicitly enabled. Production has no
required seeds and skips by default.

Run against the same local database as your app with an explicit local connection:


```sh
env -u PRIMARY_DATABASE_URL -u PGHOST -u PGSERVICE -u PGSERVICEFILE -u PGDATABASE -u PGUSER -u PGPASSWORD SKIP_DOTENV=1 RAILS_ENV=development DATABASE_URL=postgresql://127.0.0.1:5432/buzzbuzzlovers_development POSE_DEMO_SEED=1 bin/rails db:seed
```

Repeating on the same date does not duplicate accounts, memberships, sessions,
or snapshots. Running on a later date adds new sample sessions; existing samples
remain, so cumulative weekly rankings may differ from the initial table above.

Implementation: [seed helper](../lib/demo_friend_group.rb).
