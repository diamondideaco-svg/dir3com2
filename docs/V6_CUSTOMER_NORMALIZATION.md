# Customer and Auth visual normalization

Owner: Codex Desktop — Engineer A. PR #103 stays Draft. Start SHA:
`c8fc5606be95aadd0280678e99bf6af6a9fba9e1`.

The CEO's 2026-09-07 final visual order supersedes the previous visual
interpretations in `V6_CUSTOMER_VISUAL_REWORK.md`. This is not a Production release
or CEO visual approval. No Production or UAT business data changes are needed.

## Approved logo preparation

The CEO explicitly authorized deterministic exterior-background removal from
`public/brand/runtime/dir3com-logo-approved.png`, not generation or redesign.

- Source SHA256: `d876c53af6ca01f48a408b6caddcc1416fc3f7245434492d68393cba20db450a`.
- Derivative: `public/brand/runtime/dir3com-logo-transparent.png`.
- Derivative SHA256: `d5c790c45082c50e67aa349bfa361ab59eec0336e2c9a6a3afd4eaf2c7f035c4`.
- Original and derivative canvas: 1536 × 1024. No resampling or cropping of the file.
- The source white field contains encoding noise (253–255 per RGB channel).
  A four-connected boundary flood-fill removes only that exterior white range.
  Enclosed white/light areas remain opaque. All original RGB bytes, including
  antialiased edges, remain exact. Alpha is binary 0/255.
- The shared logo's CSS window excludes only empty outside margins from layout;
  the shield, both taglines and wordmark remain in the window. No frame, card,
  background, glow or shadow is applied to the logo.
- `scripts/prepare-logo-transparency.mjs` reproduces the derivative. Focused
  tests compare every decoded RGB sample and the entire expected alpha mask,
  with an enclosed-white fixture and an explicit unchanged source checksum.

## Shared visual ownership

`CustomerChrome.tsx` and `customer-chrome.module.css` own the Register-master
header/footer family: real links, locale switches, text-size and appearance
controls and the transparent derivative. The latest CEO footer lock below
supersedes the earlier all-white footer interpretation. Register retains its
form, hero and field composition. Protected customer chrome retains
its real identity, role label, navigation, logout and mobile menu callbacks.
Login consumes the same chrome with nonstructural Tajawal/Montserrat and gold-H1
polish. No recovery/reset page exists in the current route tree, so no new flow
is invented. Operational portal shells and the global public header/footer are
unchanged; the route selection adds only `/login` to the customer/auth family.

Customer surfaces use white and near-white pearl (`#f8f9fa`), navy text and
existing gold accents. Functional Auth H1 uses the existing darker gold
`#88601c` for readable contrast. Wallet keeps its original image, focal navy,
labels and disabled unsupported financial actions; surrounding icons are light.

## DABRA and functional invariants

- All eight original DABRA family/compact files remain byte-identical.
- No sidebar DABRA card. Documents/Favorites banners use existing line icons.
- My Account keeps one Customer Service introduction and suppresses the redundant
  launcher on that route. Other protected customer routes retain the existing
  locale-bound, collision-aware launcher and unchanged advisory/chat policy.
- Wallet keeps the original approved wallet reference image; no substitute art.
- Login Success returns to the existing approved runtime panorama layer without
  a detached character. Existing destination/copy is retained, with the CEO's
  exact Arabic sign-off `أزهلني…` styled as a small gold Tajawal signature.
- No query, upload handler, owner policy, bucket, signed URL, session authority,
  OTP handler, payment action, booking classification or favorite persistence
  implementation is changed. Tests retain those contracts.

## Evidence and gates

The local and final automatic immutable Preview require all eight pages × two
locales × desktop/390×844 (32 states), plus Login regression. The evidence index
records source SHA, origin, isolated UAT identity, screenshots and measured
layout/locale/font/density/overlap results. Existing customer data is read only;
no new fixtures, upload, payment, booking or messages are required.

Exact-head cloud CI, Sandbox and independent review are separate gates. They
are not asserted by this pre-push implementation note. The existing missing
favicon remains P2; no approved favicon is generated or substituted.

CEO VISUAL GATE = PENDING. No merge or Production deployment is authorized.

## Latest CEO footer lock and complete review access

Correction starts from `5e8927ff89c1a4a8c42bdb1c896a680ec6955271`.
Only two footer surfaces exist, with identical Company / Services / Contact
markup, real destinations, social links inside Contact, and copyright last:

| Current batch route | Footer surface |
| --- | --- |
| `/register` | Transparent, same continuous approved scene |
| `/auth/verify-email` | Transparent, same continuous approved scene |
| `/login-success` | Transparent, same continuous approved scene |
| `/my-account` | White |
| `/my-bookings` | White |
| `/my-wallet` | White |
| `/my-documents` | White |
| `/favorites` | White |

Register and Verification retain the approved desktop side-by-side composition:
the footer columns are opposite the form and copyright spans below both. Mobile
retains all content in flow. There is no detached white/cream footer box on a
scene and no added footer-logo block absent from the approved reference. The
header and approved transparent logo are unchanged. Account and Wallet contain
localized hero/card images, not full-page scenes; their footer remains white.
No Home, Marketplace, service, policy or operational portal layout is modified.

The final CEO review entry must be a directly openable index with **32 visible
thumbnail links**: eight routes × AR/EN × desktop/390×844. It must state the exact
HEAD and immutable deployment, link the Preview root and all eight routes, and
label any additional evidence separately. A `/register` URL alone is not a
complete batch handoff. Protected live links still require a legitimate UAT
customer session; screenshots provide immediate review without sharing secrets.
CEO VISUAL GATE remains PENDING regardless of automated layout checks.

## Independent-review correction

Review of `194c30a493d06c8cd0093044d987dfe567a35b75` identified a mobile Arabic
Wallet text collision after the taller shared header shifted the hero. The
correction only marks the existing balance section with `data-dabra-avoid`,
using the unchanged canonical placement algorithm. No financial content,
controls, labels, artwork or logic changes. A focused test protects this
informational region; actual mobile screenshots must confirm the quote remains
unobscured. The initial browser footer probe also needed to treat the existing
hidden launcher as hidden, rather than counting its retained bounding box.

The initial exact-head CI passed; Sandbox stopped on the external container
registry rate limit, after PostgreSQL readiness and preliminary replay passed.
Neither that infrastructure failure nor its skipped later steps is a product
test PASS. The corrected final SHA requires its own gates and independent review.
