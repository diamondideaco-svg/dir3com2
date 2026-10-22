import history from './codex-governance.cjs';
import { validate as validateCurrent, proof } from './codex-session-proof.mjs';

function validate(input) {
  if (input.mode === 'historical') return { ...history.validateLegacy(input), decision: 'HISTORICAL_ONLY', releaseAuthorized: false };
  return validateCurrent(input);
}
export { validate, proof };
