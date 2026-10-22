import dns from 'node:dns/promises';
import net from 'node:net';

function blockedV4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113) || (a === 192 && b === 88);
}

function ipv6ToBigInt(address) {
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const octets = value.slice(lastColon + 1).split('.').map(Number);
    if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = value.slice(0, lastColon + 1) + high + ':' + low;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = halves.length === 2
    ? [...left, ...Array(Math.max(0, zeros)).fill('0'), ...right]
    : left;
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((result, part) => (result << 16n) | BigInt('0x' + part), 0n);
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !blockedV4(address);
  if (family === 6) {
    const value = ipv6ToBigInt(address);
    if (value === null) return false;
    // Only permit global-unicast 2000::/3; this excludes mapped IPv4,
    // NAT64, loopback, link-local, unique-local, and unspecified addresses.
    if ((value >> 125n) !== 1n) return false;
    const first = Number((value >> 112n) & 0xffffn);
    const second = Number((value >> 96n) & 0xffffn);
    // IANA special-purpose 2001::/23, documentation 3fff::/20,
    // and deprecated 6to4 2002::/16 are not valid public QA targets.
    if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
    if (first === 0x3fff && second <= 0x0fff) return false;
    if (first === 0x2002) return false;
    return true;
  }
  return false;
}

export async function resolvePublicHttps(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Target and route URLs must be absolute URLs.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.search || url.hash) {
    throw new Error('Only public HTTPS URLs without credentials, custom ports, query strings, or fragments are allowed.');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) {
    throw new Error('Private and local targets are not allowed.');
  }
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error('Target resolves to a private or reserved network address.');
  }
  return { url, addresses };
}

export async function validatePublicHttps(raw) {
  return (await resolvePublicHttps(raw)).url;
}
