import assert from 'node:assert/strict';

/** @param {unknown} chrome @param {unknown} driver */
export function assertTask187BrowserVersions(chrome,driver) {
 const pattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
 assert.ok(typeof chrome==='string'&&pattern.test(chrome),'valid full Chrome version required');
 assert.ok(typeof driver==='string'&&pattern.test(driver),'valid full ChromeDriver version required');
 // Official M115+ selection for installed non-CfT Chrome matches MAJOR.MINOR.BUILD.
 assert.equal(chrome.split('.').slice(0,3).join('.'),driver.split('.').slice(0,3).join('.'),'matching Chrome/driver major.minor.build required');
}