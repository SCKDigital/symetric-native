/*
  # Allow a user to delete their own profile row

  ## Why

  `profiles` has RLS enabled with SELECT, INSERT and UPDATE policies, but has
  never had a DELETE policy. Postgres does not error on a blocked delete — the
  statement simply matches zero rows, and PostgREST returns success.

  DeleteAllSheet (web) and its native counterpart run:

      delete check_ins, sleep_logs, detected_clusters,
             context_tags, baselines, check_in_settings   -- these succeed
      delete profiles                                     -- silently deletes 0 rows
      signOut()                                           -- reports success

  Deleting the profile row is also what the rest of the schema depends on:
  appointments, intervention_markers, domain_connections,
  sleep_symptom_connections, circadian_patterns, milestones_achieved,
  pinned_connections and scheduling_preferences all reference profiles(id)
  ON DELETE CASCADE, and body_checkins, body_pain_sites, body_event_sites and
  the push-token tables cascade from auth.users(id).

  So with the delete blocked, the cascade never fires. "Delete all data and
  account" — labelled "Permanent. Cannot be undone." — was removing the
  mind-tracking history while leaving behind the identity record (email,
  display_name, date_of_birth, consent_ip_address, report_display_name), every
  body check-in, every marker, every appointment and every prepare question.

  ## What this does

  Adds the missing DELETE policy, scoped the same way as the existing three:
  a user may delete their own row and no other.

  ## What this does NOT do

  It does not delete the auth.users row. Nothing in either app does — a client
  cannot, and no edge function attempts it. After this migration the profile
  and all cascading data are removed, but the login itself survives, so the
  email cannot be reused to sign up again. Closing that gap needs a
  service-role edge function calling auth.admin.deleteUser, which is a
  separate change.

  ## Verifying

  Before:  select cmd, policyname from pg_policies where tablename = 'profiles';
           -> SELECT, INSERT, UPDATE only

  After:   the same query also returns DELETE.
*/

DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (id = (select auth.uid()));
