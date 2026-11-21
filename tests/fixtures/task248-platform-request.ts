// Explicit synthetic USER ingress for the legacy behavioral tests. No generated
// context is promoted to a user turn, and no backend authority is supplied.
import * as platform from '../../lib/dabra/platform-assistant';
import type { SavedTrip } from '../../lib/dabra/continuity-contract';
import type { DisplayCurrency } from '../../lib/currency/display';
export * from '../../lib/dabra/platform-assistant';
type Turn={role:'user'|'assistant';content:string};
export function platformContext(message:string,history:Turn[]=[],trip?:SavedTrip|null) {
 return platform.platformUserRequest({role:'user',content:message},history,trip,platform.createPlatformScopeOwner());
}
function request(input:string|platform.PlatformUserRequest,history:Turn[]=[],trip?:SavedTrip|null) {
 return typeof input==='string' ? platformContext(input,history,trip) : input;
}
export function buildPlatformAssistantResponse(input:string|platform.PlatformUserRequest,history:Turn[]=[],locale:'ar'|'en'='ar',now?:number,family?:platform.PlatformFamily,pricing?:platform.PlatformPricing,trip?:SavedTrip|null) {
 return platform.buildPlatformAssistantResponse(request(input,history,trip),[],locale,now,family,pricing);
}
export function platformEntry(family:platform.PlatformFamily,input:string|platform.PlatformUserRequest,locale:'ar'|'en',currency?:DisplayCurrency,trip?:SavedTrip|null) {
 return platform.preparePlatformEntryForUserRequest(family,request(input,[],trip),locale,currency).deliver();
}
export function findPlatformDriveOffers(input:string|platform.PlatformUserRequest,pricing?:platform.PlatformPricing,trip?:SavedTrip|null) {
 const issued=request(input,[],trip),scope=platform.platformUserRequestScope(issued);
 return scope ? platform.findPlatformDriveOffers('',pricing,scope.trip,undefined,scope) : [];
}
