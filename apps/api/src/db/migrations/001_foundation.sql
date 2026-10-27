CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
 email text NOT NULL UNIQUE CHECK(email=lower(email)), password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refresh_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 token_hash text NOT NULL UNIQUE, family_id uuid NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_user_idx ON refresh_sessions(user_id);
CREATE TABLE wallets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL UNIQUE REFERENCES users(id),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','FROZEN')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ledger_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid UNIQUE REFERENCES wallets(id),
 category text NOT NULL CHECK(category IN ('WALLET_LIABILITY','SYSTEM_OFFSET')),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 CHECK((category='WALLET_LIABILITY')=(wallet_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_system_offset ON ledger_accounts(category) WHERE category='SYSTEM_OFFSET';
CREATE TABLE ledger_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('DEMO_ISSUANCE','TRANSFER','REVERSAL')),
 reference text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 posting_transaction bigint NOT NULL DEFAULT txid_current(), metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE ledger_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES ledger_journals(id),
 account_id uuid NOT NULL REFERENCES ledger_accounts(id), direction text NOT NULL CHECK(direction IN ('DEBIT','CREDIT')),
 amount bigint NOT NULL CHECK(amount>0 AND amount<=99999999999), currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_account_idx ON ledger_entries(account_id);
CREATE INDEX entries_journal_idx ON ledger_entries(journal_id);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action text NOT NULL,
 entity_id uuid, request_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_time_idx ON audit_events(created_at DESC,id);
CREATE FUNCTION immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
CREATE TRIGGER immutable_entries BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON ledger_journals FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE FUNCTION enforce_open_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ledger_journals WHERE id=NEW.journal_id AND posting_transaction=txid_current()) THEN
 RAISE EXCEPTION 'Cannot append to a committed journal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER entry_open_journal BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION enforce_open_journal();
CREATE FUNCTION enforce_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; entry_count bigint;
BEGIN
 SELECT COALESCE(sum(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END),0),count(*) INTO total,entry_count FROM ledger_entries WHERE journal_id=NEW.id;
 IF entry_count<2 OR total<>0 THEN RAISE EXCEPTION 'Journal must have balanced debit and credit entries'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_balanced_journal();
CREATE VIEW wallet_balances AS
 SELECT w.id AS wallet_id,w.owner_id,w.status,COALESCE(sum(CASE WHEN e.direction='CREDIT' THEN e.amount ELSE -e.amount END),0)::text AS balance
 FROM wallets w JOIN ledger_accounts a ON a.wallet_id=w.id LEFT JOIN ledger_entries e ON e.account_id=a.id GROUP BY w.id;
INSERT INTO ledger_accounts(category) VALUES('SYSTEM_OFFSET');
