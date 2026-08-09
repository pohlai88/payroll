# Drizzle migration meta

> **This file must stay out of `meta/`.** drizzle-kit `JSON.parse`s every file in
> `meta/`, so a Markdown file there makes *every* `drizzle-kit generate` fail with
> `SyntaxError: Unexpected token '#'` — including the command documented below.
> Drift then becomes undetectable, which is the one thing this directory exists to
> make visible.

## Snapshot coverage

| Range | Status |
|-------|--------|
| `0000`–`0015` | Snapshots present (some intermediate idxs omitted historically) |
| `0016`–`0023` | SQL migrations were authored by hand; **no per-migration snapshots** |
| `0024_snapshot.json` | Reconciled **current** schema after `0024_closure_seals` — use this as the baseline for `drizzle-kit generate` |

Do not re-introduce a catch-up migration that re-creates enums/tables already applied by `0016`–`0024`. That would fail on existing databases.

## Regenerating the tip snapshot

After the DB matches `src/db/schema` and migrations through `0024` are applied:

```bash
npx drizzle-kit generate --name unused_check
```

If kit emits only empty/noop SQL, keep the new snapshot and discard the SQL + journal entry. If it emits CREATE TYPE/TABLE for objects that already exist in `0016`–`0024`, **delete that migration** — the tip snapshot was stale; refresh `0024_snapshot.json` from kit output instead of applying the SQL.
