-- ============================================
-- Migration 089: Per-user daily budget caps
-- $100/day per user across ALL their agents
-- ============================================

-- Table to store per-user budget settings and daily tracking
CREATE TABLE IF NOT EXISTS public.user_budget_caps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_daily_cost_usd numeric DEFAULT 100.00,
  cost_usd_today numeric DEFAULT 0,
  tokens_used_today bigint DEFAULT 0,
  day_started_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_budget_caps_user ON public.user_budget_caps (user_id);

ALTER TABLE public.user_budget_caps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budget" ON public.user_budget_caps
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own budget" ON public.user_budget_caps
  FOR UPDATE USING (user_id = auth.uid());

-- Raise per-agent daily cap from $5 to $25 (user-level cap is the real limiter now)
UPDATE agent_budgets SET max_cost_usd_today = 25.00 WHERE max_cost_usd_today = 5.00;

-- Also raise per-task ceiling from $2 to $5
UPDATE agent_budgets SET max_cost_per_task = 5.00 WHERE max_cost_per_task = 2.00;

-- ============================================
-- Replace check_budget_allows_task to also enforce user-level cap
-- ============================================
CREATE OR REPLACE FUNCTION check_budget_allows_task(p_agent_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_budget agent_budgets%ROWTYPE;
    v_should_reset boolean;
    v_user_id uuid;
    v_user_cap record;
    v_user_spent_today numeric;
BEGIN
    SELECT * INTO v_budget FROM agent_budgets WHERE agent_id = p_agent_id;

    IF v_budget IS NULL THEN
        INSERT INTO agent_budgets (agent_id, max_cost_usd_today, max_cost_per_task, day_started_at)
        VALUES (p_agent_id, 25.00, 5.00, now())
        ON CONFLICT (agent_id) DO NOTHING;
        RETURN jsonb_build_object('allowed', true, 'reason', 'first_task');
    END IF;

    -- Reset daily counters if 24h passed (agent level)
    v_should_reset := (now() - v_budget.day_started_at) > interval '24 hours';
    IF v_should_reset THEN
        UPDATE agent_budgets
        SET cost_usd_today = 0,
            tokens_used_today = 0,
            day_started_at = now()
        WHERE agent_id = p_agent_id;
        -- Don't return yet — still need to check user-level cap
        v_budget.cost_usd_today := 0;
    END IF;

    -- Check per-agent daily cap
    IF v_budget.cost_usd_today >= v_budget.max_cost_usd_today THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'agent_daily_cap_reached',
            'spent_today', v_budget.cost_usd_today,
            'cap', v_budget.max_cost_usd_today
        );
    END IF;

    -- ============================================
    -- USER-LEVEL DAILY CAP CHECK
    -- ============================================
    -- Find the user who owns this agent
    SELECT created_by INTO v_user_id FROM agents WHERE id = p_agent_id;

    IF v_user_id IS NOT NULL THEN
        -- Get or create user budget cap
        SELECT * INTO v_user_cap FROM user_budget_caps WHERE user_id = v_user_id;

        IF v_user_cap IS NULL THEN
            INSERT INTO user_budget_caps (user_id, max_daily_cost_usd, cost_usd_today, day_started_at)
            VALUES (v_user_id, 100.00, 0, now())
            ON CONFLICT (user_id) DO NOTHING;
            -- Fresh user, allow
        ELSE
            -- Reset user daily counter if 24h passed
            IF (now() - v_user_cap.day_started_at) > interval '24 hours' THEN
                UPDATE user_budget_caps
                SET cost_usd_today = 0,
                    tokens_used_today = 0,
                    day_started_at = now()
                WHERE user_id = v_user_id;
            ELSE
                -- Check user daily cap
                IF v_user_cap.cost_usd_today >= v_user_cap.max_daily_cost_usd THEN
                    RETURN jsonb_build_object(
                        'allowed', false,
                        'reason', 'user_daily_cap_reached',
                        'spent_today', v_user_cap.cost_usd_today,
                        'cap', v_user_cap.max_daily_cost_usd,
                        'user_id', v_user_id
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    -- All checks passed
    RETURN jsonb_build_object(
        'allowed', true,
        'spent_today', v_budget.cost_usd_today,
        'cap', v_budget.max_cost_usd_today,
        'remaining', v_budget.max_cost_usd_today - v_budget.cost_usd_today,
        'user_spent_today', COALESCE((SELECT cost_usd_today FROM user_budget_caps WHERE user_id = v_user_id), 0),
        'user_cap', COALESCE((SELECT max_daily_cost_usd FROM user_budget_caps WHERE user_id = v_user_id), 100.00)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Replace record_task_cost to also update user-level spending
-- ============================================
CREATE OR REPLACE FUNCTION record_task_cost(p_agent_id uuid, p_cost numeric, p_tokens integer)
RETURNS jsonb AS $$
DECLARE
    v_budget agent_budgets%ROWTYPE;
    v_user_id uuid;
    v_user_spent numeric;
    v_user_cap numeric;
BEGIN
    -- Update agent-level budget
    UPDATE agent_budgets
    SET cost_usd_today = cost_usd_today + p_cost,
        tokens_used_today = tokens_used_today + p_tokens,
        cost_usd = COALESCE(cost_usd, 0) + p_cost,
        tokens_used = COALESCE(tokens_used, 0) + p_tokens
    WHERE agent_id = p_agent_id
    RETURNING * INTO v_budget;

    IF v_budget IS NULL THEN
        RETURN jsonb_build_object('error', 'budget_not_found');
    END IF;

    -- Update user-level daily spending
    SELECT created_by INTO v_user_id FROM agents WHERE id = p_agent_id;

    IF v_user_id IS NOT NULL THEN
        -- Upsert user budget and add cost
        INSERT INTO user_budget_caps (user_id, cost_usd_today, tokens_used_today, day_started_at)
        VALUES (v_user_id, p_cost, p_tokens, now())
        ON CONFLICT (user_id) DO UPDATE
        SET cost_usd_today = CASE
                WHEN (now() - user_budget_caps.day_started_at) > interval '24 hours'
                THEN p_cost  -- reset + add new cost
                ELSE user_budget_caps.cost_usd_today + p_cost
            END,
            tokens_used_today = CASE
                WHEN (now() - user_budget_caps.day_started_at) > interval '24 hours'
                THEN p_tokens
                ELSE user_budget_caps.tokens_used_today + p_tokens
            END,
            day_started_at = CASE
                WHEN (now() - user_budget_caps.day_started_at) > interval '24 hours'
                THEN now()
                ELSE user_budget_caps.day_started_at
            END,
            updated_at = now();

        SELECT cost_usd_today, max_daily_cost_usd
        INTO v_user_spent, v_user_cap
        FROM user_budget_caps WHERE user_id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'spent_today', v_budget.cost_usd_today,
        'cap', v_budget.max_cost_usd_today,
        'over_cap', v_budget.cost_usd_today >= v_budget.max_cost_usd_today,
        'over_80', v_budget.cost_usd_today >= 0.8 * v_budget.max_cost_usd_today,
        'user_spent_today', COALESCE(v_user_spent, 0),
        'user_cap', COALESCE(v_user_cap, 100.00),
        'user_over_cap', COALESCE(v_user_spent, 0) >= COALESCE(v_user_cap, 100.00)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
