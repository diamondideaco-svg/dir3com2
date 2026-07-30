# API Architecture

## 1. API Purpose
The API layer exposes stable endpoints for services, bookings, reviews, contacts, and related admin operations while keeping the UI independent from storage details.

## 2. API Conventions
- Routes live under app/api/.
- Use REST-style handlers for CRUD and list operations.
- Return JSON payloads with predictable structure.
- Use clear error responses and status codes.
- Keep route handlers focused on orchestration rather than database logic.

## 3. Endpoint Groups
### Public Endpoints
- GET /api/services
- GET /api/services/[slug]
- POST /api/contact
- GET /api/reviews

### Protected Endpoints
- POST /api/bookings
- GET /api/bookings
- PATCH /api/bookings/[id]

### Admin Endpoints
- GET /api/admin/dashboard
- GET /api/admin/bookings
- PATCH /api/admin/bookings/[id]

## 4. Request/Response Standards
- Use consistent field naming in English or Arabic depending on the consumer contract.
- Return data objects with metadata for pagination and status when needed.
- Standardize error payloads with code, message, and optional details.

## 5. Validation Strategy
- Validate required request fields.
- Enforce type and format checks.
- Reject invalid or unauthorized requests before interacting with data stores.

## 6. Authentication and Authorization
- Public endpoints must remain unauthenticated where appropriate.
- Protected endpoints must verify the active user session.
- Admin endpoints must enforce role-based authorization.

## 7. Versioning Strategy
- Keep versioning in mind for future API growth.
- Use route-based versioning or a stable contract model if the surface expands significantly.

## 8. Observability
- Log request outcomes and error fingerprints.
- Include monitoring hooks for latency, failed requests, and unusual access patterns.
