/*
  # Domain Connections — April 2026

  Stores detected correlations between symptom domain pairs.
  Detection runs weekly via the pattern scheduler and uses raw check-in data
  (not daily averages) with Pearson correlation + p-value filtering.

  ## Design notes
  - domain_a < domain_b enforced by CHECK to prevent duplicate pairs
  - UNIQUE on (user_id, domain_a, domain_b, window_start) allows upsert per window
  - strength is INTERNAL ONLY — never shown to users
  - consistent_pattern = detected in this window AND the previous 30-day window
    with the same direction and similar strength (within ±0.15)
*/

CREATE TABLE IF NOT EXISTS domain_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  domain_a           text NOT NULL,
  domain_b           text NOT NULL,
  moves_together     boolean NOT NULL,          -- true = positive correlation, false = negative
  strength           numeric(5,4) NOT NULL,      -- absolute Pearson r value (internal only, never shown)
  sample_size        integer NOT NULL,            -- number of overlapping check-ins used
  window_start       date NOT NULL,
  window_end         date NOT NULL,
  consistent_pattern boolean NOT NULL DEFAULT false, -- same direction+strength in previous window
  detected_at        timestamptz NOT NULL DEFAULT now(),

  -- Enforce alphabetical ordering to prevent (mood,energy) and (energy,mood) as separate rows
  CONSTRAINT domain_connections_alpha_order CHECK (domain_a < domain_b),
  -- One row per user per domain pair per detection window
  CONSTRAINT domain_connections_unique_window UNIQUE (user_id, domain_a, domain_b, window_start)
);

-- RLS
ALTER TABLE domain_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domain_connections_select_own"
  ON domain_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "domain_connections_insert_own"
  ON domain_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "domain_connections_update_own"
  ON domain_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "domain_connections_delete_own"
  ON domain_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Efficient lookup by user, ordered by recency
CREATE INDEX idx_domain_connections_user_detected
  ON domain_connections(user_id, detected_at DESC);

-- Efficient consistency window check
CREATE INDEX idx_domain_connections_pair_window
  ON domain_connections(user_id, domain_a, domain_b, window_start);
