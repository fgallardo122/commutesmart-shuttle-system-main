CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  openid text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER', 'ADMIN')),
  device_id text,
  status integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stops (
  id integer PRIMARY KEY,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stops_sequence ON stops(sequence);

CREATE TABLE IF NOT EXISTS verification_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  driver_id uuid NOT NULL REFERENCES users(id),
  shuttle_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_logs_verified_at ON verification_logs(verified_at);
CREATE INDEX IF NOT EXISTS idx_verification_logs_user_id ON verification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_driver_id ON verification_logs(driver_id);

CREATE TABLE IF NOT EXISTS shuttle_status (
  shuttle_id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('VALID', 'USED')),
  generated_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  driver_id uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_expires_at ON tickets(expires_at);

INSERT INTO stops (id, name, lat, lng, sequence)
VALUES
  (1, '两岸金融中心地铁站3入口', 24.5123, 118.1812, 1),
  (2, '鼎丰财富中心', 24.5155, 118.1845, 2),
  (3, '海西金融广场', 24.5188, 118.1878, 3),
  (4, '万科云玺', 24.5211, 118.1911, 4)
ON CONFLICT (id) DO NOTHING;
