# Symetric — Internal Terms Glossary

> Terms a reviewer unfamiliar with the domain might misread as bugs or dead code. Do not "fix" or remove these without understanding what they are.

---

## Database fields

| Term | Where | What it is | What it's NOT |
|---|---|---|---|
| `sort_weight` | `detected_clusters` | Internal priority weight computed by `calculateSortWeight()` in `src/utils/priorityScoring.ts`. Controls display ordering. | Never shown to users. Not a severity label. |
| `severity_score` | `detected_clusters` | Internal magnitude value used for sorting. For `baseline_shift` clusters, intentionally rendered as "shifted by X points" (observable shift magnitude). | For all other cluster types: internal only. |
| `strength` | `domain_connections` | Pearson r-value (0–1). Stored for consistency checks. Never surfaced in UI. | Not a quality rating. |
| `high_despite_poor_sleep` | `detected_clusters` | Boolean enrichment flag: `true` when energy is elevated despite poor sleep scores. Used as a priority-scoring bonus. | Never shown to users. |
| `improved_with_sleep` | `detected_clusters` | Boolean: `true` when pattern improved after sleep scores improved. Internal enrichment. | Never shown to users. |
| `is_current` | `baselines` | Flag marking the active baseline row per user. Multiple historical baseline rows exist per user; only `is_current = true` is used for detection. | Not a status field — it means "this is the one to use". |
| `scheduled_date` | `check_ins` | The user's **local date** for a check-in (e.g. `2026-06-15`). Used for grouping, history, and gap detection. | Not a UTC date. Not interchangeable with `scheduled_at`. |
| `scheduled_at` | `check_ins` | The UTC timestamp when the notification should fire. Used for push delivery. | Not safe for date-grouping — timezone-sensitive. |
| `symptom_summary_enabled` | `profiles` | Feature flag for WP4 (symptom descriptors in PDF). Default `false`. Requires clinical sign-off before enabling. | Not a user preference — a safety gate. |
| `moves_together` | `domain_connections` | Boolean: `true` = positive correlation, `false` = inverse. The only correlation direction the UI uses. | Not "they're causally linked". |

---

## Cluster types (detected_clusters.cluster_type)

| Value | Meaning |
|---|---|
| `sustained_deviation` | Domain has been consistently above or below baseline for several days |
| `intraday_volatility` | Domain swings sharply within a single day |
| `rapid_cycling` | Mood alternates direction repeatedly over several days |
| `expiry_correlated` | Pattern correlated with check-in expiry/missed check-ins |
| `baseline_shift` | The user's baseline itself has moved; a new normal is emerging |

---

## Feature flags / WP labels

| Label | What it is |
|---|---|
| WP1 | User-driven pairwise correlation explorer (`ExploreConnectionCard`, `ExploreConnectionSheet`, `computeConnection.ts`) |
| WP2 | Pinned connections (`pinned_connections` table, `PinnedConnectionsSection.tsx`) — soft cap of 5 |
| WP3 | `CausationNote.tsx` — mandatory muted note on all connection surfaces |
| WP4 | Symptom descriptors in PDF report (`symptomDescriptors.ts`) — gated on `symptom_summary_enabled` |

---

## Other terms

| Term | Meaning |
|---|---|
| **Domain** | One of the 8 tracked mental health areas: mood, energy, anxiety, concentration, irritability, social_battery, sensory_sensitivity, motivation |
| **Marker / Intervention marker** | An event annotation (medication started/stopped/changed, therapy session, life event, cycle phase) stored in `intervention_markers` |
| **Baseline** | The rolling median of a user's scores for a given domain, used as the reference point for "higher/lower than usual" |
| **Gap recovery** | `GapRecoverySheet.tsx` — lets users back-fill check-ins after a multi-day gap |
| **Adaptive scheduling** | `src/lib/adaptiveScheduler.ts` — adjusts check-in timing based on completion patterns |
| **DND window** | Do-Not-Disturb window; push notifications are suppressed during the user's configured hours |
| **Simplified colours** | `profiles.simplified_colors = true` renders all domain bars as a single indigo colour instead of per-domain colours |
| **Comfort mode** | `profiles.comfort_mode = true` — uses Lexend font and slightly adjusted UI for readability |
| **Pinned connection** | A user-pinned domain pair (from WP2) that gets re-evaluated weekly via `patternDetectionScheduler` |
