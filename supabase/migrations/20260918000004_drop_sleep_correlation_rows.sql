/*
  # Remove the duplicate sleep correlations

  ## Why

  Two detectors were answering the same question about sleep, by different
  methods, into different tables.

  sleepConnections.ts compares a domain's average after good nights against its
  average after bad ones, for mind AND body domains, and writes
  sleep_symptom_connections. docs/methodology.md explains the choice: the
  question ("is this worse after a bad night") is binary, so a two-group mean
  difference answers it better than a coefficient.

  bodyMindConnections.ts, meanwhile, had 'sleep' in its factor list from the day
  it shipped, so it also correlated sleep against every body domain on daily
  averages and wrote domain_connections. The result was two cards for one
  relationship, with nothing on screen to say which to believe — "Joint & muscle
  pain and Sleep tend to move in opposite directions" beside "Joint & muscle
  pain tends to be lower after good sleep" — and no guarantee the two agreed,
  since one thresholds on |r| >= 0.6 with p <= 0.05 and the other on a 1.5-point
  group difference.

  The detector no longer produces these rows, on either app, and both read paths
  filter them. This removes the ones already persisted, which would otherwise
  keep rendering for as long as their 90-day window overlapped the selected
  range.

  ## Scope

  Only body×sleep rows exist to remove: domainConnections.ts pairs active MIND
  domains with each other and never writes sleep, so bodyMindConnections.ts is
  the sole source of a sleep row in this table. Nothing else reads or writes
  them.

  ## Before running

    select count(*) from domain_connections
    where domain_a = 'sleep' or domain_b = 'sleep';

  ## After

  That count is 0, and it stays 0 — the weekly pass no longer writes them.
  sleep_symptom_connections is untouched: it holds the version of this finding
  that is kept.
*/

-- Wrapped so the apply log records what went, since afterwards the count is 0
-- either way and there would be no way to tell a no-op from a large cleanup.
DO $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM domain_connections
  WHERE domain_a = 'sleep' OR domain_b = 'sleep';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'domain_connections: removed % duplicate sleep row(s)', removed;
END $$;
