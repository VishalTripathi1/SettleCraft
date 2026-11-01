ALTER TABLE risk_assessments DROP CONSTRAINT risk_assessments_action_check;
ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_action_check CHECK(action IN ('ALLOW','VERIFY','REVIEW'));
CREATE OR REPLACE FUNCTION enforce_transfer_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.sender_id<>OLD.sender_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.amount<>OLD.amount OR NEW.currency<>OLD.currency OR NEW.reference<>OLD.reference OR NEW.note<>OLD.note THEN RAISE EXCEPTION 'Transfer intent is immutable'; END IF;
 IF NOT ((OLD.status='CREATED' AND NEW.status IN ('PROCESSING','PENDING_REVIEW','PENDING_VERIFICATION','FAILED')) OR (OLD.status='PENDING_VERIFICATION' AND NEW.status IN ('PROCESSING','PENDING_REVIEW','FAILED')) OR (OLD.status='PENDING_REVIEW' AND NEW.status IN ('PROCESSING','PENDING_VERIFICATION','REJECTED','FAILED')) OR (OLD.status='PROCESSING' AND NEW.status IN ('COMPLETED','FAILED'))) THEN RAISE EXCEPTION 'Invalid transfer state transition'; END IF;
 RETURN NEW;
END $$;
-- Move existing amount-only holds to sender verification; never release funds in a migration.
WITH moved AS (
 UPDATE transfers t SET status='PENDING_VERIFICATION',updated_at=now()
 FROM risk_assessments a WHERE a.transfer_id=t.id AND t.status='PENDING_REVIEW' AND t.amount>=1000000
 AND COALESCE((SELECT sum((s->>'points')::int) FROM jsonb_array_elements(a.signals) s WHERE s->>'id'<>'large_amount'),0)<60
 AND NOT EXISTS(SELECT 1 FROM review_decisions d WHERE d.transfer_id=t.id)
 RETURNING t.id
)
INSERT INTO audit_events(action,entity_id,request_id,metadata)
 SELECT 'PAYMENT_VERIFICATION_POLICY_UPDATED',id,'migration-005','{"policy":"2.0","fundsMoved":false}'::jsonb FROM moved;
