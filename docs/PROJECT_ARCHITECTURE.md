# DIR3COM Project Architecture

## 1. Overview
DIR3COM is a Next.js 16 application for luxury travel and service experiences, structured around a modular frontend, Supabase-backed data services, and a future-ready admin and booking platform.

## 2. System Goals
- Deliver a premium Arabic RTL user experience.
- Keep authentication and API routes stable and isolated.
- Support booking, services, reviews, contact, and admin workflows.
- Prepare for future AI-assisted recommendations and personalization.

## 3. High-Level Architecture
- Frontend: Next.js App Router with TypeScript.
- Styling: Tailwind CSS.
- Data layer: Supabase.
- Server actions and API routes: Next.js route handlers.
- Authentication: Supabase Auth integration.
- Admin and booking operations: server-driven workflows with secure access.

## 4. Folder Structure
- app/: route-level pages and route handlers.
  - app/(auth)/: authentication-related pages.
  - app/api/: API route handlers.
  - app/admin/: administrative area.
  - app/services/: public services pages.
- components/: UI building blocks.
  - components/home/: landing page sections.
  - components/layout/: shell UI such as header and footer.
  - components/shared/: reusable shared UI primitives.
  - components/admin/: admin-specific UI building blocks.
- lib/: shared libraries and integrations.
  - lib/supabase/: Supabase clients for client and server use.
- public/: static assets and branding resources.
- docs/: architecture and product documentation.

## 5. Component Structure
- Page components: route-specific compositions.
- Section components: reusable landing-page or feature blocks.
- Shared UI: buttons, cards, typography, wrappers, and layout primitives.
- Feature components: booking, reviews, services, contact forms, and admin tables.
- Container components: future data-fetching wrappers around UI presentation.

## 6. Data Flow
1. User request enters a Next.js route or API handler.
2. Authentication and role checks are evaluated where needed.
3. Data access is routed through Supabase clients.
4. Server responses are serialized and returned to the UI.
5. UI components render content based on the received state.

## 7. Supabase Architecture
- Client-side Supabase access for public-safe operations.
- Server-side Supabase access for admin and protected workflows.
- Database access should be centralized through service-layer patterns.
- Environment variables must remain strictly scoped to required contexts.

## 8. Core Domain Areas
- Services
- Bookings
- Reviews
- Contacts
- Admin management
- Authenticated user profiles

## 9. Security Rules
- Never expose service-role secrets in client code.
- Enforce role-based access for admin operations.
- Validate user input on both client and server.
- Apply least-privilege database access policies.
- Treat all external data as untrusted.

## 10. Naming Conventions
- Files and folders: lowercase kebab-case for route and utility files.
- Components: PascalCase.
- Functions and hooks: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Database columns: snake_case.

## 11. Coding Standards
- TypeScript-first development.
- Prefer explicit types and shared interfaces.
- Keep business logic separate from UI presentation.
- Use small, composable components.
- Favor readability and maintainability over premature abstraction.

## 12. Future Integrations
- AI recommendations for services and bookings.
- Personalized travel suggestions.
- Analytics dashboards.
- CRM and marketing automation.
- Multi-language expansion beyond Arabic and English.

## 13. AI Architecture
- AI services should be integrated as external capabilities rather than embedded directly in the UI.
- Use AI to assist with recommendations, content generation, and support workflows.
- Maintain human oversight for all booking and operational decisions.

## 14. Booking Architecture
- Booking should follow a clear lifecycle: request, validation, confirmation, updates, and completion.
- Booking state should be persisted in the database and surfaced through role-aware views.
- Admin operations must be able to review, update, and manage bookings safely.

## 15. Admin Architecture
- Admin experiences should be separated from public user flows.
- Admin views should support dashboarding, booking management, contact handling, and service oversight.
- Access control must be enforced before any sensitive action is executed.
