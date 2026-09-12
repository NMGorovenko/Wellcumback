CREATE TABLE rooms (
  code TEXT PRIMARY KEY NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity IN (2, 3)),
  snapshot TEXT,
  snapshot_seq INTEGER NOT NULL DEFAULT 0,
  epoch INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  closed_at INTEGER
);
--> statement-breakpoint
CREATE TABLE room_members (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  left_at INTEGER,
  PRIMARY KEY (room_code, slot),
  UNIQUE (token_hash)
);
--> statement-breakpoint
CREATE TABLE room_frames (
  room_code TEXT NOT NULL,
  slot INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  epoch INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, slot, seq),
  FOREIGN KEY (room_code, slot) REFERENCES room_members(room_code, slot) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX rooms_expiry_idx ON rooms(expires_at);
