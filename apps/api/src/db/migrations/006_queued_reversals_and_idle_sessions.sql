ALTER TABLE reversal_requests DROP CONSTRAINT reversal_requests_status_check;
ALTER TABLE reversal_requests ADD CONSTRAINT reversal_requests_status_check CHECK(status IN ('PENDING','QUEUED','APPROVED','REJECTED','FAILED'));
ALTER TABLE reversal_requests ADD COLUMN queued_at timestamptz;
ALTER TABLE reversal_requests ADD CONSTRAINT queued_reversal_time CHECK(status<>'QUEUED' OR queued_at IS NOT NULL);
DROP INDEX reversal_request_active;
CREATE UNIQUE INDEX reversal_request_active ON reversal_requests(original_transfer_id) WHERE status IN ('PENDING','QUEUED');
CREATE INDEX reversal_request_queue ON reversal_requests(queued_at,id) WHERE status='QUEUED';
CREATE OR REPLACE FUNCTION enforce_reversal_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NOT ((OLD.status='PENDING' AND NEW.status IN ('QUEUED','APPROVED','REJECTED','FAILED')) OR (OLD.status='QUEUED' AND NEW.status IN ('APPROVED','FAILED'))) THEN RAISE EXCEPTION 'Invalid reversal request transition'; END IF;
  IF (NEW.original_transfer_id,NEW.requester_id,NEW.reason,NEW.notes,NEW.reference,NEW.created_at) IS DISTINCT FROM (OLD.original_transfer_id,OLD.requester_id,OLD.reason,OLD.notes,OLD.reference,OLD.created_at) THEN RAISE EXCEPTION 'Request intent is immutable'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM transfers WHERE id=NEW.original_transfer_id AND sender_id=NEW.requester_id AND status='COMPLETED') THEN RAISE EXCEPTION 'Request requires a completed outgoing transfer'; END IF;
 IF NEW.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM reversals WHERE id=NEW.reversal_id AND transfer_id=NEW.original_transfer_id) THEN RAISE EXCEPTION 'Request must link its own financial reversal'; END IF;
 RETURN NEW;
END $$;
CREATE VIEW wallet_spendable_balances AS
 SELECT b.*,COALESCE(q.total,0)::text AS reversal_obligation,
 GREATEST(0,b.balance::numeric-COALESCE(q.total,0))::text AS available_balance,
 LEAST(GREATEST(0,b.balance::numeric),COALESCE(q.total,0))::text AS reserved_balance,
 COALESCE(q.count,0)::int AS queued_reversals
 FROM wallet_balances b LEFT JOIN (
 SELECT t.recipient_id,sum(t.amount) AS total,count(*) AS count FROM reversal_requests r JOIN transfers t ON t.id=r.original_transfer_id
 WHERE r.status='QUEUED' GROUP BY t.recipient_id
 ) q ON q.recipient_id=b.owner_id;
ALTER TABLE refresh_sessions ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
