# Security Notes

## Authentication
- Use Supabase auth and server-side client helpers.
- Keep secrets in environment variables only.

## Authorization
- Restrict admin routes to trusted roles.
- Validate server action inputs before mutations.

## Operational Security
- Audit logs should be kept for sensitive actions.
- Finance and verification operations should be traceable.
