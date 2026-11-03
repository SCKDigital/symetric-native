-- Symetric Production Database Verification Script
-- Run in Supabase SQL Editor after deploying migrations

-- ── 1. All expected tables present ───────────────────────────────────────────
SELECT 'Tables' AS check_name,
  table_name,
  CASE
    WHEN table_name IN (
      'profiles', 'check_in_settings', 'check_ins', 'baselines',
      'sleep_logs', 'detected_clusters', 'context_tags', 'circadian_patterns',
      'domain_connections', 'sleep_symptom_connections',
      'completion_patterns', 'scheduling_preferences', 'scheduling_suggestions',
      'intervention_markers', 'milestones_achieved', 'push_subscriptions'
    ) THEN '✅'
    ELSE '⚠️ unexpected'
  END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ── 2. RLS enabled on every table ────────────────────────────────────────────
SELECT 'RLS' AS check_name,
  tablename,
  CASE WHEN rowsecurity THEN '✅ enabled' ELSE '❌ DISABLED' END AS status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ── 3. Tier 1 columns on detected_clusters ──────────────────────────────���────
SELECT 'Tier1 columns' AS check_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'detected_clusters'
  AND column_name IN (
    'data_points_used', 'data_points_expected', 'data_quality',
    'avg_sleep_during_pattern', 'improved_with_sleep',
    'high_despite_poor_sleep', 'sort_weight'
  )
ORDER BY column_name;
-- Expected: 7 rows

-- ── 4. domain_connections constraints ────────────────────────────────────────
SELECT 'DC constraints' AS check_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'domain_connections'
  AND constraint_type IN ('CHECK', 'UNIQUE', 'PRIMARY KEY')
ORDER BY constraint_type, constraint_name;

-- ── 5. Tier 2 table columns ───────────────────────────────────────────────────
SELECT 'Tier2 columns' AS check_name,
  table_name,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_name IN (
  'completion_patterns', 'scheduling_preferences', 'scheduling_suggestions'
)
GROUP BY table_name
ORDER BY table_name;
-- Expected: completion_patterns=8, scheduling_preferences=9, scheduling_suggestions=9

-- ── 6. Policy count per table ─────────────────────────────────────────────────
SELECT 'Policies' AS check_name,
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ── 7. Indexes on new tables ──────────────────────────────────────────────────
SELECT 'Indexes' AS check_name,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'domain_connections', 'sleep_symptom_connections',
    'completion_patterns', 'scheduling_suggestions',
    'intervention_markers'
  )
ORDER BY tablename, indexname;

-- ── 8. Edge functions healthy (check pg_cron jobs exist) ──────────────────────
SELECT 'Cron jobs' AS check_name,
  jobname,
  schedule,
  active
FROM cron.job
ORDER BY jobname;
