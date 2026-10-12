# Task166 protected server binding diagnostic

Order: https://github.com/diamondideaco-svg/dir3com2/issues/166#issuecomment-6009767413

The read-only page /admin/server-binding lives under the existing admin shell. It requires a fresh public-client auth.getUser identity and the existing isCeoActor check (pinned ID, active non-deleted canonical admin profile). A staff/global-admin grant or matching email is insufficient. No privileged database query authorizes the page.

Only after that guard succeeds does the diagnostic obtain the sanitized hostname from getSupabaseAdminHostname in lib/supabase/server.ts. This uses the same getServerSupabaseConfig path as the privileged admin client and requires that client to be configured. It returns no key or raw URL. Malformed URLs, userinfo, non-HTTPS, ports, paths, query and fragment fail closed. The client/browser URL is not evidence.

Rendering waits for connection() and is request-time only. Exact-path headers require private/no-store, CDN no-store, no indexing and no referrer. No use-cache directive, client component, server action, new public API, mutation or provider call is introduced.

Deployment identity uses Vercel's existing server system variables VERCEL, VERCEL_ENV, VERCEL_DEPLOYMENT_ID, VERCEL_URL and VERCEL_GIT_COMMIT_SHA. Missing/invalid identity, or a branch/production alias substituted for the immutable URL, produces a generic unavailable page with no hostname. User headers/query parameters are not inputs. No new binding or setting is required; if system variables are unavailable, report a blocker.

For acceptance, a separate observer must correlate the displayed ID/URL/SHA with supported Vercel get_deployment metadata, and record the time and protected page source. The page attests only that NEW deployment, never old dpl_5ZFKhESsTtQSmx5hfPnyvyNoFSs3. Do not substitute Preview, client configuration or historical labels as Production evidence.

Fresh exact-SHA functional and distinct standard-security review/receipt, required CI and bounded Preview checks precede the authorized code-only release. The existing CEO session must read the protected Production page. Outbound WhatsApp stays OFF before/after. No settings, credentials, classifications, accounts, access grants, SQL, migrations, enrollment, scheduler, webhooks, provider probes or sends are in scope. Task187/PR190 is excluded.

References: installed Next.js connection/cookies/headers/environment documentation; https://vercel.com/docs/environment-variables/system-environment-variables .
