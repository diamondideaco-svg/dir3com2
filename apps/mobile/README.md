# DIR3COM Mobile Foundation (DEV-B B1)

This workspace provides the mobile foundation only.

## Scope

- Expo + React Native + TypeScript app shell
- Mobile-safe environment accessor
- Typed API client with timeout and normalized errors
- Core mobile contracts aligned to stabilized web/backend flows

## Commands

Run from repository root:

- `npm run mobile:dev`
- `npm run mobile:typecheck`

Run inside this workspace:

- `npm run start`
- `npm run typecheck`

## Environment (mobile-safe only)

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_SUPABASE_URL` (optional for B1)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (optional for B1)

Never include server-only secrets in mobile runtime.
