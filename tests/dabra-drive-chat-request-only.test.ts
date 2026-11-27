import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {driveRequestSubmitCommand,driveChatContact,readDriveRequestReservation} from '../lib/dabra/drive-chat-request';
const key='00000000-0000-4000-8000-000000000265';
for(const text of ['أؤكد التفاصيل وأرسل طلبًا واحدًا','أؤكد تفاصيل الطلب وأرسله','Confirm details and submit one request','Confirm the details and send this request.'])test('explicit request creation: '+text,()=>assert.equal(driveRequestSubmitCommand(text),true));
for(const text of ['موافق','I accept','I accept the quote','إذا وافقت أؤكد التفاصيل وأرسل الطلب','لا أؤكد التفاصيل وأرسل الطلب','Confirm details and submit one request if available','Name: Synthetic Customer, Phone: +10000000265'])test('no creation authority: '+text,()=>assert.equal(driveRequestSubmitCommand(text),false));
test('contact is a separate private input, not consent',()=>{assert.deepEqual(driveChatContact('الاسم: عميل اختبار، الهاتف: +10000000265'),{name:'عميل اختبار',phone:'+10000000265'});assert.deepEqual(driveChatContact('Name: Synthetic Customer, Phone: +10000000265'),{name:'Synthetic Customer',phone:'+10000000265'});assert.equal(driveChatContact('My phone is maybe 123'),null);});
test('opaque storage distinguishes empty, pending and reference without current-state authority',()=>{assert.deepEqual(readDriveRequestReservation(null),{kind:'empty'});assert.deepEqual(readDriveRequestReservation(JSON.stringify({key,reference:null})),{kind:'reserved',key,reference:null});assert.deepEqual(readDriveRequestReservation(JSON.stringify({key,reference:'REQ-ABCD1234'})),{kind:'reserved',key,reference:'REQ-ABCD1234'});for(const raw of ['{}','null','[]','broken',JSON.stringify({key:'broken'}),JSON.stringify({key,reference:'/admin'}),JSON.stringify({key,reference:null,owner:'user:other'}),JSON.stringify({key,reference:null,trip:{name:'private'}})])assert.deepEqual(readDriveRequestReservation(raw),{kind:'invalid'});});
test('candidate carries no new quote approval, owned-read or notice RPC; old Core boundaries unchanged',()=>{
 for(const file of ['lib/drive/owned-request.ts','app/api/marketplace/drive-requests/[reference]/route.ts','lib/dabra/drive-chat-actions.ts','supabase/migrations/20261125194500_task265_drive_chat_approval_notice.sql'])assert.equal(existsSync(file),false,file);
 const client=readFileSync('components/dabra/ManagedDriveChat.tsx','utf8');assert.doesNotMatch(client,/read_owned_drive_accept_notice|accept_managed_drive_quote|\/api\/marketplace\/drive-requests|data-drive-chat-accept|data-drive-chat-notice/);
 assert.match(client,/\/api\/marketplace\/requests/);assert.match(client,/\/my-requests\//);
 for(const file of ['app/api/marketplace/requests/route.ts','lib/drive/request-server.ts','app/my-requests/[reference]/drive/page.tsx','app/my-requests/[reference]/drive/actions.ts','lib/notifications/kapso-drive-whatsapp.ts']){
  const base=execFileSync('git',['show','7cd76d014166d0b53f76c4839580dc207a0f2ef6:'+file]);assert.deepEqual(readFileSync(file),base,file);
 }
});