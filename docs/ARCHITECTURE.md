# DIR3COM Architecture

## Overview
DIR3COM is a Next.js App Router platform composed of domain-oriented modules for authentication, customers, partners, products, bookings, assignment, finance, operations, verification, and executive administration.

## Principles
- Server Components for data-heavy views
- Server Actions for mutations
- Shared helpers and types in lib
- Domain modules remain modular and reusable
- Admin surfaces are centralized under app/admin

## Structure
- app/: routes and page entry points
- components/: reusable UI building blocks
- lib/: domain services, actions, and shared utilities
- supabase/migrations/: database schema evolution
