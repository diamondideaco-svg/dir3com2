// Legacy stripped-module consumers use the real pure handoff helpers.
// This supplies imports only; native VM behavior and every assertion remain intact.
import * as nativeVm from 'node:vm';
import * as driveHandoff from '../../lib/dabra/drive-handoff.ts';
export * from 'node:vm';
export function runInNewContext(code,context={},options) {
 Object.assign(context,driveHandoff);
 return nativeVm.runInNewContext(code,context,options);
}
const vmWithDriveHandoff={...nativeVm,runInNewContext};
export default vmWithDriveHandoff;
