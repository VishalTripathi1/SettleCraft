CREATE TABLE reversal_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL UNIQUE DEFAULT ('RR-' || gen_random_uuid()::text),
 original_transfer_id uuid NOT NULL REFERENCES transfers(id), requester_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(reason IN ('WRONG_RECIPIENT','INCORRECT_AMOUNT','DUPLICATE_PAYMENT','MISTAKE','OTHER')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','FAILED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, decision_reason text,
 reversal_id uuid UNIQUE REFERENCES reversals(id), failure_reason text,
 CHECK((status='APPROVED')=(reversal_id IS NOT NULL)),
 CHECK((status='PENDING')=(reviewed_at IS NULL)),
 CHECK((status='PENDING')=(reviewed_by IS NULL)),
 CHECK(status<>'REJECTED' OR length(decision_reason)>=5),
 CHECK(status<>'FAILED' OR failure_reason IS NOT NULL)
);
CREATE UNIQUE INDEX reversal_request_active ON reversal_requests(original_transfer_id) WHERE status='PENDING';
CREATE INDEX reversal_request_user_time ON reversal_requests(requester_id,created_at DESC,id);
CREATE INDEX reversal_request_status_time ON reversal_requests(status,created_at DESC,id);
CREATE FUNCTION enforce_reversal_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED','FAILED') THEN RAISE EXCEPTION 'Invalid reversal request transition'; END IF;
  IF (NEW.original_transfer_id,NEW.requester_id,NEW.reason,NEW.notes,NEW.reference,NEW.created_at) IS DISTINCT FROM (OLD.original_transfer_id,OLD.requester_id,OLD.reason,OLD.notes,OLD.reference,OLD.created_at) THEN RAISE EXCEPTION 'Request intent is immutable'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM transfers WHERE id=NEW.original_transfer_id AND sender_id=NEW.requester_id AND status='COMPLETED') THEN RAISE EXCEPTION 'Request requires a completed outgoing transfer'; END IF;
 IF NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM reversals WHERE id=NEW.reversal_id AND transfer_id=NEW.original_transfer_id) THEN RAISE EXCEPTION 'Request must link its own financial reversal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reversal_request_transition BEFORE INSERT OR UPDATE ON reversal_requests FOR EACH ROW EXECUTE FUNCTION enforce_reversal_request();
CREATE TRIGGER reversal_request_no_delete BEFORE DELETE ON reversal_requests FOR EACH ROW EXECUTE FUNCTION immutable_record();

ALTER TABLE transfers DROP CONSTRAINT transfers_status_check;
ALTER TABLE transfers ADD CONSTRAINT transfers_status_check CHECK(status IN ('CREATED','PENDING_VERIFICATION','PENDING_REVIEW','PROCESSING','COMPLETED','FAILED','REJECTED'));
CREATE OR REPLACE FUNCTION enforce_transfer_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.sender_id<>OLD.sender_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.reference<>OLD.reference OR NEW.note<>OLD.note THEN RAISE EXCEPTION 'Transfer intent is immutable'; END IF;
 IF NOT ((OLD.status='CREATED' AND NEW.status IN ('PROCESSING','PENDING_REVIEW','PENDING_VERIFICATION','FAILED')) OR (OLD.status='PENDING_VERIFICATION' AND NEW.status IN ('PROCESSING','PENDING_REVIEW','FAILED')) OR (OLD.status='PENDING_REVIEW' AND NEW.status IN ('PROCESSING','REJECTED','FAILED')) OR (OLD.status='PROCESSING' AND NEW.status IN ('COMPLETED','FAILED'))) THEN RAISE EXCEPTION 'Invalid transfer state transition'; END IF;
 RETURN NEW;
END $$;
CREATE TABLE transfer_verifications (
 transfer_id uuid PRIMARY KEY REFERENCES transfers(id), challenge_id uuid NOT NULL,
 code_hash text NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 sends integer NOT NULL DEFAULT 1 CHECK(sends BETWEEN 1 AND 5),
 last_sent_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz,
 delivery_status text NOT NULL DEFAULT 'SENDING' CHECK(delivery_status IN ('SENDING','SENT','FAILED'))
);
CREATE INDEX reversal_time ON reversals(created_at DESC,id);
