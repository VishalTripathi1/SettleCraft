-- Payment lifetime is fixed at 15 minutes from creation; resends do not extend it.
CREATE INDEX pending_verification_expiry_idx ON transfers(created_at,id)
WHERE status='PENDING_VERIFICATION';
