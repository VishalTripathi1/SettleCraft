CREATE TABLE webhook_receipts (
 event_id uuid PRIMARY KEY REFERENCES outbox_events(id),payload_hash text NOT NULL,received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES outbox_events(id),attempt integer NOT NULL,
 status text NOT NULL CHECK(status IN ('DELIVERED','FAILED')),error text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,attempt)
);
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON webhook_receipts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_delivery BEFORE UPDATE OR DELETE ON webhook_deliveries FOR EACH ROW EXECUTE FUNCTION immutable_record();
