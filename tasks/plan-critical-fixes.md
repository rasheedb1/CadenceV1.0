# Plan: 4 Critical Bug Fixes — Make Projects Complete End-to-End

## Confirmed: fixing these 4 bugs completes the full project cycle

Flow after fixes:
1. Chief creates project → phase-transition generates tasks ✅ (works)
2. Each agent claims ONE task → Bug 2 fix
3. Agents work → complete → artifacts ✅ (works)
4. request_review → review claimable → Bug 3 fix
5. Review approved → task done ✅ (works)
6. All tasks done → phase complete → next phase → Bug 4 fix
7. Agents still running → claim new tasks → Bug 1 fix
8. Repeat → project complete

---

## Bug 1: Agents stop permanently (CRITICAL)

**Problem:** `stop()` is called by idle ratio guard. It's permanent — no wake mechanism.
**File:** event-loop.js lines 758-776, 1083

**Fix:** Replace `stop()` with deep sleep. Agent probes every 5 min instead of dying.

```javascript
// OLD (line 774):
stop();

// NEW:
state.interval = 300000; // 5 min deep sleep
state.recentTickActions = []; // reset window
console.warn("[event-loop] Deep sleep — probing every 5min");
// Do NOT call stop() — agent stays alive
```

**Also:** Remove `stop()` from budget max iterations (line 893). Replace with deep sleep too.

**Impact:** Agents never die. They sleep when idle and wake up when tasks arrive.

---

## Bug 2: One agent grabs multiple tasks (CRITICAL)

**Problem:** No per-agent limit. FAST PATH + claim_task both allow unlimited claiming.
**File:** event-loop.js line 1009, claim_task_v2 SQL

**Fix A (SQL):** Add check to claim_task_v2 — skip if agent already has a task.

```sql
-- Add to WHERE clause in claim_task_v2:
AND NOT EXISTS (
  SELECT 1 FROM public.agent_tasks_v2
  WHERE assigned_agent_id = p_agent_id
    AND status IN ('claimed', 'in_progress')
)
```

**Fix B (Event loop):** Add guard before FAST PATH.

```javascript
// Before FAST PATH (line ~1005):
const myActiveTasks = await sbGet(
  `agent_tasks_v2?assigned_agent_id=eq.${AGENT_ID}&status=in.(claimed,in_progress)&limit=1&select=id`
).catch(() => []);
const alreadyHasTask = Array.isArray(myActiveTasks) && myActiveTasks.length > 0;

if (!alreadyHasTask && hasAvailableV2) {
  // FAST PATH...
}
```

**Impact:** Each agent claims max 1 task at a time. Fair distribution across team.

---

## Bug 3: Review tasks deadlock (CRITICAL)

**Problem:** `request_review` creates review task with `depends_on: [original_task_id]`.
Original is in status "review" (not "done"). claim_task_v2 requires depends_on to be "done".
Result: review task can NEVER be claimed. Permanent deadlock.
**File:** event-loop.js line 551

**Fix:** Remove depends_on from review task creation.

```javascript
// OLD (line 551):
depends_on: [params.task_id],

// NEW:
depends_on: [],  // Reviews must be independently claimable
```

**Impact:** Review tasks can be claimed immediately. No more deadlocks.

---

## Bug 4: Phase transitions never fire (CRITICAL)

**Problem:** The check_phase_completion trigger either doesn't exist or wasn't deployed correctly.
When all tasks of a phase are done, nothing marks the phase as completed.

**Fix:** Recreate the trigger with proper logic + call phase-transition via pg_net.

```sql
CREATE OR REPLACE FUNCTION public.check_phase_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_phase_id uuid;
  v_total int;
  v_done int;
  v_project_id uuid;
  v_phase_number int;
  v_next_phase_id uuid;
BEGIN
  IF NEW.phase_id IS NULL THEN RETURN NEW; END IF;
  v_phase_id := NEW.phase_id;

  -- Count original tasks only (not [REVIEW] tasks)
  SELECT count(*), count(*) FILTER (WHERE status IN ('done', 'cancelled'))
  INTO v_total, v_done
  FROM agent_tasks_v2
  WHERE phase_id = v_phase_id
    AND title NOT LIKE '[REVIEW]%';

  IF v_total > 0 AND v_total = v_done THEN
    -- Mark phase complete
    UPDATE agent_project_phases
    SET status = 'completed', completed_at = now()
    WHERE id = v_phase_id
    RETURNING project_id, phase_number INTO v_project_id, v_phase_number;

    -- Activate next phase
    UPDATE agent_project_phases
    SET status = 'in_progress'
    WHERE project_id = v_project_id
      AND phase_number = v_phase_number + 1
      AND status = 'pending'
    RETURNING id INTO v_next_phase_id;

    IF v_next_phase_id IS NOT NULL THEN
      -- Generate tasks for next phase
      PERFORM net.http_post(
        url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/phase-transition',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_KEY"}'::jsonb,
        body := json_build_object('project_id', v_project_id, 'phase_id', v_next_phase_id)::jsonb
      );
    ELSE
      -- No more phases → project complete
      UPDATE agent_projects SET status = 'completed', updated_at = now()
      WHERE id = v_project_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

**Impact:** Phases auto-advance. Projects auto-complete.

---

## Secondary fixes (HIGH but not blocking)

### S1: "Error interno" — surface real errors
**File:** bridge/server.js line 2688
**Fix:** Return the actual error message, not generic text.

### S2: ask_human timeout
**File:** event-loop.js line 645
**Fix:** If no human reply in 10 min, continue with best judgment.

### S3: Capability distribution
**File:** phase-transition/index.ts
**Fix:** Already improved with TYPE_CAPS map. Bug 2 fix (max 1 task) solves the fairness issue.

---

## Execution order

```
1. Bug 3 (review deadlock) — 1 line change in event-loop.js
2. Bug 2 (multi-claim) — SQL change + event-loop guard
3. Bug 1 (permanent stop) — replace stop() with deep sleep
4. Bug 4 (phase transition) — recreate SQL trigger
5. Deploy: sync event-loop to Juanse, push, redeploy all
6. Test: clean slate, new project, verify full cycle
```

Total: ~30 min implementation, ~10 min deploy, ~30 min test.
