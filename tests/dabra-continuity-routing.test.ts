import assert from 'node:assert/strict';
import test from 'node:test';
import { ContinuityContext } from '../lib/dabra/continuity-context';
import { continuityChatTripFresh, continuityRequestLocale, parseContinuityChatTrip } from '../lib/dabra/continuity-chat';
import { buildPlatformAssistantResponse, platformContext, platformEntry } from '../lib/dabra/platform-assistant';
import { newTripRequested } from '../lib/dabra/trip-routing';
import type { ContinuitySnapshot } from '../lib/dabra/continuity-service';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
const now = Date.parse('2026-10-06T00:00:00Z');
const trip: SavedTrip = { id: '11111111-1111-4111-8111-111111111111', origin: 'Cairo', destination: 'Riyadh', startDate: '2026-12-12', endDate: '2026-12-14', adults: 2, children: 0, rooms: 1, budget: 5000, currency: 'EUR', families: ['stay'] };
const state: ContinuitySnapshot = { revision: 1, generation: 0, consentEnabled: true, consentVersion: 'task187-v1', preferences: null, preferencesExpiresAt: null, trip, tripExpiresAt: '2027-01-01T00:00:00Z', updatedAt: null };
const params = (message: string, context: ContinuityContext, locale: 'ar'|'en') => new URL(platformEntry('stay', platformContext(message, [], context.trip), locale, 'USD', context.trip), 'https://dir3com.com').searchParams;

for (const locale of ['ar','en'] as const) {
  for (const [origin, destination, expected] of [['Cairo','Riyadh','riyadh'], ['Dubai','Jeddah','jeddah'], ['القاهرة','الرياض','riyadh']] as const) {
    test(`${locale} structured ${origin} to ${destination} survives hotels, rooms, guests and origin-only followups`, () => {
      const context = new ContinuityContext();
      context.capture('user:A', { ...state, trip: { ...trip, origin, destination } }, false, true);
      // Opposite text order must never enter the typed routing path.
      context.draft = `stay ${destination} from ${origin}`;
      context.refine(locale === 'en' ? 'Show me hotels' : 'اعرض الفنادق');
      const initial = params(locale === 'en' ? 'Show me hotels' : 'اعرض الفنادق', context, locale);
      assert.equal(initial.get('destination'), expected);
      assert.equal(initial.get('checkIn'), '2026-12-12');
      assert.equal(initial.get('checkOut'), '2026-12-14');
      assert.equal(initial.get('adults'), '2');
      context.refine(locale === 'en' ? '2 rooms' : '٢ غرف');
      assert.equal(params(locale === 'en' ? '2 rooms' : '٢ غرف', context, locale).get('rooms'), '2');
      context.refine(locale === 'en' ? '3 adults from Cairo' : '٣ اشخاص من القاهرة');
      const followup = params(locale === 'en' ? '3 adults from Cairo' : '٣ اشخاص من القاهرة', context, locale);
      assert.equal(followup.get('destination'), expected);
      assert.equal(followup.get('adults'), '3');
      assert.equal(followup.get('rooms'), '2');
      assert.equal(context.trip?.budget, 5000); assert.equal(context.trip?.currency, 'EUR');
      assert.equal(trip.destination, 'Riyadh', 'saved snapshot remains immutable');
    });
  }
  test(`${locale} explicit destination corrections persist with unchanged origin`, () => {
    const context = new ContinuityContext(); context.capture('user:A', state, false, true);
    context.refine(locale === 'en' ? 'Instead in Jeddah' : 'بدلا من ذلك في جدة');
    assert.equal(context.trip?.origin, 'Cairo');
    assert.equal(params('2 rooms', context, locale).get('destination'), 'jeddah');
    context.refine('2 rooms');
    assert.equal(params('hotels', context, locale).get('destination'), 'jeddah');
  });
  test(`${locale} free text roles work in either order; ambiguous city pairs request clarification`, () => {
    for (const message of locale === 'en' ? ['hotels in Riyadh from Cairo', 'from Cairo hotels in Riyadh'] : ['فنادق في الرياض من القاهرة', 'من القاهرة فنادق في الرياض']) {
      assert.equal(new URL(platformEntry('stay', message, locale), 'https://dir3com.com').searchParams.get('destination'), 'riyadh');
    }
    const ambiguous = locale === 'en' ? 'hotels Cairo Riyadh' : 'فنادق القاهرة الرياض';
    const answer = buildPlatformAssistantResponse(ambiguous, [], locale).answer;
    assert.match(answer, locale === 'en' ? /Which city/ : /أي مدينة/);
    assert.doesNotMatch(answer, /destination=/);
    const carried = buildPlatformAssistantResponse(ambiguous, [{role:'user',content:'hotels in Dubai'}], locale).answer;
    assert.doesNotMatch(carried, /destination=/);
    assert.equal(new URL(platformEntry('stay', locale === 'en' ? 'hotels Riyadh' : 'فنادق الرياض', locale), 'https://dir3com.com').searchParams.get('destination'), 'riyadh');
  });
}

test('locale uses a valid applied preference and falls back to UI for absent/invalid preference', () => {
  assert.equal(continuityRequestLocale({replyLanguage:'ar'},'en'),'ar');
  assert.equal(continuityRequestLocale({replyLanguage:'en'},'ar'),'en');
  for (const replyLanguage of [undefined, null, 'fr', 'EN', 1]) assert.equal(continuityRequestLocale({replyLanguage},'ar'),'ar');
  assert.equal(continuityRequestLocale(null,'en'),'en');
});

test('revoke, delete, expiry, revised source and account switch detach all typed routing state', () => {
  for (const changed of [null, {...state, consentEnabled:false, generation:1, trip:null,tripExpiresAt:null}, {...state,revision:2,trip:null,tripExpiresAt:null}, {...state,tripExpiresAt:new Date(now).toISOString()}, {...state,revision:2}]) {
    const context = new ContinuityContext();context.capture('user:A',state,false,true);
    assert.equal(context.isFresh('user:A',changed,now),false);
    context.forget(); assert.equal(context.trip,null); assert.equal(context.draft,null);
    assert.equal(params('hotels',context,'en').get('destination'),null);
  }
  const context = new ContinuityContext();context.capture('user:A',state,false,true);
  assert.equal(context.isFresh('user:B',state,now),false);context.clear([]);assert.equal(context.trip,null);
  for(const message of ['new trip','start over','رحلة جديدة','ابدأ من جديد'])assert.equal(newTripRequested(message),true);
});

test('server continuity envelope rejects malformed and stale leases without granting account authority', () => {
  const input = parseContinuityChatTrip({revision:1,generation:0,trip});assert.ok(input);
  assert.equal(continuityChatTripFresh(input,state,now),true);
  for(const changed of [{...state,revision:2}, {...state,generation:1}, {...state,consentEnabled:false}, {...state,trip:null}, {...state,tripExpiresAt:new Date(now).toISOString()}, {...state,trip:{...trip,id:'22222222-2222-4222-8222-222222222222'}}])assert.equal(continuityChatTripFresh(input,changed,now),false);
  for(const value of [{revision:-1,generation:0,trip},{revision:1,generation:0,trip,ownerId:'user:B'},{revision:1,generation:0,trip:{...trip,destination:'https://bad.example'}}])assert.equal(parseContinuityChatTrip(value),null);
});
