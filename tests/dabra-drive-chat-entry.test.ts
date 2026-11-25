import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlatformAnswer from '../components/dabra/PlatformAnswer';
test('only Drive requirement review opens inline continuation; catalogue browsing stays a link',()=>{
 const show=(text:string)=>renderToStaticMarkup(React.createElement(PlatformAnswer,{text,onDriveReview:()=>{}}));
 const browsing=show('[Cars and rates](/marketplace?family=dir3-drive&language=en)');assert.match(browsing,/<a /);assert.doesNotMatch(browsing,/<button /);
 for(const label of ['Review car requirements','مراجعة متطلبات السيارة']){const review=show('['+label+'](/marketplace?family=dir3-drive&language=en)');assert.match(review,/data-drive-chat-open/);assert.doesNotMatch(review,/<a /);}
 const foreign=show('[Review car requirements](/support?family=dir3-drive)');assert.match(foreign,/<a /);
 const invalid=show('[Review car requirements](//untrusted.example.invalid)');assert.doesNotMatch(invalid,/<(?:a|button) /);
});
