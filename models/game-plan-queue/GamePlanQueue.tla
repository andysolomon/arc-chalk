--------------------------- MODULE GamePlanQueue ---------------------------
(***************************************************************************)
(* The game-plan write queue: how a change the Coach makes to the open    *)
(* Game Plan reaches the plan list, the library and a prepared revision.  *)
(*                                                                         *)
(*   apps/web/src/library/use-game-plans.ts       useGamePlans            *)
(*   apps/web/src/library/game-plans-workspace.tsx  PlanEditor,           *)
(*     DraftField                                                         *)
(*                                                                         *)
(* .agents/skills/verify-game-plan-queue/SKILL.md maps each action to     *)
(* code and says how to run and update the check.                         *)
(*                                                                         *)
(* One plan, open in the workspace. A plan is the set of changes it       *)
(* carries: the Coach's edits, and Prep once Prepare has pointed it at a  *)
(* revision. Two edits always touch the same call, which is the worst     *)
(* case for a change built from an old copy of the plan: the copy puts    *)
(* back whatever it did not see.                                          *)
(*                                                                         *)
(* One step is one run of JavaScript between two waits: an IndexedDB      *)
(* request, a React render, or an event. A task the queue frees starts    *)
(* in the microtasks that follow, so nothing else runs between them       *)
(* (Settled). React renders a setPlans made in an event, or in a layout   *)
(* effect, before the next task (owed). A setPlans made after an await    *)
(* renders in a later task, and other tasks can run first.                *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS
    Edits,       \* the Coach's edits to the plan
    Prep,        \* the change Prepare makes: preparedRevisionId
    NoMark,      \* no edit
    NoRevision,  \* no revision prepared yet
    \* What a change is built on. "plan now" is revise (main): the plan in
    \* plansRef as the change lands. "render" is apply(change(plan)) with
    \* the plan the last render handed PlanEditor (f016f25^).
    EditsBuildOn,
    \* When a field commits what was typed. "on leave or unmount" is
    \* DraftField (main). "on blur only" is the uncontrolled input that
    \* lost its text when its row was remade (f016f25^).
    FieldCommits,
    \* When the list shows a change. "at once" is apply's publish ahead of
    \* the write (main). "when written" is setPlans after saveGamePlan
    \* resolved (b24b02c^).
    ApplyShows,
    \* What Prepare freezes. "plan now" reads plansRef when its turn in the
    \* queue comes (main). "caller's plan" is the plan the click passed in
    \* (b24b02c^).
    PrepareReads,
    \* Assumptions about timing. Each is TRUE in GamePlanQueue.cfg, and a
    \* Finding*.cfg shows what main does without it.
    ClicksSeeEveryPublish,  \* a click handler runs after React has rendered every publish
    FailedWriteIsLast,      \* IndexedDB refuses a write only with nothing queued behind it, and nothing is committed until the refresh lands
    EditsWaitForPrepare,    \* nothing is committed from the Prepare click until Prepare shows the prepared plan
    MaxFailures,  \* writes IndexedDB may refuse (quota, aborted transaction)
    MaxQueue      \* tasks that may wait on queueRef at once

VARIABLES
    shown,     \* plansRef.current: what the next edit and Prepare read
    rendered,  \* the plan prop the last render handed PlanEditor
    disk,      \* the game plan record in IndexedDB
    queue,     \* tasks waiting on queueRef
    task,      \* the task enqueue is running
    draft,     \* the edit typed into the focused field, not committed yet
    remade,    \* a move since the last render remakes the focused field's row
    owed,      \* React renders before the next task runs
    made,     \* edits the Coach has typed or made
    refused,   \* changes whose own write IndexedDB refused
    asked,     \* edits made before the Coach clicked Prepare
    revision,  \* the plan the prepared revision froze
    failures

vars == <<shown, rendered, disk, queue, task, draft, remade, owed, made,
          refused, asked, revision, failures>>

Marks == Edits \cup {Prep}
Plans == SUBSET Marks

-----------------------------------------------------------------------------
(* A task is one function passed to enqueue: write(plan) from apply, or   *)
(* Prepare. `moved` says the change remakes a call's row once the list    *)
(* shows it.                                                              *)

NewTask(kind, plan, mark, moved) ==
    [kind |-> kind, plan |-> plan, mark |-> mark, moved |-> moved,
     pc |-> "queued"]

NoTask == [NewTask("none", {}, NoMark, FALSE) EXCEPT !.pc = "idle"]

Running == task.pc /= "idle"
Idle == queue = <<>> /\ ~Running
Settled == ~owed /\ (Running \/ queue = <<>>)

\* Prepare is queued, or reading the Plays, and has not published yet.
PrepareWaiting ==
    \/ task.pc = "reading"
    \/ \E i \in DOMAIN queue : queue[i].kind = "prepare"

\* A commit the Coach makes may run now.
MayCommit ==
    /\ Settled
    /\ Len(queue) < MaxQueue
    /\ FailedWriteIsLast => task.pc /= "refreshing"
    /\ EditsWaitForPrepare => ~PrepareWaiting

\* A click handler that reads the plan prop sees every publish.
SeesRender(reads) == (reads /\ ClicksSeeEveryPublish) => rendered = shown

\* apply(next) in an event: publish, then enqueue(() => write(next)).
\* Under "when written" the list shows it only once the write lands.
Apply(next, mark, moved) ==
    /\ queue' = Append(queue, NewTask("write", next, mark, moved))
    /\ IF ApplyShows = "at once"
       THEN /\ shown' = next
            /\ owed' = TRUE
       ELSE /\ owed' = FALSE
            /\ UNCHANGED shown

\* The plan a change is built on: plansRef (revise) or the plan prop.
Base(fromRender) == IF fromRender THEN rendered ELSE shown

-----------------------------------------------------------------------------
(* The Coach                                                              *)

\* DraftField onChange: the text is in the field, not on the plan.
CoachTypes(e) ==
    /\ Settled
    /\ draft = NoMark
    /\ e \notin made
    /\ made' = made \cup {e}
    /\ draft' = e
    /\ UNCHANGED <<shown, rendered, disk, queue, task, remade, owed, refused,
                   asked, revision, failures>>

\* DraftField's onBlur calls leave, then onCommit. The fields are NoteField,
\* CodeField, and the plan's name, opponent and game. A mousedown on any
\* button blurs first, so this runs ahead of every click below.
CoachLeaves ==
    /\ draft /= NoMark
    /\ MayCommit
    /\ SeesRender(EditsBuildOn = "render")
    /\ Apply(Base(EditsBuildOn = "render") \cup {draft}, draft, FALSE)
    /\ draft' = NoMark
    /\ UNCHANGED <<rendered, disk, task, remade, made, refused, asked,
                   revision, failures>>

\* The "Move to…" select's onChange, or a drop: moveCallToSection or
\* placeCallInSection. Neither blurs the focused field, and the move
\* remakes the row that holds it.
CoachMoves(e) ==
    /\ MayCommit
    /\ e \notin made
    /\ SeesRender(EditsBuildOn = "render")
    /\ made' = made \cup {e}
    /\ Apply(Base(EditsBuildOn = "render") \cup {e}, e, TRUE)
    /\ remade' = (remade \/ (draft /= NoMark /\ ApplyShows = "at once"))
    /\ UNCHANGED <<rendered, disk, task, draft, refused, asked, revision,
                   failures>>

\* apply with the plan prop, which main still uses for a section's ↑ and ↓,
\* "Sort by number", the section name, "Remove section", "Add section" and
\* Add plays.
CoachClicks(e) ==
    /\ MayCommit
    /\ draft = NoMark
    /\ e \notin made
    /\ SeesRender(TRUE)
    /\ made' = made \cup {e}
    /\ Apply(rendered \cup {e}, e, FALSE)
    /\ UNCHANGED <<rendered, disk, task, draft, remade, refused, asked,
                   revision, failures>>

\* "Prepare for game": leaveField(), then state.prepare(plan, now()) with
\* the plan prop. The mousedown already left the field.
CoachPrepares ==
    /\ Settled
    /\ Len(queue) < MaxQueue
    /\ draft = NoMark
    /\ revision = NoRevision
    /\ \A i \in DOMAIN queue : queue[i].kind /= "prepare"
    /\ task.kind /= "prepare"
    /\ SeesRender(TRUE)
    /\ asked' = made
    /\ queue' = Append(queue, NewTask("prepare", rendered, Prep, FALSE))
    /\ UNCHANGED <<shown, rendered, disk, task, draft, remade, owed, made,
                   refused, revision, failures>>

-----------------------------------------------------------------------------
(* React                                                                  *)

\* setPlans renders: at once when owed, else in a task of its own. A row
\* the move remade unmounts its DraftField, whose layout cleanup commits
\* with the onCommit of the render before: revise under "plan now", or a
\* change built on that render's plan under "render". Under "on blur
\* only" the uncontrolled input goes, and its text with it.
Render ==
    /\ owed \/ (Settled /\ (rendered /= shown \/ remade))
    /\ rendered' = shown
    /\ remade' = FALSE
    /\ draft' = IF remade THEN NoMark ELSE draft
    /\ IF remade /\ draft /= NoMark /\ FieldCommits = "on leave or unmount"
       THEN Apply(Base(EditsBuildOn = "render") \cup {draft}, draft, FALSE)
       ELSE /\ owed' = FALSE
            /\ UNCHANGED <<queue, shown>>
    /\ UNCHANGED <<disk, task, made, refused, asked, revision, failures>>

-----------------------------------------------------------------------------
(* The queue                                                              *)

\* queueRef.current.then(task, task) runs the next task.
\*   write: library.saveGamePlan(plan), then await.
\*   prepare: latest = plansRef.current.find(...) ?? plan, then await
\*     library.getPlay for each call. b24b02c^ used the plan passed in.
StartTask ==
    /\ ~owed
    /\ ~Running
    /\ queue /= <<>>
    /\ queue' = Tail(queue)
    /\ LET t == Head(queue) IN
       task' = IF t.kind = "write"
               THEN [t EXCEPT !.pc = "saving"]
               ELSE [t EXCEPT !.pc = "reading",
                              !.plan = IF PrepareReads = "plan now"
                                       THEN shown ELSE t.plan]
    /\ UNCHANGED <<shown, rendered, disk, draft, remade, owed, made, refused,
                   asked, revision, failures>>

\* saveGamePlanRevision resolves: prepareGamePlan froze latest. Then
\* publish(withPlan(plansRef.current, result.plan)) and write(result.plan),
\* where result.plan is latest pointed at the revision. b24b02c^ called
\* apply, which showed it only once written.
Freeze ==
    /\ ~owed
    /\ task.pc = "reading"
    /\ revision' = task.plan
    /\ task' = [task EXCEPT !.pc = "saving", !.plan = task.plan \cup {Prep}]
    /\ shown' = IF ApplyShows = "at once" THEN task.plan \cup {Prep} ELSE shown
    /\ UNCHANGED <<rendered, disk, queue, draft, remade, owed, made, refused,
                   asked, failures>>

\* saveGamePlan's transaction commits. b24b02c^ then called setPlans with
\* the plan it wrote.
Land ==
    /\ ~owed
    /\ task.pc = "saving"
    /\ disk' = task.plan
    /\ task' = NoTask
    /\ IF ApplyShows = "when written"
       THEN /\ shown' = task.plan
            /\ remade' = (remade \/ (task.moved /\ draft /= NoMark))
       ELSE UNCHANGED <<shown, remade>>
    /\ UNCHANGED <<rendered, queue, draft, owed, made, refused, asked,
                   revision, failures>>

\* saveGamePlan rejects: write's catch awaits refresh().
Refuse ==
    /\ ~owed
    /\ task.pc = "saving"
    /\ failures < MaxFailures
    /\ FailedWriteIsLast => queue = <<>>
    /\ failures' = failures + 1
    /\ refused' = refused \cup {task.mark}
    /\ task' = [task EXCEPT !.pc = "refreshing"]
    /\ UNCHANGED <<shown, rendered, disk, queue, draft, remade, owed, made,
                   asked, revision>>

\* refresh(): library.listGamePlans() resolves and publish(next) shows it.
\* Only this queue writes game plans, so the library cannot change while
\* the read is in flight. Then loadRevision, and write rethrows.
RefreshShowsLibrary ==
    /\ ~owed
    /\ task.pc = "refreshing"
    /\ shown' = disk
    /\ task' = NoTask
    /\ UNCHANGED <<rendered, disk, queue, draft, remade, owed, made, refused,
                   asked, revision, failures>>

Finished == Idle /\ UNCHANGED vars

-----------------------------------------------------------------------------

\* A plan already stored and loaded, with nothing typed.
Init ==
    /\ shown = {}
    /\ rendered = {}
    /\ disk = {}
    /\ queue = <<>>
    /\ task = NoTask
    /\ draft = NoMark
    /\ remade = FALSE
    /\ owed = FALSE
    /\ made = {}
    /\ refused = {}
    /\ asked = {}
    /\ revision = NoRevision
    /\ failures = 0

Next ==
    \/ \E e \in Edits : CoachTypes(e) \/ CoachMoves(e) \/ CoachClicks(e)
    \/ CoachLeaves
    \/ CoachPrepares
    \/ Render
    \/ StartTask
    \/ Freeze
    \/ Land
    \/ Refuse
    \/ RefreshShowsLibrary
    \/ Finished

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* What the Coach is promised                                             *)

TypeOK ==
    /\ shown \in Plans
    /\ rendered \in Plans
    /\ disk \in Plans
    /\ Len(queue) <= MaxQueue
    /\ draft \in Edits \cup {NoMark}
    /\ revision \in Plans \cup {NoRevision}

\* The changes he expects the plan to carry: every edit he made and every
\* Prepare that froze a revision, less what is still in the field and the
\* changes whose own write failed, which refresh() took off his screen.
Kept ==
    (made \cup (IF revision /= NoRevision THEN {Prep} ELSE {}))
        \ (refused \cup {draft})

\* No change is lost: once every write has run, the plan on his screen and
\* the plan in the library carry every change he kept.
NoEditLost == Idle => (Kept \subseteq shown /\ Kept \subseteq disk)

\* The list tells the truth: once every write has run, the plan on his
\* screen is the plan the library holds.
ShownIsStored == Idle => shown = disk

\* Prepare freezes the plan as he left it: the revision carries every edit
\* he made before he clicked, less those whose own write failed.
PrepareFreezesLatest ==
    revision /= NoRevision => (asked \ refused) \subseteq revision
=============================================================================
