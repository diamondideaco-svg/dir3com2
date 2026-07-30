# DIR3COM Database Guide

## Core Domains
- auth and profiles
- partners and products
- bookings and assignment
- finance and operations
- verification and trust

## Migration Strategy
- Keep migrations idempotent where practical
- Use UUID primary keys for distributed-safe identity
- Prefer explicit foreign keys and cascade rules
- Maintain consistency between app types and DB schema

## Operational Notes
- Environment variables must be configured for runtime Supabase access
- Data should be queried through shared helpers under lib/supabase
