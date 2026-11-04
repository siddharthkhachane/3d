import { decodeGhost } from '../sim/ghost.js';
import { isValidTrackId } from './daily.js';

const MAX_URL_LENGTH = 8000;
const MAX_HASH_LENGTH = 8100;
const PREFIX = '#r=';

export function makeShareUrl(baseUrl, trackId, ghostCode) {
  const base = baseUrl.split('#')[0];
  const url = `${base}${PREFIX}${trackId}~${ghostCode}`;
  return url.length > MAX_URL_LENGTH ? null : url;
}

export function parseShareHash(hash) {
  if (typeof hash !== 'string' || hash.length > MAX_HASH_LENGTH || !hash.startsWith(PREFIX)) return null;
  const body = hash.slice(PREFIX.length);
  const sep = body.indexOf('~');
  if (sep < 0) return null;
  const trackId = body.slice(0, sep);
  if (!isValidTrackId(trackId)) return null;
  const ghost = decodeGhost(body.slice(sep + 1));
  return ghost ? { trackId, ghost } : null;
}
