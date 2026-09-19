-- prisma/migrations/V36b_harden_onboarding_function.sql
-- B-11 — hardens fn_onboard_employee_with_contract (Section 3.1).
--
-- Three defects fixed:
--   1. No SET search_path on a SECURITY DEFINER function granted to the
--      runtime role — the classic privilege-escalation vector.
--   2. Audit written with a raw INSERT, bypassing the hash chain that
--      Section 9.1 requires (the operation most needing an audit trail was
--      the one breaking the chain).
--   3. `EXCEPTION WHEN OTHERS` collapsed duplicate-job-number, FK and
--      permission errors into one message, making support diagnosis
--      impossible.
--
-- Apply AFTER V36 (original) and AFTER the baseline audit_entries DDL +
-- fn_append_audit_entry exist.

CREATE OR REPLACE FUNCTION fn_onboard_employee_with_contract(
    p_name          VARCHAR,
    p_job_number    VARCHAR,
    p_unit_id       INTEGER,
    p_position      VARCHAR,
    p_contact_email VARCHAR,
    p_contract_start DATE,
    p_contract_end   DATE,
    p_actor_id       INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_employee_id INTEGER;
BEGIN
    -- Guard 1: only active positions may be assigned.
    IF NOT EXISTS (
        SELECT 1 FROM position_directory
         WHERE code = p_position AND is_active = true
    ) THEN
        RAISE EXCEPTION 'POSITION_NOT_ACTIVE: % is unknown or deactivated', p_position
            USING ERRCODE = 'check_violation';
    END IF;

    -- Guard 2: date sanity (mirrors the exclusion-constraint expectation).
    IF p_contract_end < p_contract_start THEN
        RAISE EXCEPTION 'CONTRACT_DATES_INVALID: end % precedes start %',
            p_contract_end, p_contract_start
            USING ERRCODE = 'check_violation';
    END IF;

    -- Step A: Employee Master
    INSERT INTO employees (name, job_number, unit_id, position, contact_email, created_at)
    VALUES (p_name, p_job_number, p_unit_id, p_position, p_contact_email, now())
    RETURNING id INTO v_employee_id;

    -- Step B: Initial approved contract — physically enforces "contract-first".
    INSERT INTO contracts (employee_id, start_date, end_date, status, created_at)
    VALUES (v_employee_id, p_contract_start, p_contract_end, 'Approved', now());

    -- Step C: Domain audit event through the canonical chained path.
    PERFORM fn_append_audit_entry(
        p_actor_id,
        'EMPLOYEE_ONBOARDED',
        'employees',
        v_employee_id::text,
        jsonb_build_object('job_number', p_job_number, 'unit_id', p_unit_id)
    );

    RETURN v_employee_id;

    -- Deliberately NO `EXCEPTION WHEN OTHERS` handler: it masked duplicate
    -- job-number, foreign-key and permission failures behind one generic
    -- message. The function body is a single implicit transaction, so any
    -- raised error still rolls back the entire call atomically.
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   -- Required on SECURITY DEFINER functions: pins name resolution so a
   -- caller cannot shadow public objects via a manipulated search_path.
   SET search_path = pg_catalog, public;

-- The runtime role must not be able to replace this function.
REVOKE ALL ON FUNCTION fn_onboard_employee_with_contract FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_onboard_employee_with_contract TO nurseapp_runtime;

-- Verification queries (run after applying):
--   SELECT proname, prosecdef, proconfig
--     FROM pg_proc WHERE proname = 'fn_onboard_employee_with_contract';
--   -- expect prosecdef = true and proconfig = {search_path=pg_catalog, public}
--
--   -- Negative test: direct insert must be denied for the runtime role
--   SET ROLE nurseapp_runtime;
--   INSERT INTO employees (name, job_number, unit_id, position, contact_email)
--   VALUES ('Test', 'TEST-1', 1, 'SN', 't@example.com');   -- expect: permission denied
--
--   -- Negative test: duplicate job number must surface the real error
--   SELECT fn_onboard_employee_with_contract('A','DUP-1',1,'SN','a@x.sa',CURRENT_DATE,CURRENT_DATE+365,1);
--   SELECT fn_onboard_employee_with_contract('B','DUP-1',1,'SN','b@x.sa',CURRENT_DATE,CURRENT_DATE+365,1);
--   -- expect: duplicate key value violates unique constraint (not a generic message)
