-------------------------------- MODULE Sync --------------------------------
(***************************************************************************)
(* Cloud sync: how a Play the Coach saves on this device reaches Convex,  *)
(* and how a Play saved on his other device reaches this one.             *)
(*                                                                         *)
(*   packages/sync/src/orchestrator.ts   drain, pull, applyChange, push,  *)
(*                                       resolveConflict                   *)
(*   packages/sync/src/engine.ts         applyPushBatch, applyPullAfter,  *)
(*                                       applyResolveConflict              *)
(*   convex/sync.ts, convex/lib/store.ts pushBatch and resolveConflict    *)
(*                                       run as one Convex mutation each   *)
(*   packages/local-db/src/repository.ts commitPlay, readSyncMutation-    *)
(*     Batch, setPlayCloudHead, applyRemotePlay, scheduleSyncMutation-    *)
(*     Retry, acknowledgeSyncMutations, putConflict                       *)
(*                                                                         *)
(* .agents/skills/verify-sync/SKILL.md maps each action to code and says  *)
(* how to run and update the check.                                       *)
(*                                                                         *)
(* A Play is the set of edits it carries. Each edit is saved with one     *)
(* sync mutation whose id is the edit, so the revision the server makes   *)
(* from it, revision_<idempotencyKey>, is named by the edit too. The      *)
(* other device is always up to date when it pushes, so it never          *)
(* conflicts; it stands for every write this device did not make.         *)
(*                                                                         *)
(* One step is one run of JavaScript between two waits that another actor *)
(* can act in: an IndexedDB request or transaction, or a call to Convex.  *)
(* A Convex mutation or query is one step: Convex runs each one as a      *)
(* serializable transaction, and every push and resolve reads and writes  *)
(* the one syncHeads row, so the change log grows in commit order.        *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    p1, p2,      \* two Plays both devices hold
    a1, a2,      \* the Coach's edits on this device, in the order he makes them
    b1, b2,      \* edits his other device pushes, in order
    r1, r2,      \* the revision each Play starts at, on both devices
    NoDoc,       \* a conflict that does not carry one side's Play
    NoRev,
    NoPlay,
    Rejected,    \* edits whose mutation Convex rejects, such as a Play over MAX_REVISION_BYTES
    OpenPlay,    \* the Play open in the editor, or NoPlay
    \* Assumptions about timing. Each is TRUE in Sync.cfg, and a
    \* Finding*.cfg shows what main does without it.
    EditsWaitForSync,       \* the Coach edits a Play only when it has no mutation queued and no open conflict
    OthersWaitForPush,      \* the other device pushes only when this one is not between its pull and its push
    EditsWaitForCloudHead,  \* no edit lands inside setPlayCloudHead
    EditsWaitForApply,      \* no edit lands while applyChange is writing that Play
    OthersWaitForResolve,   \* the other device leaves a Play alone from a conflict until this device has resolved it
    MaxOtherEdits, \* edits the other device pushes, 1 or 2
    MaxCrashes,    \* times the tab closes or reloads mid-sync
    MaxDrops       \* pushes Convex applies whose answer never arrives

Plays   == {p1, p2}
Order   == <<a1, a2>>
OrderB  == <<b1, b2>>
EditsA  == {a1, a2}
EditsB  == {b1, b2}
Edits   == EditsA \cup EditsB
InitRev == [p \in Plays |-> IF p = p1 THEN r1 ELSE r2]
Revs    == {r1, r2} \cup Edits
Docs    == SUBSET Edits

NoCid == [src |-> "none", rev |-> NoRev]
\* conflict_<idempotencyKey> on the server, createId("conflict") in applyChange
ServerCid(e) == [src |-> "server", rev |-> e]
LocalCid(r)  == [src |-> "local", rev |-> r]

Change(kind, play, rev, cid, local, remote) ==
    [kind |-> kind, play |-> play, rev |-> rev, cid |-> cid,
     local |-> local, remote |-> remote]

VARIABLES
    srv,          \* Convex: head, doc (revisions), log (changes), conflicts, receipt
    locDoc,       \* plays[p].document in IndexedDB on this device
    locCloud,     \* plays[p].cloudRevisionId
    queue,        \* syncMutations
    locConflicts, \* conflicts
    cursor,       \* the sync.cursor.v1 preference, as a sequence number
    editPlay,     \* the Play each edit went into, NoPlay before it is made
    nA,           \* edits the Coach has made on this device
    dropped,      \* edits the Coach gave up by choosing the other version
    handled,      \* change sequence numbers this device applied or wrote itself
    drainQueued,  \* a drain waits on drainTail
    dpc,          \* where the running drain is
    dCursor,      \* the cursor pull read
    page,         \* the changes pullAfter returned
    pIdx,         \* the change applyChange is on
    apply,        \* the Play and revision applyChange will write
    batch,        \* the mutations push sent
    outs,         \* the outcomes pushBatch returned
    oIdx,         \* the outcome push is handling
    acked,        \* acknowledged, waiting for acknowledgeSyncMutations
    pushHead,     \* result.headCursor
    dHead,        \* the plays record setPlayCloudHead read in push
    lastError,    \* the snapshot's lastError
    rpc,          \* where a resolveConflict call is
    rConf,        \* the conflict it resolves
    rChoice,      \* "local" or "remote"
    rHead,        \* the plays record setPlayCloudHead read in resolveConflict
    crashes,
    drops

srvVars   == <<srv>>
localVars == <<locDoc, locCloud, queue, locConflicts, cursor>>
ghostVars == <<editPlay, nA, dropped, handled>>
drainVars == <<drainQueued, dpc, dCursor, page, pIdx, apply, batch, outs,
               oIdx, acked, pushHead, dHead, lastError>>
resVars   == <<rpc, rConf, rChoice, rHead>>
vars == <<srvVars, localVars, ghostVars, drainVars, resVars, crashes, drops>>

NoHead == [play |-> NoPlay, rev |-> NoRev, doc |-> {}, cloud |-> NoRev]
NoApply == [play |-> NoPlay, rev |-> NoRev]
NoConflict == [id |-> NoCid, play |-> NoPlay, localRev |-> NoRev,
               remoteRev |-> NoRev, localDoc |-> NoDoc, remoteDoc |-> NoDoc,
               resolved |-> TRUE]

-----------------------------------------------------------------------------
(* Convex                                                                  *)

NoReceipt == [status |-> "none", remote |-> NoRev]

\* applyOneMutation for a Play put, inside one pushBatch mutation.
PushOne(s, m) ==
    LET rc == s.receipt[m.id] IN
    CASE rc.status = "applied" ->
            [srv |-> s, out |-> [status |-> "duplicate", rev |-> m.id, remote |-> NoRev]]
      [] rc.status = "conflict" ->
            [srv |-> s, out |-> [status |-> "conflict", rev |-> m.id, remote |-> rc.remote]]
      [] rc.status = "rejected" ->
            [srv |-> s, out |-> [status |-> "rejected", rev |-> NoRev, remote |-> NoRev]]
      [] m.id \in Rejected ->
            [srv |-> [s EXCEPT !.receipt[m.id] = [status |-> "rejected", remote |-> NoRev]],
             out |-> [status |-> "rejected", rev |-> NoRev, remote |-> NoRev]]
      [] s.head[m.play] # m.base ->
            LET remote == s.head[m.play] IN
            [srv |-> [s EXCEPT
                        !.doc[m.id] = m.doc,
                        !.conflicts = @ \cup {[id |-> ServerCid(m.id), play |-> m.play,
                                               local |-> m.id, remote |-> remote,
                                               resolved |-> FALSE]},
                        !.log = Append(@, Change("conflict", m.play, m.id,
                                                 ServerCid(m.id), m.id, remote)),
                        !.receipt[m.id] = [status |-> "conflict", remote |-> remote]],
             out |-> [status |-> "conflict", rev |-> m.id, remote |-> remote]]
      [] OTHER ->
            [srv |-> [s EXCEPT
                        !.doc[m.id] = m.doc,
                        !.head[m.play] = m.id,
                        !.log = Append(@, Change("revision", m.play, m.id, NoCid, NoRev, NoRev)),
                        !.receipt[m.id] = [status |-> "applied", remote |-> NoRev],
                        !.landed = @ \cup m.doc],
             out |-> [status |-> "applied", rev |-> m.id, remote |-> NoRev]]

RECURSIVE PushAll(_, _, _)
PushAll(s, ms, os) ==
    IF ms = <<>> THEN [srv |-> s, outs |-> os]
    ELSE LET r == PushOne(s, Head(ms)) IN PushAll(r.srv, Tail(ms), Append(os, r.out))

\* applyResolveConflict for a conflict Convex holds. "local" makes the
\* conflict's local revision the head, whatever the head is by then. The
\* Coach gives up what the other version he was shown has and his lacks.
ResolveOnServer(s, c, choice) ==
    IF c.resolved THEN s
    ELSE LET done == [c EXCEPT !.resolved = TRUE]
             others == s.conflicts \ {c}
             marked == Change("resolved", c.play, NoRev, c.id, NoRev, NoRev)
         IN IF choice = "local"
            THEN [s EXCEPT !.head[c.play] = c.local,
                           !.conflicts = others \cup {done},
                           !.log = (@ \o <<marked,
                                    Change("revision", c.play, c.local, NoCid, NoRev, NoRev)>>),
                           !.landed = @ \cup s.doc[c.local],
                           !.given = @ \cup (s.doc[c.remote] \ s.doc[c.local])]
            ELSE [s EXCEPT !.conflicts = others \cup {done},
                           !.log = Append(@, marked)]

-----------------------------------------------------------------------------
(* This device                                                             *)

Ready(q) == {m \in q : m.ready}

\* readSyncMutationBatch: the mutations past their backoff, oldest first.
BatchOf(q) ==
    LET ids == SelectSeq(Order, LAMBDA e : \E m \in Ready(q) : m.id = e)
    IN [i \in 1..Len(ids) |-> CHOOSE m \in q : m.id = ids[i]]

\* putConflict replaces the record with the same id.
PutConflict(cs, c) == {x \in cs : x.id # c.id} \cup {c}

Unresolved == {c \in locConflicts : ~c.resolved}

Init ==
    /\ srv = [head |-> InitRev,
              doc |-> [r \in Revs |-> {}],
              log |-> <<>>,
              conflicts |-> {},
              receipt |-> [e \in EditsA |-> NoReceipt],
              landed |-> {},
              given |-> {}]
    /\ locDoc = [p \in Plays |-> {}]
    /\ locCloud = InitRev
    /\ queue = {}
    /\ locConflicts = {}
    /\ cursor = 0
    /\ editPlay = [e \in Edits |-> NoPlay]
    /\ nA = 0
    /\ dropped = {}
    /\ handled = {}
    /\ drainQueued = TRUE
    /\ dpc = "idle"
    /\ dCursor = 0
    /\ page = <<>>
    /\ pIdx = 1
    /\ apply = NoApply
    /\ batch = <<>>
    /\ outs = <<>>
    /\ oIdx = 1
    /\ acked = {}
    /\ pushHead = 0
    /\ dHead = NoHead
    /\ lastError = "none"
    /\ rpc = "idle"
    /\ rConf = NoConflict
    /\ rChoice = "none"
    /\ rHead = NoHead
    /\ crashes = 0
    /\ drops = 0

-----------------------------------------------------------------------------
(* The Coach and the other device                                         *)

\* The editor's persist, or renamePlay from the Playbooks page: one
\* commitPlay transaction writes the Play and queues a mutation whose base is
\* the stored cloudRevisionId. notifyLocalEdit queues a drain. The Conflict
\* Inbox covers the editor, so no edit lands while a resolution runs.
CoachEdits(p) ==
    /\ nA < Len(Order)
    /\ rpc = "idle"
    /\ EditsWaitForSync => /\ ~\E m \in queue : m.play = p
                           /\ ~\E c \in Unresolved : c.play = p
    /\ EditsWaitForCloudHead => ~(dpc = "cloudWrite" /\ dHead.play = p)
    /\ EditsWaitForApply => ~(dpc = "applyWrite" /\ apply.play = p)
    /\ LET e == Order[nA + 1] IN
       /\ locDoc' = [locDoc EXCEPT ![p] = @ \cup {e}]
       /\ queue' = queue \cup {[id |-> e, play |-> p, base |-> locCloud[p],
                                doc |-> locDoc[p] \cup {e}, ready |-> TRUE]}
       /\ editPlay' = [editPlay EXCEPT ![e] = p]
       /\ nA' = nA + 1
    /\ drainQueued' = TRUE
    /\ UNCHANGED <<srv, locCloud, locConflicts, cursor, dropped, handled,
                   dpc, dCursor, page, pIdx, apply, batch, outs, oIdx, acked,
                   pushHead, dHead, lastError, resVars, crashes, drops>>

\* The other device pushes an edit on top of the server's head. The head
\* watcher in clerk-session.tsx queues a drain here.
OtherDevicePushes(p) ==
    LET nB == Cardinality({x \in EditsB : editPlay[x] # NoPlay})
        b  == OrderB[nB + 1]
        d  == srv.doc[srv.head[p]] \cup {b}
    IN
    /\ nB < MaxOtherEdits
    /\ OthersWaitForPush => dpc \notin {"apply", "applyWrite", "pushRead", "send"}
    /\ OthersWaitForResolve => /\ ~\E s \in srv.conflicts : s.play = p /\ ~s.resolved
                               /\ ~(rpc # "idle" /\ rConf.play = p)
    /\ srv' = [srv EXCEPT !.doc[b] = d,
                          !.head[p] = b,
                          !.log = Append(@, Change("revision", p, b, NoCid, NoRev, NoRev)),
                          !.landed = @ \cup d]
    /\ editPlay' = [editPlay EXCEPT ![b] = p]
    /\ drainQueued' = TRUE
    /\ UNCHANGED <<localVars, nA, dropped, handled, dpc, dCursor, page, pIdx,
                   apply, batch, outs, oIdx, acked, pushHead, dHead, lastError,
                   resVars, crashes, drops>>

\* nextAttemptAtMs passes. Nothing queues a drain when it does.
BackoffEnds(m) ==
    /\ m \in queue
    /\ ~m.ready
    /\ queue' = (queue \ {m}) \cup {[m EXCEPT !.ready = TRUE]}
    /\ UNCHANGED <<srv, locDoc, locCloud, locConflicts, cursor, ghostVars,
                   drainVars, resVars, crashes, drops>>

BackoffEndsOne == \E m \in queue : BackoffEnds(m)

\* The "online" or "focus" event after a push that failed. Each queues a
\* drain; nothing else retries a failed push.
Wake ==
    /\ dpc = "idle"
    /\ ~drainQueued
    /\ lastError = "offline"
    /\ drainQueued' = TRUE
    /\ UNCHANGED <<srvVars, localVars, ghostVars, dpc, dCursor, page, pIdx,
                   apply, batch, outs, oIdx, acked, pushHead, dHead, lastError,
                   resVars, crashes, drops>>

\* The tab closes or reloads. IndexedDB and Convex keep what they hold;
\* start() queues a drain on the next boot.
Crash ==
    /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    /\ drainQueued' = TRUE
    /\ dpc' = "idle"
    /\ dCursor' = 0
    /\ page' = <<>>
    /\ pIdx' = 1
    /\ apply' = NoApply
    /\ batch' = <<>>
    /\ outs' = <<>>
    /\ oIdx' = 1
    /\ acked' = {}
    /\ pushHead' = 0
    /\ dHead' = NoHead
    /\ lastError' = "none"
    /\ rpc' = "idle"
    /\ rConf' = NoConflict
    /\ rChoice' = "none"
    /\ rHead' = NoHead
    /\ UNCHANGED <<srvVars, localVars, ghostVars, drops>>

-----------------------------------------------------------------------------
(* drain                                                                   *)

DrainUnchanged == UNCHANGED <<ghostVars, resVars, crashes, drops>>

\* queueDrain's turn comes: setStatus("syncing") clears lastError, and pull
\* reads the stored cursor.
DrainStart ==
    /\ dpc = "idle"
    /\ drainQueued
    /\ drainQueued' = FALSE
    /\ dCursor' = cursor
    /\ lastError' = "none"
    /\ dpc' = "pull"
    /\ UNCHANGED <<srvVars, localVars, page, pIdx, apply, batch, outs, oIdx,
                   acked, pushHead, dHead>>
    /\ DrainUnchanged

\* replica.pullAfter: one Convex query reads every change after the cursor.
Pull ==
    /\ dpc = "pull"
    /\ page' = SubSeq(srv.log, dCursor + 1, Len(srv.log))
    /\ pIdx' = 1
    /\ dpc' = "apply"
    /\ UNCHANGED <<srvVars, localVars, drainQueued, dCursor, apply, batch,
                   outs, oIdx, acked, pushHead, dHead, lastError>>
    /\ DrainUnchanged

Seen(i) == handled' = handled \cup {dCursor + i}

\* applyChange for one change, up to its first write.
ApplyChange ==
    /\ dpc = "apply"
    /\ pIdx <= Len(page)
    /\ LET ch == page[pIdx] IN
       CASE ch.kind = "resolved" ->
              /\ locConflicts' = {IF c.id = ch.cid /\ ~c.resolved
                                  THEN [c EXCEPT !.resolved = TRUE] ELSE c
                                  : c \in locConflicts}
              /\ Seen(pIdx)
              /\ pIdx' = pIdx + 1
              /\ UNCHANGED <<locDoc, locCloud, dpc, apply>>
         [] ch.kind = "conflict" ->
              \* recordConflict from the change's payload
              /\ locConflicts' = PutConflict(locConflicts,
                    [id |-> ch.cid, play |-> ch.play, localRev |-> ch.local,
                     remoteRev |-> ch.remote, localDoc |-> srv.doc[ch.local],
                     remoteDoc |-> srv.doc[ch.remote], resolved |-> FALSE])
              /\ Seen(pIdx)
              /\ pIdx' = pIdx + 1
              /\ UNCHANGED <<locDoc, locCloud, dpc, apply>>
         [] OTHER ->
              \* a revision: currentPlayId, then readSyncMutationBatch
              IF \E m \in Ready(queue) : m.play = ch.play
              THEN /\ Seen(pIdx)
                   /\ pIdx' = pIdx + 1
                   /\ UNCHANGED <<locDoc, locCloud, locConflicts, dpc, apply>>
              ELSE IF OpenPlay = ch.play
              THEN \* recordConflict with a new id and no remote Play
                   /\ locConflicts' = PutConflict(locConflicts,
                         [id |-> LocalCid(ch.rev), play |-> ch.play,
                          localRev |-> locCloud[ch.play], remoteRev |-> ch.rev,
                          localDoc |-> locDoc[ch.play], remoteDoc |-> NoDoc,
                          resolved |-> FALSE])
                   /\ Seen(pIdx)
                   /\ pIdx' = pIdx + 1
                   /\ UNCHANGED <<locDoc, locCloud, dpc, apply>>
              ELSE /\ apply' = [play |-> ch.play, rev |-> ch.rev]
                   /\ dpc' = "applyWrite"
                   /\ UNCHANGED <<locDoc, locCloud, locConflicts, handled, pIdx>>
    /\ UNCHANGED <<srvVars, queue, cursor, drainQueued, dCursor, page, batch,
                   outs, oIdx, acked, pushHead, dHead, lastError>>
    /\ UNCHANGED <<editPlay, nA, dropped, resVars, crashes, drops>>

\* replica.getRevision, then applyRemotePlay's transaction.
ApplyWrite ==
    /\ dpc = "applyWrite"
    /\ locDoc' = [locDoc EXCEPT ![apply.play] = srv.doc[apply.rev]]
    /\ locCloud' = [locCloud EXCEPT ![apply.play] = apply.rev]
    /\ Seen(pIdx)
    /\ pIdx' = pIdx + 1
    /\ apply' = NoApply
    /\ dpc' = "apply"
    /\ UNCHANGED <<srvVars, queue, locConflicts, cursor, drainQueued, dCursor,
                   page, batch, outs, oIdx, acked, pushHead, dHead, lastError>>
    /\ UNCHANGED <<editPlay, nA, dropped, resVars, crashes, drops>>

\* writeCursor(page.nextCursor), then push reads its batch.
PullDone ==
    /\ dpc = "apply"
    /\ pIdx > Len(page)
    /\ cursor' = dCursor + Len(page)
    /\ dpc' = "pushRead"
    /\ UNCHANGED <<srvVars, locDoc, locCloud, queue, locConflicts,
                   drainQueued, dCursor, page, pIdx, apply, batch, outs, oIdx,
                   acked, pushHead, dHead, lastError>>
    /\ DrainUnchanged

\* readSyncMutationBatch. An empty batch returns before writeCursor.
PushRead ==
    /\ dpc = "pushRead"
    /\ batch' = BatchOf(queue)
    /\ dpc' = IF BatchOf(queue) = <<>> THEN "finish" ELSE "send"
    /\ UNCHANGED <<srvVars, localVars, drainQueued, dCursor, page, pIdx,
                   apply, outs, oIdx, acked, pushHead, dHead, lastError>>
    /\ DrainUnchanged

\* replica.pushBatch: one Convex mutation applies the whole batch.
PushSend ==
    /\ dpc = "send"
    /\ LET r == PushAll(srv, batch, <<>>) IN
       /\ srv' = r.srv
       /\ \/ /\ outs' = r.outs
             /\ oIdx' = 1
             /\ pushHead' = Len(r.srv.log)
             \* the changes this push wrote
             /\ handled' = handled \cup ((Len(srv.log) + 1)..Len(r.srv.log))
             /\ dpc' = "outcome"
             /\ UNCHANGED <<lastError, drops, batch, page, dCursor>>
          \/ \* Convex applied it, but the answer is lost: drain's catch
             \* sets "offline" and queues nothing.
             /\ drops < MaxDrops
             /\ drops' = drops + 1
             /\ lastError' = "offline"
             /\ dpc' = "idle"
             /\ batch' = <<>>
             /\ page' = <<>>
             /\ dCursor' = 0
             /\ UNCHANGED <<outs, oIdx, pushHead, handled>>
    /\ UNCHANGED <<localVars, drainQueued, pIdx, apply, acked, dHead>>
    /\ UNCHANGED <<editPlay, nA, dropped, resVars, crashes>>

\* push's loop over result.outcomes, up to the first write for each.
Outcome ==
    /\ dpc = "outcome"
    /\ oIdx <= Len(outs)
    /\ LET o == outs[oIdx]
           m == batch[oIdx]
       IN CASE o.status \in {"applied", "duplicate"} ->
                 \* setPlayCloudHead's plays.get, outside any transaction
                 /\ acked' = acked \cup {m.id}
                 /\ dHead' = [play |-> m.play, rev |-> o.rev,
                              doc |-> locDoc[m.play], cloud |-> locCloud[m.play]]
                 /\ dpc' = "cloudWrite"
                 /\ UNCHANGED <<queue, locConflicts, oIdx, lastError>>
            [] o.status = "conflict" ->
                 \* getPlay, then recordConflict
                 /\ acked' = acked \cup {m.id}
                 /\ locConflicts' = PutConflict(locConflicts,
                       [id |-> ServerCid(m.id), play |-> m.play,
                        localRev |-> m.id, remoteRev |-> o.remote,
                        localDoc |-> locDoc[m.play],
                        remoteDoc |-> srv.doc[o.remote], resolved |-> FALSE])
                 /\ oIdx' = oIdx + 1
                 /\ UNCHANGED <<queue, dHead, dpc, lastError>>
            [] OTHER ->
                 \* scheduleSyncMutationRetry, then lastError = outcome.reason
                 /\ queue' = {IF x.id = m.id THEN [x EXCEPT !.ready = FALSE] ELSE x
                              : x \in queue}
                 /\ lastError' = "rejected"
                 /\ oIdx' = oIdx + 1
                 /\ UNCHANGED <<acked, locConflicts, dHead, dpc>>
    /\ UNCHANGED <<srvVars, locDoc, locCloud, cursor, drainQueued, dCursor,
                   page, pIdx, apply, batch, outs, pushHead>>
    /\ DrainUnchanged

\* setPlayCloudHead's plays.put({...existing, cloudRevisionId}).
CloudWrite ==
    /\ dpc = "cloudWrite"
    /\ locDoc' = [locDoc EXCEPT ![dHead.play] = dHead.doc]
    /\ locCloud' = [locCloud EXCEPT ![dHead.play] = dHead.rev]
    /\ oIdx' = oIdx + 1
    /\ dHead' = NoHead
    /\ dpc' = "outcome"
    /\ UNCHANGED <<srvVars, queue, locConflicts, cursor, drainQueued, dCursor,
                   page, pIdx, apply, batch, outs, acked, pushHead, lastError>>
    /\ DrainUnchanged

\* acknowledgeSyncMutations deletes the acknowledged mutations by id.
Acknowledge ==
    /\ dpc = "outcome"
    /\ oIdx > Len(outs)
    /\ queue' = {m \in queue : m.id \notin acked}
    /\ acked' = {}
    /\ dpc' = "cursor"
    /\ UNCHANGED <<srvVars, locDoc, locCloud, locConflicts, cursor,
                   drainQueued, dCursor, page, pIdx, apply, batch, outs, oIdx,
                   pushHead, dHead, lastError>>
    /\ DrainUnchanged

\* writeCursor(result.headCursor).
PushCursor ==
    /\ dpc = "cursor"
    /\ cursor' = pushHead
    /\ dpc' = "finish"
    /\ UNCHANGED <<srvVars, locDoc, locCloud, queue, locConflicts,
                   drainQueued, dCursor, page, pIdx, apply, batch, outs, oIdx,
                   acked, pushHead, dHead, lastError>>
    /\ DrainUnchanged

\* refreshCounts, setStatus (which clears lastError), and the drain that
\* queues itself again while pendingCount > 0 and there is no conflict.
DrainEnd ==
    /\ dpc = "finish"
    /\ lastError' = "none"
    /\ drainQueued' = (drainQueued \/ (queue # {} /\ Unresolved = {}))
    /\ dpc' = "idle"
    /\ page' = <<>>
    /\ pIdx' = 1
    /\ batch' = <<>>
    /\ outs' = <<>>
    /\ oIdx' = 1
    /\ pushHead' = 0
    /\ dCursor' = 0
    /\ UNCHANGED <<srvVars, localVars, apply, acked, dHead>>
    /\ DrainUnchanged

-----------------------------------------------------------------------------
(* resolveConflict from the Conflict Inbox                                 *)

ResUnchanged == UNCHANGED <<drainVars, crashes, drops>>

\* The Coach presses "Use this device's version" or "Use the other
\* version". Each button is disabled while its side's Play is missing.
CoachResolves(c, choice) ==
    /\ rpc = "idle"
    /\ c \in Unresolved
    /\ choice = "local" => c.localDoc # NoDoc
    /\ choice = "remote" => c.remoteDoc # NoDoc
    /\ rConf' = c
    /\ rChoice' = choice
    /\ rpc' = "send"
    \* "Use the other version" gives up what his side has and theirs lacks.
    /\ dropped' = IF choice = "remote" THEN dropped \cup (c.localDoc \ c.remoteDoc)
                  ELSE dropped
    /\ UNCHANGED <<srvVars, localVars, editPlay, nA, handled, rHead>>
    /\ ResUnchanged

CoachResolvesOne ==
    \E c \in locConflicts : \E choice \in {"local", "remote"} : CoachResolves(c, choice)

\* replica.resolveConflict. Convex throws "Conflict not found" for an id it
\* never made, and the call ends there.
ResolveSend ==
    /\ rpc = "send"
    /\ IF \E s \in srv.conflicts : s.id = rConf.id
       THEN LET s2 == ResolveOnServer(srv,
                         CHOOSE s \in srv.conflicts : s.id = rConf.id, rChoice)
            IN /\ srv' = s2
               \* resolveConflict applies its own choice, so the changes it
               \* wrote count as this device's
               /\ handled' = handled \cup ((Len(srv.log) + 1)..Len(s2.log))
               /\ rpc' = "apply"
               /\ UNCHANGED <<rConf, rChoice>>
       ELSE /\ rpc' = "idle"
            /\ rConf' = NoConflict
            /\ rChoice' = "none"
            /\ UNCHANGED <<srv, handled>>
    /\ UNCHANGED <<localVars, editPlay, nA, dropped, rHead>>
    /\ ResUnchanged

\* "remote": applyRemotePlay's transaction. "local": setPlayCloudHead's
\* plays.get.
ResolveApply ==
    /\ rpc = "apply"
    /\ IF rChoice = "remote"
       THEN /\ dropped' = dropped \cup (locDoc[rConf.play] \ rConf.remoteDoc)
            /\ locDoc' = [locDoc EXCEPT ![rConf.play] = rConf.remoteDoc]
            /\ locCloud' = [locCloud EXCEPT ![rConf.play] = rConf.remoteRev]
            /\ rpc' = "mark"
            /\ UNCHANGED rHead
       ELSE /\ rHead' = [play |-> rConf.play, rev |-> rConf.localRev,
                         doc |-> locDoc[rConf.play], cloud |-> locCloud[rConf.play]]
            /\ rpc' = "cloudWrite"
            /\ UNCHANGED <<locDoc, locCloud, dropped>>
    /\ UNCHANGED <<srvVars, queue, locConflicts, cursor, editPlay, nA, handled,
                   rConf, rChoice>>
    /\ ResUnchanged

\* setPlayCloudHead's plays.put in resolveConflict.
ResolveCloudWrite ==
    /\ rpc = "cloudWrite"
    /\ locDoc' = [locDoc EXCEPT ![rHead.play] = rHead.doc]
    /\ locCloud' = [locCloud EXCEPT ![rHead.play] = rHead.rev]
    /\ rHead' = NoHead
    /\ rpc' = "mark"
    /\ UNCHANGED <<srvVars, queue, locConflicts, cursor, ghostVars, rConf, rChoice>>
    /\ ResUnchanged

\* putConflict({...conflict, status: "resolved"}), then queueDrain.
ResolveMark ==
    /\ rpc = "mark"
    /\ locConflicts' = PutConflict(locConflicts, [rConf EXCEPT !.resolved = TRUE])
    /\ drainQueued' = TRUE
    /\ rpc' = "idle"
    /\ rConf' = NoConflict
    /\ rChoice' = "none"
    /\ UNCHANGED <<srvVars, locDoc, locCloud, queue, cursor, ghostVars, rHead>>
    /\ UNCHANGED <<dpc, dCursor, page, pIdx, apply, batch, outs, oIdx, acked,
                   pushHead, dHead, lastError, crashes, drops>>

-----------------------------------------------------------------------------

DrainStep ==
    \/ DrainStart \/ Pull \/ ApplyChange \/ ApplyWrite \/ PullDone
    \/ PushRead \/ PushSend \/ Outcome \/ CloudWrite \/ Acknowledge
    \/ PushCursor \/ DrainEnd

ResolveStep == ResolveSend \/ ResolveApply \/ ResolveCloudWrite \/ ResolveMark

\* Nothing left to run. It keeps TLC from reporting the end as a deadlock.
Finished ==
    /\ dpc = "idle" /\ ~drainQueued /\ rpc = "idle"
    /\ UNCHANGED vars

Next ==
    \/ \E p \in Plays : CoachEdits(p) \/ OtherDevicePushes(p)
    \/ BackoffEndsOne
    \/ CoachResolvesOne
    \/ Wake
    \/ Crash
    \/ DrainStep
    \/ ResolveStep
    \/ Finished

Spec ==
    /\ Init
    /\ [][Next]_vars
    /\ WF_vars(DrainStep)
    /\ WF_vars(ResolveStep)
    /\ WF_vars(BackoffEndsOne)

-----------------------------------------------------------------------------
(* What sync promises                                                      *)

TypeOK ==
    /\ locDoc \in [Plays -> Docs]
    /\ locCloud \in [Plays -> Revs]
    /\ cursor \in 0..Len(srv.log)
    /\ dpc \in {"idle", "pull", "apply", "applyWrite", "pushRead", "send",
                "outcome", "cloudWrite", "cursor", "finish"}
    /\ rpc \in {"idle", "send", "apply", "cloudWrite", "mark"}
    /\ lastError \in {"none", "rejected", "offline"}

\* Every edit the Coach saved on this device is still in its Play there, or
\* in a conflict the Conflict Inbox shows, unless he chose the other version.
NoEditLost ==
    \A e \in EditsA :
        (editPlay[e] # NoPlay /\ e \notin dropped) =>
            \/ e \in locDoc[editPlay[e]]
            \/ \E c \in Unresolved : c.localDoc # NoDoc /\ e \in c.localDoc

\* The cursor never passes another device's revision of a Play unless this
\* device applied it or a later change it handled for that Play: a newer
\* revision, or a conflict that carries the head as its remote side.
NoChangeSkipped ==
    \A i \in 1..cursor :
        srv.log[i].kind = "revision" =>
            \E j \in handled : j >= i /\ srv.log[j].play = srv.log[i].play

\* An edit that reached a Play's head on Convex stays in it, unless the
\* Coach gave it up when he resolved a conflict.
NoPushedEditLost ==
    \A e \in srv.landed \ srv.given : e \in srv.doc[srv.head[editPlay[e]]]

\* Convex records a conflict only against another device's revision.
NoConflictWithSelf ==
    \A s \in srv.conflicts : s.remote \notin EditsA

\* Every conflict in the Conflict Inbox is one Convex can resolve.
InboxConflictsKnownToServer ==
    \A c \in Unresolved : \E s \in srv.conflicts : s.id = c.id

\* Once sync has nothing left to do, each Play here is the server's head.
Quiet ==
    /\ dpc = "idle" /\ ~drainQueued /\ rpc = "idle"
    /\ queue = {} /\ Unresolved = {}
    /\ cursor = Len(srv.log)

QuietMeansInSync ==
    Quiet => \A p \in Plays : locDoc[p] = srv.doc[srv.head[p]]

\* While a mutation waits on its retry, the snapshot carries Convex's reason.
RetryReasonShown ==
    (dpc = "idle" /\ \E m \in queue : srv.receipt[m.id].status = "rejected")
        => lastError # "none"

\* Sync stops draining once the Coach and his other device stop.
DrainSettles == <>[](dpc = "idle" /\ ~drainQueued)

=============================================================================
