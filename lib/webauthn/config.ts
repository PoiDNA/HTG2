export const rpName = process.env.WEBAUTHN_RP_NAME || 'HTG';

let _rpID: string | undefined;
export function getRpID(): string {
  if (!_rpID) {
    const v = process.env.WEBAUTHN_RP_ID;
    if (!v) throw new Error('Missing required env var: WEBAUTHN_RP_ID');
    _rpID = v;
  }
  return _rpID;
}

let _origin: string | undefined;
export function getOrigin(): string {
  if (!_origin) {
    const v = process.env.WEBAUTHN_ORIGIN;
    if (!v) throw new Error('Missing required env var: WEBAUTHN_ORIGIN');
    _origin = v;
  }
  return _origin;
}
