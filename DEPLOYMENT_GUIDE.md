# DIR3COM Deployment Guide

## Local
1. Copy `.env.example` to `.env.local`.
2. Fill in Supabase values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Install dependencies: `npm install`
4. Start locally: `npm run dev`
5. Open `http://localhost:3001`

## Staging
1. Create a staging environment in the hosting provider.
2. Set the same Supabase variables as production, using the staging Supabase project.
3. Build and deploy: `npm run build`
4. Start: `npm run start`
5. Test login, protected routes, booking flow, and admin access.

## Production
1. Configure production environment variables in the host.
2. Ensure the Supabase project has auth enabled and the correct redirect URLs.
3. Deploy the production build.
4. Verify `/login`, `/admin`, `/my-account`, and booking flows.
5. Confirm cookies and redirects work under the production domain.
