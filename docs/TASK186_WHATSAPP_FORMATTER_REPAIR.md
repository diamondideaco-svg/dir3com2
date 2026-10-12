# Task186: bounded WhatsApp formatter repair

The existing formatter accepts only `family` and `language` query keys and at most two entries. The canonical Cairo catalogue links also carry `destination=cairo` and `pickup=cairo`; offer links add `offer=<published-id>`. Those links therefore lose their URLs while their labels remain visible.

`scripts/kapso/task186-whatsapp-formatter.cjs` is a standalone, reviewed-source repair candidate for the external formatter. It is not imported into the Web application and does not activate or update a provider. Web continues to return its established Markdown link format. No HTTP channel selector, request protocol, identity binding, storage policy, credential or sending behavior changes.

## Permitted destinations

The HTTPS origin remains exactly `https://www.dir3com.com`. Existing `/support` and the Drive/Stay marketplace families remain permitted. Marketplace accepts at most five unique keys:

- `family`: `dir3-drive` or `dir3-stay`.
- `language`: `ar` or `en`; omitted from output according to the previous policy.
- `destination`: only the observed `cairo` prefill.
- `pickup`: only `cairo`, for Drive.
- `offer`: only for Drive, and only the 30 IDs frozen from the published catalogue source.

Destination, pickup and offer parameters survive in the output. Offer membership identifies a catalogue entry; it does not confirm supplier availability, price, a request or a booking. The snapshot must be reviewed when the catalogue changes.

Unknown or repeated keys, encoded or malformed values, foreign origins, userinfo, ports, fragments, backslashes and dot segments remain rejected. Arbitrary raw URLs still disappear, images remain labels and Arabic joining/emoji behavior stays intact. The truncation check recognizes actual approved URL tokens so the ellipsis remains on a separate line; URLs are not cut mid-token.

This narrow patch still rejects dates, currency, mode, passenger/guest/room parameters and cities other than Cairo. Such links are not claimed fixed. Extending the policy requires review of their per-key and family semantics rather than silently dropping preferences or allowing arbitrary queries.

## Repeatable local verification

After installing the repository's locked dependencies:

```sh
node --import tsx --test --test-concurrency=1 tests/task186-kapso-formatter.test.ts tests/dabra-platform-character.test.ts
npm run typecheck
npm run lint
npm run build
```

The pre-fix formatter is a sanitized test fixture at `tests/fixtures/kapso/task186-whatsapp-formatter-before.cjs`. Its local header and CommonJS export make the supplied function excerpt executable in tests; it contains no provider IDs, secrets, customer data or live configuration. Tests reproduce the original failure, cover all 30 IDs, execute the actual AR/EN Web POST through the repaired formatter with network forbidden, retain hostile-input filtering, and check output limits from 0 through 1100.

An offline build may use a separately verified snapshot of the same actual Google font files with the framework's process-only test loader and `npm run build -- --webpack`. Any such result must be reported as a conditional local build with its font provenance; it is not online-font or Production verification. No snapshot or machine-specific loader path is committed here.

## Application gates

1. Independent review must target the final exact SHA and distinguish functional and security coverage.
2. An authorized operator must compare a fresh complete external function revision against the reviewed original excerpt and keep a rollback copy. Source drift requires re-review.
3. Only the reviewed destination-policy constant/function and URL-token truncation change may be applied. The local CommonJS export must not be copied into the external wrapper.
4. The complete observer must be tested offline with every I/O mocked: formatting before hashing/storage, exact stored and sent body/hash, prepared-to-dispatching once, response-variable assignment and no send on drift. The complete wrapper has not been executed here because its Library transfer was inaccessible; the formatter/API tests do not replace those checks.
5. Provider update and real delivery require separate authorization. Neither tests nor a repository merge prove WhatsApp delivery. No provider update, message send or Production deployment is part of this change.

Private execution receipts, local paths, transfer metadata, font snapshots and build logs remain outside the source tree.
