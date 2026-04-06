-- ============================================
-- Migration 084: Daily budget caps (cost optimization)
-- Hard limits to prevent runaway costs from agent loops
-- ============================================

-- Add daily tracking columns
ALTER TABLE agent_budgets
    ADD COLUMN IF NOT EXISTS cost_usd_today numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tokens_used_today integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS day_started_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS max_cost_usd_today numeric DEFAULT 5.00,
    ADD COLUMN IF NOT EXISTS max_cost_per_task numeric DEFAULT 2.00;

-- Set defaults for existing budgets
UPDATE agent_budgets SET
    cost_usd_today = COALESCE(cost_usd_today, 0),
    tokens_used_today = COALESCE(tokens_used_today, 0),
    day_started_at = COALESCE(day_started_at, now()),
    max_cost_usd_today = COALESCE(max_cost_usd_today, 5.00),
    max_cost_per_task = COALESCE(max_cost_per_task, 2.00)
WHERE max_cost_usd_today IS NULL;

-- Function to check if budget allows another task
CREATE OR REPLACE FUNCTION check_budget_allows_task(p_agent_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_budget agent_budgets%ROWTYPE;
    v_should_reset boolean;
BEGIN
    SELECT * INTO v_budget FROM agent_budgets WHERE agent_id = p_agent_id;

    IF v_budget IS NULL THEN
        -- No budget = create one with defaults, allow first task
        INSERT INTO agent_budgets (agent_id, max_cost_usd_today, max_cost_per_task, day_started_at)
        VALUES (p_agent_id, 5.00, 2.00, now())
        ON CONFLICT (agent_id) DO NOTHING;
        RETURN jsonb_build_object('allowed', true, 'reason', 'first_task');
    END IF;

    -- Reset daily counters if 24h passed
    v_should_reset := (now() - v_budget.day_started_at) > interval '24 hours';
    IF v_should_reset THEN
        UPDATE agent_budgets
        SET cost_usd_today = 0,
            tokens_used_today = 0,
            day_started_at = now()
        WHERE agent_id = p_agent_id;
        RETURN jsonb_build_object('allowed', true, 'reason', 'day_reset');
    END IF;

    -- Check daily cap
    IF v_budget.cost_usd_today >= v_budget.max_cost_usd_today THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'daily_cap_reached',
            'spent_today', v_budget.cost_usd_today,
            'cap', v_budget.max_cost_usd_today
        );
    END IF;

    -- Within cap
    RETURN jsonb_build_object(
        'allowed', true,
        'spent_today', v_budget.cost_usd_today,
        'cap', v_budget.max_cost_usd_today,
        'remaining', v_budget.max_cost_usd_today - v_budget.cost_usd_today
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record cost and check if cap exceeded after adding it
CREATE OR REPLACE FUNCTION record_task_cost(p_agent_id uuid, p_cost numeric, p_tokens integer)
RETURNS jsonb AS $$
DECLARE
    v_budget agent_budgets%ROWTYPE;
BEGIN
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

    RETURN jsonb_build_object(
        'spent_today', v_budget.cost_usd_today,
        'cap', v_budget.max_cost_usd_today,
        'over_cap', v_budget.cost_usd_today >= v_budget.max_cost_usd_today,
        'over_80', v_budget.cost_usd_today >= 0.8 * v_budget.max_cost_usd_today
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
