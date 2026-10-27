CREATE TABLE transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL REFERENCES users(id), recipient_id uuid NOT NULL REFERENCES users(id),
 amount bigint NOT NULL CHECK(amount>0 AND amount<=99999999999), currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=160), reference text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('CREATED','PENDING_REVIEW','PROCESSING','COMPLETED','FAILED','REJECTED')),
 journal_id uuid UNIQUE REFERENCES ledger_journals(id), failure_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(), CHECK(sender_id<>recipient_id),
 CHECK((status='COMPLETED')=(journal_id IS NOT NULL))
);
CREATE INDEX transfers_sender_time ON transfers(sender_id,created_at DESC,id);
CREATE INDEX transfers_recipient_time ON transfers(recipient_id,created_at DESC,id);
CREATE INDEX transfers_status_time ON transfers(status,created_at DESC,id);
CREATE TABLE idempotency_records (
 actor_id uuid NOT NULL REFERENCES users(id),scope text NOT NULL,key text NOT NULL,
 fingerprint text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,scope,key)
);
CREATE TABLE risk_assessments (
 transfer_id uuid PRIMARY KEY REFERENCES transfers(id),score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
 level text NOT NULL CHECK(level IN ('LOW','MEDIUM','HIGH')),action text NOT NULL CHECK(action IN ('ALLOW','REVIEW')),
 rule_version text NOT NULL,signals jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transfer_id uuid NOT NULL UNIQUE REFERENCES transfers(id),reviewer_id uuid NOT NULL REFERENCES users(id),
 decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),rationale text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE topups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),amount bigint NOT NULL CHECK(amount>0 AND amount<=1000000),
 status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK(status IN ('PENDING_REVIEW','COMPLETED','REJECTED')),
 reviewer_id uuid REFERENCES users(id),rationale text,journal_id uuid UNIQUE REFERENCES ledger_journals(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='COMPLETED')=(journal_id IS NOT NULL))
);
CREATE INDEX topups_user_time ON topups(user_id,created_at DESC);
CREATE TABLE reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transfer_id uuid NOT NULL UNIQUE REFERENCES transfers(id),reviewer_id uuid NOT NULL REFERENCES users(id),
 rationale text NOT NULL,journal_id uuid NOT NULL UNIQUE REFERENCES ledger_journals(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reconciliation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES users(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,entity_id uuid NOT NULL,payload jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON outbox_events(next_attempt_at) WHERE delivered_at IS NULL;
CREATE FUNCTION enforce_transfer_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.sender_id<>OLD.sender_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.reference<>OLD.reference OR NEW.note<>OLD.note THEN RAISE EXCEPTION 'Transfer intent is immutable'; END IF;
 IF NOT ((OLD.status='CREATED' AND NEW.status IN ('PROCESSING','PENDING_REVIEW','FAILED')) OR (OLD.status='PENDING_REVIEW' AND NEW.status IN ('PROCESSING','REJECTED','FAILED')) OR (OLD.status='PROCESSING' AND NEW.status IN ('COMPLETED','FAILED'))) THEN RAISE EXCEPTION 'Invalid transfer state transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER transfer_transition BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION enforce_transfer_transition();
CREATE TRIGGER immutable_risk BEFORE UPDATE OR DELETE ON risk_assessments FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON review_decisions FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_reversal BEFORE UPDATE OR DELETE ON reversals FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_reconciliation BEFORE UPDATE OR DELETE ON reconciliation_runs FOR EACH ROW EXECUTE FUNCTION immutable_record();
