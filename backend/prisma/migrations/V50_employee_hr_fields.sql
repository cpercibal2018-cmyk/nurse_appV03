-- prisma/migrations/V50_employee_hr_fields.sql
-- Employee HR fields + Hijri contract dates (Workforce onboarding form).
--
-- Job Number carries NO FORMAT RULE. It is a plain number (1001) or a text +
-- number combination (AIGH1002, EMP2004). The only constraint that ever
-- applied — and still applies — is uniqueness; the retired AIGH-XXXX pattern
-- is not enforced and must not be reintroduced by a CHECK constraint.
--
-- Full Name is derived, never entered: a trigger recomputes it from
-- first/middle/last on every write so the stored value cannot drift from the
-- three parts. A generated column was rejected because Prisma writes
-- full_name explicitly and PostgreSQL refuses writes to generated columns.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS job_title          VARCHAR(120),
  ADD COLUMN IF NOT EXISTS file_no            VARCHAR(60),
  ADD COLUMN IF NOT EXISTS rank_grade         VARCHAR(60),
  ADD COLUMN IF NOT EXISTS nationality        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS job_post_location  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS actual_work_place  VARCHAR(160),
  ADD COLUMN IF NOT EXISTS specialty          VARCHAR(120),
  ADD COLUMN IF NOT EXISTS marital_status     VARCHAR(20)
    CONSTRAINT chk_employees_marital_status CHECK (marital_status IN ('Single', 'Married', 'Others')),
  ADD COLUMN IF NOT EXISTS salary             NUMERIC(12, 2)
    CONSTRAINT chk_employees_salary_non_negative CHECK (salary IS NULL OR salary >= 0);

CREATE INDEX IF NOT EXISTS idx_employees_nationality ON employees(nationality);
CREATE INDEX IF NOT EXISTS idx_employees_specialty   ON employees(specialty);
CREATE INDEX IF NOT EXISTS idx_employees_file_no     ON employees(file_no);

-- Full Name = First Name + Middle Name + Last Name. Middle Name is optional,
-- so a missing middle name must not leave a double space behind.
CREATE OR REPLACE FUNCTION fn_employees_compose_full_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.full_name := btrim(
    NEW.first_name || ' ' ||
    COALESCE(btrim(NEW.middle_name), '') || ' ' ||
    NEW.last_name
  );
  -- `name` is retained for backward compatibility with existing readers.
  NEW.name := NEW.full_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_compose_full_name ON employees;
CREATE TRIGGER trg_employees_compose_full_name
  BEFORE INSERT OR UPDATE OF first_name, middle_name, last_name, full_name, name
  ON employees
  FOR EACH ROW
  EXECUTE FUNCTION fn_employees_compose_full_name();

-- Recompose existing rows so back-filled first/middle/last parts take effect.
UPDATE employees
   SET full_name = btrim(first_name || ' ' || COALESCE(btrim(middle_name), '') || ' ' || last_name)
 WHERE first_name IS NOT NULL
   AND last_name  IS NOT NULL;

-- Contract dates are entered as Gregorian dates; the Umm al-Qura equivalent is
-- recorded alongside them at entry. The Gregorian pair stays authoritative for
-- coverage arithmetic — the Hijri pair is the human-facing record, stored so it
-- cannot drift if the calendar tables in an application runtime are updated.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS start_date_hijri VARCHAR(10),
  ADD COLUMN IF NOT EXISTS end_date_hijri   VARCHAR(10);

-- Loose shape check only: Hijri years are 4 digits, months 1-12, days 1-30.
ALTER TABLE contracts
  ADD CONSTRAINT chk_contracts_hijri_shape CHECK (
    (start_date_hijri IS NULL OR start_date_hijri ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|30)$')
    AND
    (end_date_hijri   IS NULL OR end_date_hijri   ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|30)$')
  );
