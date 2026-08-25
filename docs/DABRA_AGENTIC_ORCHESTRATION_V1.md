# DABRA Agentic Travel Orchestration V1

DABRA remains one customer-facing agent on the shared DIR3COM Core. The implementation extends AI2 through `lib/ai2/orchestration` and the existing `/api/ai2/chat` route; it creates no parallel backend and exposes no internal agent personas.

## Flow

Intent parsing → user/tenant-scoped Travel Memory → normalized Trip Plan → capability orchestration → provider abstraction → option comparison/revalidation → explicit action confirmation → sandbox-only execution boundary → Trip Guardian guidance or context-preserving human handoff.

## Safety boundaries

- The ordinary chat route and canonical UI are unchanged. Authenticated callers may request `mode: "travel-plan"` on the same route.
- Fly and Stay adapters use the existing Duffel and LiteAPI normalized foundations when TEST credentials and complete criteria exist.
- Drive and Concierge fail closed when vendor access/entitlement is missing.
- VIP synthetic fixtures are explicitly blocked from public inventory.
- Booking/cancellation/modification/payment actions cannot execute before explicit confirmation. Execution is limited to `test`/`sandbox`; production mutations fail closed.
- Payment is an interface/preparation boundary only and never charges.
- Guardian events do not claim live monitoring.
- Provider errors and content are treated as untrusted and sanitized.
- Knowledge sources default to denied unless canonical, marked safe, and in an allowed authority class.

## Persistence note

`TravelMemoryStore` defines the inspect/update/revoke and ownership contract for request/session memory. It is an in-process implementation for V1 testing and dependency injection; durable long-term memory remains disabled under the existing AI2 memory policy and requires separate storage/retention/security approval.
