----------------------------- MODULE SaveQueue -----------------------------
(***************************************************************************)
(* The editor's save queue: how an edit the Coach makes reaches the Play  *)
(* stored on his device.                                                  *)
(*                                                                         *)
(*   packages/editor/src/editor-store.ts   createEditorStore              *)
(*   packages/editor/src/undo-history.ts   undoStep, redoStep             *)
(*   packages/local-db/src/repository.ts   commitPlay, applyRemotePlay    *)
(*   apps/web/src/app/editor-runtime.ts    the commitPlay adapter         *)
(*   apps/web/src/app/cloud-session.tsx    onOpenPlayChanged, and the     *)
(*     same in clerk-session.tsx                                          *)
(*   packages/sync/src/orchestrator.ts     resolveConflict                *)
(*                                                                         *)
(* .agents/skills/verify-save-queue/SKILL.md maps each action to code     *)
(* and says how to run and update the check.                              *)
(*                                                                         *)
(* A Play is the set of edits it carries. Theirs is the edit the Coach    *)
(* made on his other device. A hash is the Play itself: canonicalSha256   *)
(* never maps two Plays to one hash here. documentHash always hashes the  *)
(* Play on screen, so `doc` stands for both.                              *)
(*                                                                         *)
(* One step is one run of JavaScript between two waits on a task:         *)
(* crypto.subtle.digest, an IndexedDB transaction, or an event. A turn    *)
(* that the queue frees starts in the same microtask, so StartTurn runs   *)
(* before anything else can (Settled). commitPlay's transaction and the   *)
(* store's handling of its receipt are one step: Dexie resolves the       *)
(* transaction in microtasks, so no task runs between them.               *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS
    Edits,     \* the Coach's edits on this device
    Theirs,    \* the edit on the other device's branch of this Play
    NoRecord,  \* no Play stored, or a commit with no expected hash
    NoMark,    \* a turn that carries no edit
    \* How the shell builds a typed edit. "in queue" is applyEdit (main).
    \* "from snapshot" is applyCommand on a command built from
    \* editorStore.getSnapshot().document (4d7994b^, b41f13d^).
    TypedBuild,
    \* What persistedDocumentHash starts as. "when stored" is main:
    \* initialDocumentPersisted ? initialDocumentHash : undefined.
    \* "always" is 251b330^: initialDocumentHash, stored or not.
    BootHash,
    \* Assumptions about timing. Each is TRUE in SaveQueue.cfg, and a
    \* Finding*.cfg shows what main does without it.
    GesturesWaitForSaves,  \* a gesture built from the snapshot comes when no save is queued or running
    RevealWaitsForSaves,   \* sync shows the other device's Play while no turn waits on its hash
    EditsWaitForUndo,      \* no edit is asked for while an undo or redo is queued or running
    MaxFailures,  \* writes IndexedDB may refuse (quota, aborted transaction)
    MaxQueue,     \* turns that may wait on saveTail at once
    MaxUndoSteps  \* Undo and Redo presses

VARIABLES
    doc,        \* state.document, and documentHash
    persisted,  \* persistedDocumentHash
    disk,       \* the plays record in IndexedDB
    status,     \* localSave.phase
    queue,      \* turns waiting on saveTail
    turn,       \* the turn enqueue is running
    undoStack,  \* history.undo, as <<beforeHash, afterHash>> entries
    redoStack,  \* history.redo
    sync,       \* "none", "written" (applyRemotePlay), "revealed"
    made,       \* edits the Coach has made
    undone,     \* edits an undo took off and no redo put back
    abandoned,  \* edits made before the Coach took the other device's Play
    failures,
    undoSteps

vars == <<doc, persisted, disk, status, queue, turn, undoStack, redoStack,
          sync, made, undone, abandoned, failures, undoSteps>>

Plays == SUBSET (Edits \cup {Theirs})

-----------------------------------------------------------------------------
(* A turn is one task passed to enqueue. `newest` is                      *)
(* sequence === latestSequence, which decides whether its outcome reaches *)
(* localSave.                                                             *)

NewTurn(kind, mark, inQueue, snapshot, newest) ==
    [kind |-> kind, mark |-> mark, inQueue |-> inQueue, snapshot |-> snapshot,
     newest |-> newest, pc |-> "queued", before |-> {}, next |-> {},
     expected |-> NoRecord, excused |-> FALSE, entry |-> <<{}, {}>>]

NoTurn == [NewTurn("none", NoMark, TRUE, {}, FALSE) EXCEPT !.pc = "idle"]

Running == turn.pc /= "idle"
Idle == queue = <<>> /\ ~Running
Settled == Running \/ queue = <<>>

Demoted(q) == [i \in DOMAIN q |-> [q[i] EXCEPT !.newest = FALSE]]

UndoPending ==
    \/ turn.kind \in {"undo", "redo"}
    \/ \E i \in DOMAIN queue : queue[i].kind \in {"undo", "redo"}

\* startSaving(): ++latestSequence, localSave "saving". Then enqueue(task).
AskToSave(t) ==
    /\ status' = "saving"
    /\ turn' = [turn EXCEPT !.newest = FALSE]
    /\ queue' = Append(Demoted(queue), [t EXCEPT !.newest = TRUE])

\* persist(): the commit carries persistedDocumentHash as it stands now.
\* A sync write the store has not been shown yet excuses a stale one.
Send(t, play) ==
    [t EXCEPT !.pc = "committing", !.next = play, !.expected = persisted,
              !.excused = (sync = "written")]

-----------------------------------------------------------------------------
(* The Coach                                                              *)

\* editRouteCoaching, the label Text panel: applyEdit -> runCommand.
CoachTypes(e) ==
    /\ Settled
    /\ e \notin made
    /\ Len(queue) < MaxQueue
    /\ EditsWaitForUndo => ~UndoPending
    /\ made' = made \cup {e}
    /\ AskToSave(NewTurn("edit", e, TypedBuild = "in queue", doc \cup {e}, TRUE))
    /\ UNCHANGED <<doc, persisted, disk, undoStack, redoStack, sync, undone,
                   abandoned, failures, undoSteps>>

\* dispatchField, the Flip and route-kind buttons: a command built from
\* editorStore.getSnapshot().document, then applyCommand -> runCommand.
CoachGestures(e) ==
    /\ Settled
    /\ e \notin made
    /\ Len(queue) < MaxQueue
    /\ GesturesWaitForSaves => Idle
    /\ EditsWaitForUndo => ~UndoPending
    /\ made' = made \cup {e}
    /\ AskToSave(NewTurn("edit", e, FALSE, doc \cup {e}, TRUE))
    /\ UNCHANGED <<doc, persisted, disk, undoStack, redoStack, sync, undone,
                   abandoned, failures, undoSteps>>

\* undo() / redo() -> stepHistory: enqueued with no sequence yet.
CoachSteps(kind) ==
    /\ Settled
    /\ undoSteps < MaxUndoSteps
    /\ Len(queue) < MaxQueue
    /\ undoSteps' = undoSteps + 1
    /\ queue' = Append(queue, NewTurn(kind, NoMark, TRUE, {}, FALSE))
    /\ UNCHANGED <<doc, persisted, disk, status, turn, undoStack, redoStack,
                   sync, made, undone, abandoned, failures>>

\* retryLocalSave(): only while localSave says "error".
CoachRetries ==
    /\ Settled
    /\ status = "error"
    /\ Len(queue) < MaxQueue
    /\ AskToSave(NewTurn("retry", NoMark, TRUE, {}, TRUE))
    /\ UNCHANGED <<doc, persisted, disk, undoStack, redoStack, sync, made,
                   undone, abandoned, failures, undoSteps>>

-----------------------------------------------------------------------------
(* The queue                                                              *)

\* saveTail.then(task) runs the next turn.
\*   runCommand: before = state.getState().document; build(before); then
\*     await canonicalSha256(next).
\*   retryLocalSave: persist(state.getState().document, ...) at once.
\*   stepHistory: undoStep/redoStep. Empty, or a top entry that does not
\*     start from documentHash (quarantine), ends the turn; otherwise
\*     await canonicalSha256(next).
StartTurn ==
    /\ ~Running
    /\ queue /= <<>>
    /\ queue' = Tail(queue)
    /\ LET t == Head(queue) IN
       CASE t.kind = "edit" ->
              /\ turn' = [t EXCEPT !.pc = "hashing", !.before = doc,
                                   !.next = IF t.inQueue THEN doc \cup {t.mark}
                                                         ELSE t.snapshot]
              /\ UNCHANGED <<undoStack, redoStack>>
         [] t.kind = "retry" ->
              /\ turn' = Send(t, doc)
              /\ UNCHANGED <<undoStack, redoStack>>
         [] t.kind \in {"undo", "redo"} ->
              LET stack == IF t.kind = "undo" THEN undoStack ELSE redoStack
              IN IF stack = <<>>
                 THEN /\ turn' = NoTurn
                      /\ UNCHANGED <<undoStack, redoStack>>
                 ELSE LET entry == stack[Len(stack)]
                          from == IF t.kind = "undo" THEN entry[2] ELSE entry[1]
                          to == IF t.kind = "undo" THEN entry[1] ELSE entry[2]
                      IN IF from /= doc
                         THEN /\ turn' = NoTurn
                              /\ undoStack' = <<>>
                              /\ redoStack' = <<>>
                         ELSE /\ turn' = [t EXCEPT !.pc = "hashing",
                                                   !.before = doc, !.next = to,
                                                   !.entry = entry]
                              /\ UNCHANGED <<undoStack, redoStack>>
    /\ UNCHANGED <<doc, persisted, disk, status, sync, made, undone, abandoned,
                   failures, undoSteps>>

\* The hash resolves.
\*   runCommand: recordUndoEntry (a no-op edit records nothing);
\*     documentHash = afterHash; showDocument(next); persist(...).
\*   stepHistory: startSaving(requestedAtMs) only now; history =
\*     result.history; showDocument(result.document); persist(...).
ShowAndSend ==
    /\ turn.pc = "hashing"
    /\ doc' = turn.next
    /\ CASE turn.kind = "edit" ->
              /\ IF turn.before = turn.next
                 THEN UNCHANGED <<undoStack, redoStack>>
                 ELSE /\ undoStack' = Append(undoStack, <<turn.before, turn.next>>)
                      /\ redoStack' = <<>>
              /\ turn' = Send(turn, turn.next)
              /\ UNCHANGED <<status, queue, undone>>
         [] turn.kind = "undo" ->
              /\ undoStack' = SubSeq(undoStack, 1, Len(undoStack) - 1)
              /\ redoStack' = Append(redoStack, turn.entry)
              /\ undone' = undone \cup (turn.entry[2] \ turn.entry[1])
              /\ status' = "saving"
              /\ queue' = Demoted(queue)
              /\ turn' = [Send(turn, turn.next) EXCEPT !.newest = TRUE]
         [] turn.kind = "redo" ->
              /\ redoStack' = SubSeq(redoStack, 1, Len(redoStack) - 1)
              /\ undoStack' = Append(undoStack, turn.entry)
              /\ undone' = undone \ (turn.entry[2] \ turn.entry[1])
              /\ status' = "saving"
              /\ queue' = Demoted(queue)
              /\ turn' = [Send(turn, turn.next) EXCEPT !.newest = TRUE]
    /\ UNCHANGED <<persisted, disk, sync, made, abandoned, failures, undoSteps>>

\* repository.commitPlay's transaction, then persist() handling the outcome.
\* A stale expected hash throws StaleLocalPlayError; no expected hash skips
\* the check. On success persistedDocumentHash = receipt.documentHash.
\* localSave changes only for the newest save.
Commit ==
    /\ turn.pc = "committing"
    /\ LET fresh == turn.expected = NoRecord \/ turn.expected = disk
           Told(outcome) == status' = IF turn.newest THEN outcome ELSE status
       IN \/ /\ fresh
             /\ disk' = turn.next
             /\ persisted' = turn.next
             /\ Told("saved")
             /\ UNCHANGED failures
          \/ /\ ~fresh
             /\ Told("error")
             /\ UNCHANGED <<disk, persisted, failures>>
          \/ /\ fresh
             /\ failures < MaxFailures
             /\ failures' = failures + 1
             /\ Told("error")
             /\ UNCHANGED <<disk, persisted>>
    /\ turn' = NoTurn
    /\ UNCHANGED <<doc, queue, undoStack, redoStack, sync, made, undone,
                   abandoned, undoSteps>>

-----------------------------------------------------------------------------
(* Sync, when the Coach takes the other device's branch of the open Play  *)

\* resolveConflict(..., "remote") -> repository.applyRemotePlay: a write
\* that checks no expected hash.
SyncWritesTheirs ==
    /\ Settled
    /\ sync = "none"
    /\ disk /= NoRecord
    /\ disk' = {Theirs}
    /\ sync' = "written"
    /\ turn' = IF turn.pc = "committing" THEN [turn EXCEPT !.excused = TRUE]
                                         ELSE turn
    /\ UNCHANGED <<doc, persisted, status, queue, undoStack, redoStack, made,
                   undone, abandoned, failures, undoSteps>>

\* onOpenPlayChanged -> canonicalSha256(play).then(revealPersistedPlay).
\* Not queued. Same Play id, so the history stays.
Reveal ==
    /\ Settled
    /\ sync = "written"
    /\ RevealWaitsForSaves => turn.pc /= "hashing"
    /\ sync' = "revealed"
    /\ doc' = {Theirs}
    /\ persisted' = {Theirs}
    /\ status' = "saved"
    /\ abandoned' = made
    /\ UNCHANGED <<disk, queue, turn, undoStack, redoStack, made, undone,
                   failures, undoSteps>>

Finished == Idle /\ UNCHANGED vars

-----------------------------------------------------------------------------

\* createEditorStore at boot: a stored Play, or a blank one on a fresh
\* device that the repository has never written.
Init ==
    /\ disk \in {NoRecord, {}}
    /\ persisted = IF BootHash = "when stored" THEN disk ELSE {}
    /\ doc = {}
    /\ status = "saved"
    /\ queue = <<>>
    /\ turn = NoTurn
    /\ undoStack = <<>>
    /\ redoStack = <<>>
    /\ sync = "none"
    /\ made = {}
    /\ undone = {}
    /\ abandoned = {}
    /\ failures = 0
    /\ undoSteps = 0

Next ==
    \/ \E e \in Edits : CoachTypes(e) \/ CoachGestures(e)
    \/ CoachSteps("undo")
    \/ CoachSteps("redo")
    \/ CoachRetries
    \/ StartTurn
    \/ ShowAndSend
    \/ Commit
    \/ SyncWritesTheirs
    \/ Reveal
    \/ Finished

\* The queue and IndexedDB keep going. Sync's reveal runs on its own chain,
\* so it happens even though each queued turn holds it off for a microtask
\* (strong fairness). The Coach presses Retry while the status says the save
\* failed.
Spec ==
    /\ Init /\ [][Next]_vars
    /\ WF_vars(StartTurn) /\ WF_vars(ShowAndSend) /\ WF_vars(Commit)
    /\ SF_vars(Reveal) /\ WF_vars(CoachRetries)

-----------------------------------------------------------------------------
(* What the Coach is promised                                             *)

TypeOK ==
    /\ doc \in Plays
    /\ persisted \in Plays \cup {NoRecord}
    /\ disk \in Plays \cup {NoRecord}
    /\ status \in {"saving", "saved", "error"}
    /\ Len(queue) <= MaxQueue
    /\ sync \in {"none", "written", "revealed"}

\* The edits he expects to see: every one he made, less those an undo took
\* off and those on the branch he gave up for the other device's.
Kept ==
    (made \ (undone \cup abandoned))
        \cup (IF sync = "revealed" THEN {Theirs} \ undone ELSE {})

\* No edit the Coach made is lost: once every save has run, the Play on his
\* screen carries every edit he kept.
NoEditLost == Idle => Kept \subseteq doc

\* Every commit carries the last durable hash: the hash a commit expects is
\* the one stored on this device, unless sync wrote the Play and the store
\* has not been shown it yet.
CommitExpectsStoredHash ==
    turn.pc = "committing" => (turn.expected = disk \/ turn.excused)

\* "Saved on this device" is true: once the Coach has edited and every save
\* has run, a status of saved means the Play on screen is the one stored.
\* A blank Play nobody has touched shows saved and is not written (#166).
\* Between sync's write and revealPersistedPlay the screen is behind.
SavedMeansStored ==
    (Idle /\ made /= {} /\ sync /= "written" /\ status = "saved") => disk = doc

\* A save lands, on a fresh device too: once the Coach has edited, the Play
\* on his screen ends up stored on this device.
SaveEventuallyLands == (made /= {}) ~> (Idle /\ disk = doc)
=============================================================================
