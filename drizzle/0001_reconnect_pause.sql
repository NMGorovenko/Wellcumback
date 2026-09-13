ALTER TABLE rooms ADD COLUMN pause_revision INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN pause_ack INTEGER NOT NULL DEFAULT 0;
