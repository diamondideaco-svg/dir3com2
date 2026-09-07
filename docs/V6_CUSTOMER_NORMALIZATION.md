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
controls, white backgrounds and the transparent derivative. Register retains its
form, hero and field composition; the footer stays in its original composition
slot, using the now-approved white treatment. Protected customer chrome retains
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
