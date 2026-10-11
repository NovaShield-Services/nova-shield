# Field work snapshot v1 — Batch 9.2

This contract describes the client storage and existing API boundary at the
Codex Batch 9.2 implementation. It adds no server RPC, database table or write
type. Stock operations contract v1 is separate and is not implemented here.

## Authority and preparation

The field router retains the current `getSession()`/`isAdmin` gate. Preparation
reads today's/upcoming visits through `api.js`, then reads each selected job
through its existing RLS-protected API. The first 20 distinct visits are saved;
truncation is explicit. Each job must return its requested ID. All required
reads must succeed before a complete snapshot replaces an earlier one.

The current Codex backend is admin-only; these reads are **not proof of
per-crew assignment filtering**. When Claude's crew policies are integrated,
these same reads must return only authorized work. No client crew selector,
invented assignment RPC or substitute authorization policy is introduced.

The offline account namespace remembers the most recent local session ID.
It does not authenticate a new login or establish current permission. An
offline SDK refresh failure is not interpreted as explicit logout. With
the real pinned SDK, remembered identity must still match its persisted
session user; cleared auth storage cannot leave a separate offline login.
The shared field identity helper also retires snapshots on desktop logout.
On reconnection, the normal authorization gate and target job reads run again.
RLS/server write guards remain authoritative.

## Read snapshot

IndexedDB `ns-field-work`, version 1:

```js
// accounts, keyPath: id
{
  id: 'auth-user-id', version: 1, savedAt: 0,
  today: [/* existing listTodaysVisits rows */],
  upcoming: [/* existing listUpcomingVisits rows */],
  refs: { services: [], modifiers: [], siteFactors: [],
    flags: [], flagMap: [], settings: {} },
  jobs: {
    'job-id': { job: {}, sections: [], measurements: [],
      notes: [], attachments: [], quotes: [] }
  }
}
```

Sources are existing `getJob`, `listSections`, `listMeasurements`, `listNotes`,
`listAttachments`, `listQuotes`, and reference-read wrappers. Prices are never
calculated locally. Saved quote references are not offered as a current price
or accepted offline after restart.

Snapshots expire for offline reading after 24 hours. A future timestamp or
invalid version also blocks offline reading. All account snapshots together
are limited to 10 MiB; older other-account snapshots may be evicted. Queued
actions and drafts are never evicted to make room for read snapshots.

The saved-work banner gives the preparation time and limitations. Offline
routes display addresses, access/passport facts, notes and measurements.
Uncached jobs display unavailable. Existing server photos are metadata only;
their preview needs a connection. Pending captured photos use durable local
Blob bytes and an explicitly unsynced preview.

## Drafts

The same database has `drafts`, keyed by `[accountId, jobId, kind]`. Note drafts
store body and visibility. Passport drafts use named field keys, not DOM order.
Drafts are bounded to 200 records and 100 KB each. Storage failures are shown;
the UI does not claim success before transaction completion.

Notes remain outside the four-type outbox. Offline typing saves an unsent draft;
the online Save note action remains explicit. Submitted content clears its
draft only when newer typing has not replaced it. Logout deletes the account's
read snapshot and hides private controls, while retaining its drafts and
queued payloads for that account's next login.
Sign-out requires a connection. A failed SDK sign-out preserves the current
session and reports failure, rather than falsely announcing logout.

## Existing outbox migration and replay

`ns-field-outbox` remains the only outbox. Version 1 → 2 adds an `ownerId` index
to the existing `queue` store. Existing record IDs, arguments, timestamps and
Blob bytes remain intact. Legacy records lacking an owner are quarantined:
they do not replay, are never automatically claimed by the next login, and
their private labels/payloads are not exposed in another account's UI.
They require separate owner-reviewed recovery; generic discard remains an
explicit confirmed action, not an automatic migration.

New record metadata:

```js
{
  id: 1, ownerId: 'auth-user-id', jobId: 'job-id',
  type: 'updateProperty', args: {}, label: 'Save Property Passport',
  createdAt: 0, payloadBytes: 0,
  state: 'pending', // pending | sending | uncertain
  basePassport: {}, // property edits only
  lastError: null, attemptedAt: null,
  uploadPath: null // a successfully uploaded signature only
}
```

New saves enforce 200 actions and 50 MiB of payload bytes, including legacy
records whose sizes are calculated on read without rewriting their payloads.
An older queue already over either limit is retained intact and refuses new
saves until existing actions have been reviewed.

The four write types remain `updateProperty`, `createMeasurement`,
`uploadJobPhoto`, and `saveSignature`, using the existing API wrappers. The
complete payload commits before network I/O, including immediate online writes.
Later online writes join the same order instead of overtaking pending writes.
Callers may supply `{ownerId, jobId, basePassport}` as local scope metadata;
production field controls capture their starting owner. A changed account
cannot take ownership of a delayed old-screen action or draft.

Replay acquires the origin's `ns-field-outbox-replay` Web Lock, including across
tabs. Unsupported sync locking fails closed. Discard/retry state changes also
cannot race a replay in another tab. Current target `getJob` reads precede
job-linked writes; property/job membership is checked too. Permission denial
retains the action and invalidates the read snapshot.

Passport edits use a three-way merge of the saved baseline, requested edits
and current server passport. Unrelated server fields survive. Differently
changed fields stop replay with a conflict rather than being overwritten.
There is no server compare-and-swap contract here, so a simultaneous server
edit after that read remains an integration limitation.

An interrupted `sending` record or lost append/upload response becomes
uncertain. Automatic replay stops. Online Review and retry warns that the
server may already have received it and asks for explicit confirmation.
There is **no exactly-once guarantee** for these pre-existing server APIs.
Property network retries can repeat a patch; persisted baseline conflict
checking applies where available.

Signature replay verifies the quote belongs to the current job and awaits
a signature, retains the successful upload path, and checks for that same
path/signer on the server before repeating acceptance. Fresh acceptance after
a cached restart requires a connection and the existing current quote screen.

## Qualification boundaries

The fixtures in `tests/offline-work-fixture.mjs` supply existing API shapes and
block live requests. Browser tests exercise real IndexedDB, Web Locks, Blob
storage, rendered controls and actual Chromium process restart. One case uses
the actual pinned Supabase SDK with an expired offline access token.

Local HTTP supplies packaged assets during browser offline simulations. This
does not establish an ordinary website's offline shell, a service worker, an
offline basemap, native Android process behavior or permanent storage retention.
`navigator.storage.persist()` is requested on explicit preparation; denial is
reported and never prevents an honest successful current write.

Offline revocation cannot be discovered immediately. The 24-hour limit bounds
cached access; online checks invalidate denied snapshots. Device/browser data
clearing or eviction can still remove IndexedDB. Native SQLite was evaluated
but not adopted without a verified SDK/device and a migration design preserving
the existing outbox. Android restart/eviction and crew RLS qualification remain
separate integration/device checks.
