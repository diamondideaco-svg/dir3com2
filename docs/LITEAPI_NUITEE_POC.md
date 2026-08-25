# LiteAPI / Nuitee Stay Provider Sandbox POC

Date: 2026-08-25

## Scope and architecture

LiteAPI is implemented only as a Stay adapter behind the shared DIR3COM Travel Provider layer. No browser route, DABRA component, or customer UI receives provider credentials or provider-specific response objects. Flights remain on the existing Duffel adapter.

### Authentication modes

- Sandbox remains unchanged: `LITEAPI_ENV=sandbox` and `LITEAPI_TEST_API_KEY` send `X-API-Key`.
- Optional HMAC reads require explicit `LITEAPI_AUTH_MODE=hmac` plus server-only `LITEAPI_PUBLIC_API_KEY`, `LITEAPI_PRIVATE_API_KEY`, and `LITEAPI_SHARED_SECRET`.
- HMAC authorization uses a UNIX-seconds timestamp, HMAC SHA-512, the canonical `PublicKey=...,Signature=...,Timestamp=...` header, and a five-minute verification window.
- Booking and cancellation continue to fail closed outside the verified sandbox mutation configuration; enabling HMAC does not enable production writes.

## Official API verification

- Authentication: `X-API-Key` using a server-side sandbox key. Source: https://docs.liteapi.travel/reference/authentication
- Rates: `POST https://api.liteapi.travel/v3.0/hotels/rates`; recommended provider timeout is 6–12 seconds. Source: https://docs.liteapi.travel/reference/post_hotels-rates
- Prebook: `POST https://book.liteapi.travel/v3.0/rates/prebook` with `offerId` and `usePaymentSdk`. Source: https://docs.liteapi.travel/reference/post_rates-prebook
- Book: `POST https://book.liteapi.travel/v3.0/rates/book`; sandbox-safe payment method is `ACC_CREDIT_CARD`; `clientReference` is the provider idempotency reference and duplicate use returns error 4005. Source: https://docs.liteapi.travel/reference/post_rates-book
- Retrieve: `GET https://book.liteapi.travel/v3.0/bookings/{bookingId}`. Source: https://docs.liteapi.travel/reference/get_bookings-bookingid
- Cancel: `PUT https://book.liteapi.travel/v3.0/bookings/{bookingId}`. Non-refundable bookings can finish as `CANCELLED_WITH_CHARGES`. Source: https://docs.liteapi.travel/reference/put_bookings-bookingid
- Errors: stable numeric `error.code` is authoritative; 401 is unauthorized, 4290 is rate-limited, 4011/4016 are supplier/prebook timeouts, and 2001 represents no availability or an expired/unavailable offer depending on the operation. Source: https://docs.liteapi.travel/reference/api-errors-for-hotel-booking-workflow

## Real sandbox coverage evidence

Dates were generated 120 days ahead for one night, two adults, USD, and destination nationality. All searches returned real rates.

| Country | City | Hotels with rates | Normalized rates |
|---|---:|---:|---:|
| Saudi Arabia | Riyadh | 121 | 196 |
| Saudi Arabia | Jeddah | 97 | 164 |
| Saudi Arabia | Dammam | 26 | 33 |
| Saudi Arabia | Madinah | 26 | 44 |
| Saudi Arabia | Makkah | 77 | 124 |
| Egypt | Cairo | 128 | 216 |
| Egypt | Alexandria | 41 | 55 |
| Egypt | Sharm El Sheikh | 107 | 183 |
| Egypt | Hurghada | 121 | 202 |

## Booking lifecycle evidence

One Riyadh sandbox rate completed search, prebook, booking with `ACC_CREDIT_CARD`, booking retrieval, local replay with the identical `clientReference`, cancellation, and final retrieval. The initial booking was `CONFIRMED`; replay returned the same booking without a second provider mutation; cancellation returned `CANCELLED_WITH_CHARGES`; final retrieval returned `CANCELLED`. No production key, payment, booking, or write was used.

## Commercial findings

- Setup fee: not discovered in official sources.
- Monthly minimum: not discovered in official sources.
- Core Rates → Prebook → Book workflow: free under reasonable-use and look-to-book requirements.
- Price-index endpoints: USD 0.05/request; Places endpoints: USD 0.01/request; other core hotel endpoints are free under the stated policy. Source: https://docs.liteapi.travel/reference/api-pricing-usage-costs
- Commission: sellers control `margin`; zero returns net rates and a positive percentage becomes seller commission. Nuitee states there are no hidden platform fees on that commission and confirmed-stay payouts are weekly. Source: https://docs.liteapi.travel/docs/revenue-management-and-commission
- Merchant of record: DIR3COM can be merchant of record when using its own customer-payment layer plus the account credit card. Nuitee's Payment SDK is an alternate customer-payment path. Source: https://docs.liteapi.travel/docs/account-credit-card and https://docs.liteapi.travel/docs/user-payment
- Production activation: the dashboard requires a valid payment method before exposing/enabling production keys. Specific KYC or business-verification requirements were not discovered in official public documentation.

## Retry and replay policy

Search/retrieval reads receive at most one bounded retry for transient network, timeout, or rate-limit failures. Prebook, booking, and cancellation are never blindly retried. Booking replays use the exact same `clientReference`; concurrent or repeated calls are deduplicated locally, while provider error 4005 documents LiteAPI's duplicate-reference guarantee.
