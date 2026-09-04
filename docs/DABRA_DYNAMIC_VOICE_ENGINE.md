# DABRA dynamic voice engine

## Locked identity

- Voice design: `DABRA Voice Design V1`
- Approved master: `R0_APPROVED_MASTER.mp3`
- SHA-256: `4AA9AFA4EDDF369FE79E8F597946766C6FBDD8C789DE199DE9A5253EBFE044FB`

The approved master remains outside the web repository. The browser cannot provide a speaker reference, model path, profile override, or provider credential. The server adapter pins the fingerprint above and a server-owned profile identifier.
The approved saved voice identifier is fixed to `ae29537c-c796-4fb5-9f5b-da1e02176a5d`; another configured identifier fails closed rather than selecting a different speaker.

## Candidate decision

| Engine | License | Arabic + English | Reference cloning | Local result | Production decision |
| --- | --- | --- | --- | --- | --- |
| Coqui XTTS v2 | Coqui Public Model License | Yes | Yes | Generated both proof clips on CPU from the approved MP3 | Development/evaluation only: the model and outputs are non-commercial-only; measured CPU generation was 26.502s AR and 45.154s EN |
| Mistral Voxtral TTS API | Official commercial service terms | Officially documented as 9-language, cross-lingual voice cloning | Saved `voice_id` or one-off `ref_audio` | Paid API access active; saved `dabra-production` voice created; five Arabic and five English saved-voice samples generated successfully | Primary commercial path; enabled on the PR Preview only, with Production configuration intentionally deferred |
| Chatterbox Multilingual | MIT | Yes | Yes | Not installed or identity-qualified in the current environment | Not selected after the Mistral official API correction |
| OpenVoice v2 | MIT | English plus five other native languages | Yes | Not installed | Not selected: Arabic is not a native V2 language |

Primary references:

- XTTS v2 model card and license: <https://huggingface.co/coqui/XTTS-v2>
- Mistral Voxtral TTS overview: <https://docs.mistral.ai/studio/audio/overview>
- Mistral voice profiles: <https://docs.mistral.ai/studio/audio/text_to_speech/voices>
- Mistral speech API: <https://docs.mistral.ai/api/endpoint/audio/speech>
- Mistral commercial terms: <https://legal.mistral.ai/terms/commercial-terms-of-service/>
- Chatterbox supported languages and MIT repository: <https://github.com/resemble-ai/chatterbox>
- OpenVoice v2 supported languages and MIT repository: <https://github.com/myshell-ai/OpenVoice>

This is an engineering compatibility record, not legal advice. Commercial use must remain disabled until the selected model weights and all transitive assets are verified under the intended deployment terms.

## Proof artifacts

Development-only proof output is not committed. The local manifest records the exact input fingerprint, texts, settings, duration, peak, and hashes. Successful synthesis is not approval: both clips still require independent human speaker-identity and pronunciation review.

## Server contract

DIR3COM calls one provider-neutral `VoiceProvider` abstraction. The concrete Mistral adapter uses the fixed official `https://api.mistral.ai/v1/audio/speech` endpoint and these server-only values:

- `MISTRAL_API_KEY`
- `DABRA_MISTRAL_VOICE_ID`
- optional `DABRA_VOICE_TIMEOUT_MS` (bounded to 3–30 seconds)

The request contains bounded `text`, the fixed model `voxtral-mini-tts-2603`, the server-owned voice ID, output format, a server request ID, locale, and the pinned approved fingerprint in metadata. Immediately before the upstream JSON is created, an exact standalone visible token `dir3com` is normalized for speech to `درعكم` in both languages. URLs, email addresses, paths, code, handles, hashtags, and identifier-like near matches are not rewritten. The route decodes the official API's bounded base64 audio response and returns `audio/mpeg`, at most 8 MiB. Neither provider, voice ID, reference audio, nor model can be supplied by the browser.

POST synthesis requires an authenticated DIR3COM session and is burst-limited. If configuration, authentication, the engine, or the returned audio is invalid, the route fails closed. There is no browser/OS/stock-voice fallback.

An already-aborted request is rejected before authentication quota is consumed or Mistral is called. Mid-flight cancellation is relayed to the upstream request and is never retried or reclassified as a provider failure. Long visible answers remain complete in the conversation; optional playback plans a maximum of four sequential segments of at most 800 UTF-16 units each (3,200 planned spoken units total), preferring sentence boundaries and then whitespace without splitting a word, URL, identifier, or surrogate pair. Only one synthesis request and one audio element may be active, and a locale, response, identity, navigation, or user cancellation stops the current resource and all remaining segments.

## Commercial activation status

The official Mistral path was activated for the PR Preview on 2026-09-04 with the following controls:

1. the CEO-authorized Mistral account is on the active pay-as-you-go plan with custom voices enabled;
2. one reusable voice named `dabra-production` was created from the fingerprint-locked approved master;
3. only the safe voice ID is configured as branch-scoped `DABRA_MISTRAL_VOICE_ID` on the PR Preview;
4. `MISTRAL_API_KEY` remains server-only and is never returned to the browser or committed;
5. five Arabic and five English dynamic samples were generated through the saved voice ID;
6. the PR Preview returned successful authenticated speech responses in Arabic and English with no browser or OS speech fallback.

The safe saved voice identifier is `ae29537c-c796-4fb5-9f5b-da1e02176a5d`. Production remains disabled until the PR is independently reviewed and the Production environment is explicitly authorized and configured. The downloaded Voxtral weights, if evaluated later, remain development/evaluation-only and are not a commercial Production path. xAI is not used while the Mistral official path remains viable.
