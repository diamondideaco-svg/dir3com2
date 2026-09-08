# Register v6 contact contract — PR #103

Register-only closure; no global layout, authorization, database schema or Production changes.

## Contact truth

- Email registration requires a selected calling country and a valid national/international phone number. `libphonenumber-js/max` 1.13.12 validates country-specific numbering plans, including shared calling-code countries. Arabic and Persian digits normalize to ASCII/E.164. Invalid numbers, extensions and country mismatches are rejected.
- The existing `supabase.auth.signUp` writes `full_name` and `registration_contact: { phone_e164, country_code, calling_code }` to Auth user metadata. This is self-reported contact information, **not verified phone identity, nationality, residency, country authorization scope or application authority**.
- No phone OTP/SMS is sent. No `auth.users.phone`, profile, role, grant or existing-user update is performed. Existing account handling remains Supabase Auth's contract.
- Google remains the existing independent OAuth flow. Its button does **not** submit the email form or persist its contact fields. The page explicitly explains this distinction. No OAuth metadata shortcut or client-selected authority is introduced.
- Existing accounts without contact metadata continue to sign in normally. No migration is required. Consumer pages are not changed in this round.

## Visual scope

The CEO approved using the existing standalone DIR3COM background because the exact standalone Register background does not exist. No image generation or new artwork was used. The reference remains v6 PDF page 14, not current Production. The five supplied social destinations are Register-local. A short localized contact/OAuth clarification is functional truth absent from the image; it adds a small amount of panel height. Final visual acceptance remains with the CEO.

## Verification boundaries

Focused tests cover normalization, rejection, metadata authority separation, unchanged OAuth/consent gates, social destinations and hydration-safe country labels. An isolated local Supabase GoTrue v2.195.0 / PostgreSQL 17 proof exercises real signup, fresh-session contact persistence, duplicate account rejection, original contact preservation, legacy login and persisted `auth.users` metadata without verified phone fields. It uses only disposable accounts; email auto-confirm is a local fixture setting, not a deployed change.

Browser checks intercept signup and OAuth navigation; they prove the UI payload/navigation contracts without creating Preview/Production accounts or sending emails. They do not substitute for the isolated real persistence proof. Production signup or Google provider consent completion is not claimed.
