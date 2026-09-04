# DABRA dynamic voice engine

## Locked identity

- Voice design: `DABRA Voice Design V1`
- Approved master: `DABRA_VOICE_MASTER_V1.mp3`
- SHA-256: `4AA9AFA4EDDF369FE79E8F597946766C6FBDD8C789DE199DE9A5253EBFE044FB`

The approved master remains outside the web repository. The browser cannot provide a speaker reference, model path, profile override, or provider credential. The server adapter pins the fingerprint above and a server-owned profile identifier.

## Candidate decision

| Engine | License | Arabic + English | Reference cloning | Local result | Production decision |
| --- | --- | --- | --- | --- | --- |
| Coqui XTTS v2 | Coqui Public Model License | Yes | Yes | Generated both proof clips on CPU from the approved MP3 | Development/evaluation only: the model and outputs are non-commercial-only; measured CPU generation was 26.502s AR and 45.154s EN |
| Mistral Voxtral TTS API | Official commercial service terms | Officially documented as 9-language, cross-lingual voice cloning | Saved `voice_id` or one-off `ref_audio` | Not called: `MISTRAL_API_KEY` and an approved `voice_id` are absent | Primary production path, blocked until current-account terms/access and a human voice-match review are proven |
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

The request contains bounded `text`, the fixed model `voxtral-mini-tts-2603`, the server-owned voice ID, output format, a server request ID, locale, and the pinned approved fingerprint in metadata. The route decodes the official API's bounded base64 audio response and returns `audio/mpeg`, at most 8 MiB. Neither provider, voice ID, reference audio, nor model can be supplied by the browser.

POST synthesis requires an authenticated DIR3COM session and is burst-limited. If configuration, authentication, the engine, or the returned audio is invalid, the route fails closed. There is no browser/OS/stock-voice fallback.

## Production commercial and account requirement

Before enabling the official Mistral path, DIR3COM still requires:

1. CEO-authorized access to a Mistral commercial API account with Voxtral TTS and custom voices enabled in the intended region;
2. review and acceptance of the current Commercial Terms, data controls, voice-cloning policy, retention, and any account/plan requirements;
3. explicit rights and consent for uploading and cloning the approved DABRA master;
4. creation of one reusable voice named `dabra-production`, followed by storing only its safe ID as `DABRA_MISTRAL_VOICE_ID`;
5. server-only API-key storage and production rate/cost controls;
6. five Arabic and five English dynamic samples plus independent human identity, pronunciation, pacing, and naturalness approval.

The official API adapter is compatible with Vercel's Node.js runtime, but Production remains disabled until both credential and approved voice ID exist and every commercial/voice-match gate above passes. The downloaded Voxtral weights, if evaluated later, remain development/evaluation-only and are not a commercial Production path. xAI is not used while the Mistral official path remains viable.
