# Migration reconciliation — metadata inspection 2026-10-29

All 58 tracked Supabase SQL files were inventoried against full available migration statements and current production/staging catalogs. See the adjacent JSON for every file, every recorded version/checksum, function body signal, table existence signal and unresolved state. No history rows were inserted, deleted or repaired. Metadata cannot reconstruct exactly when unrecorded SQL was applied.

## Exact recorded SQL matches

CRLF and outer whitespace are normalized; SQL semantics are not guessed. The repository machine_evidence_private_storage SQL matches production 20261027074551, field_command_outbox matches production 20261027074604, and field_command_actor_scope matches production 20261027074619 and staging 20261027062951. The different version strings do not indicate missing effects.

Staging canonical_guards matches repository SQL at recorded version 20261028020041, internal_rate_limit_grants at 20261028063507, private_realtime_guard at 20261028073807, and recovered definer_hardening at 20261029074910. Legacy technician_region_write_migration and technician_national_read_admin_session also have exact statement matches under differently named/versioned staging records.

Roadmap and replacement migrations have matching current function bodies and created tables in both environments, but their repository statements do not exactly match the recorded historical SQL. This establishes current object evidence, not a license to mark their source versions applied. The earlier field_command_outbox function is superseded by the actor-scope migration. The earlier admin-session helper is superseded by canonical_guards. Production lacks the three latest definer-hardening postconditions; do not apply the entire missing-history list.

## Current schema comparison before this patch's staging acceptance

Both environments match for 27 tables, 299 columns including defaults/nullability, 120 public/internal/Auth/Storage/Realtime policies, all inspected constraints and all inspected indexes. Staging has one extra synthetic-profile trigger. Functions differ by three substantive definitions, seven ACLs, 31 pg_trgm extension functions present only in production, and two staging-only helper/event-trigger functions. CRLF-only differences were excluded from substantive drift.

Ten table ACLs differ; full baseline values are in environment-verification-20261029.json. Staging grants authenticated more direct table privileges on several internal/session/sync tables. RLS policy equality does not prove these ACL differences harmless. Validate actual role behavior before deciding whether to revoke each privilege. Do not copy staging ACLs onto production.

Production has pg_trgm 1.6 in public; staging does not. Other inspected extensions match. The same SQL behavior under different extension availability has not been established. pg_trgm must not be moved or installed in production as part of reconciliation.

## Safe resolution

Keep history unchanged. Run the checked-in canonical security sequence and negative authorization checks on approved staging, preserving existing rows in one transaction. Re-read the resulting function/ACL metadata and advisors. For production, review only the minimal forward delta, take a verified recovery backup, obtain explicit production approval, then apply transactionally and verify the deployed revision and actual authenticated flows. Recording source versions as applied requires an independently reviewed statement-to-postcondition mapping, not just the matching tables listed above.

This pass completes the inventory/comparison exercise; unknown historical execution remains explicitly unknown. It does not establish an 8/10 security rating or full equivalence of runtime behavior.
