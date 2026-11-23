ALTER TABLE upload_tickets ADD COLUMN reservation_active INTEGER NOT NULL DEFAULT 1;
UPDATE upload_tickets SET reservation_active=0 WHERE state IN ('complete','cancelled','expired','cleaned');
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1));
