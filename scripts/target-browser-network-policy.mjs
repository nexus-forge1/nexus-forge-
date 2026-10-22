import net from 'node:net';
import { isPublicAddress } from './public-https-target.mjs';

/** Pin a DNS hostname to an IP that has already passed public-address validation. */
export function createPinnedHostResolverRule(hostname, address) {
  if (net.isIP(hostname)) return null;
  if (!isPublicAddress(address)) throw new Error('Cannot pin a hostname to a private or reserved address.');
  const resolverAddress = net.isIP(address) === 6 ? `[${address}]` : address;
  return `MAP ${hostname} ${resolverAddress}`;
}

/** The browser runner only connects to the exact origin whose DNS is pinned. */
export function isAllowedTargetOrigin(requestUrl, targetOrigin) {
  try { return new URL(requestUrl).origin === targetOrigin; }
  catch { return false; }
}
