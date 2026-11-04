# Restore journal observation and pre-displacement recovery

Journal schema 2, runtime layout 3, snapshot inventory/checksums, household
configuration and Family Knowledge formats are unchanged. No migration is needed.

## Ownership and publication

Creation/change/write timestamps are not durable ownership identifiers on Windows.
Journal observations anchor reads to an open regular-file handle and compare
non-zero file identity (`dev`/`ino`), size and exact bytes with the pathname.
Canonical parent location, regular-file and non-link checks remain mandatory.
Receipts bind the operation/transition bytes to that file and parent. Replacing a
file, even with identical bytes, does not transfer an existing receipt.

This addresses timestamp-sensitive rejection; office evidence did not establish
which individual metadata field differed during the original failure.

The same complete, synced, closed temporary is reused by the existing bounded
Windows atomic-rename policy. Only eligible rename failures are retried. After
rename succeeds, verification or directory-flush failure is reported as
`RESTORE_JOURNAL_PUBLICATION_UNCERTAIN`, retaining the original cause. The old
receipt cannot authorize cleanup of a newly published destination. The operation
lock and journal remain for explicit recovery.

No portable filesystem compare-and-swap/delete guarantee is claimed. Stable file
IDs, exact bytes and repeat checks operate within the existing cooperative
exclusive-operation-lock protocol. An uncooperative writer can still race a final
check; the runtime must remain offline and exclusively controlled for recovery.

## Abort cleanup

Pre-destructive cleanup uses the existing durable `abort-cleanup` then
`finalize/aborted` transitions. A non-final journal's lock is not released by
cleanup. Changed, foreign, malformed or uncertain journal state is preserved and
the original operation error remains observable alongside cleanup failure.
Terminal cleanup can be resumed by the existing recovery command.

## Guarded compatibility recovery

Legacy cleanup could leave a valid original runtime with a non-final journal and
no lock. A narrowly guarded abort is available through the existing recovery CLI:

```cmd
node --import tsx src/scripts/recoverRuntimeRestore.ts --root "<runtime>" --backup-root "<backup-root>" --action abort --operation-id <journal-operation-uuid> --confirm-recover --confirm-pre-displacement-abort --journal-sha256 <exact-current-journal-sha256>
```

This is not permission to retry an unknown restore. Establish and retain the
journal bytes, operation ID, selected/protection snapshots and runtime inventory
before invoking it. Stop on any unexpected state. Never delete/edit a journal or
fabricate a lock.

For the lockless path the command requires all of:

- explicit abort confirmation and exact journal SHA-256;
- a valid canonical journal, undecided, valid protected source, real protection
  snapshot, prepare or stage intent (prepare completion is also pre-displacement);
- independently verified selected and protection snapshots;
- valid current runtime matching every protected primary byte;
- selected snapshot preserving canonical household/member identity;
- no staging, displaced or failed-replacement directory and no existing lock.

It proves these conditions, acquires a fresh exclusive restore lock bound to the
retained operation, and proves them again before using ordinary abort/finalize.
It never displaces or publishes runtime data. A changed proof fails closed; a
failure after publication begins may deliberately retain ownership for recovery.

After success independently compare the full runtime inventory (including any
store backups) with the checkpoint: it must be unchanged. Require both journal
and lock to be absent before starting a new restore. A new restore must use the
original independently verified selected snapshot, never replay earlier domain
mutations. Recovery audit records are under the backup root, not runtime data.
