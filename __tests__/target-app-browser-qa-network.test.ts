import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../scripts/public-https-target.mjs';
import { createPinnedHostResolverRule, isAllowedTargetOrigin } from '../scripts/target-browser-network-policy.mjs';

describe('target browser QA public-address validation', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.8',
    '172.16.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '198.51.100.10',
    '203.0.113.7',
    '224.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:a9fe:a9fe',
    '::ffff:ac10:0001',
    '::ffff:7f00:0001',
    '64:ff9b::a9fe:a9fe',
    '2001:db8::1',
    '2001:20::1',
    '3fff::1',
    '3fff:0fff:ffff::1',
    '2002:7f00:0001::1',
  ])('rejects private or reserved address %s', address => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
  ])('allows public address %s', address => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it('rejects malformed address input', () => {
    expect(isPublicAddress('not-an-ip')).toBe(false);
    expect(isPublicAddress('999.999.999.999')).toBe(false);
  });

  it('pins a DNS hostname to an already-validated public IPv4 address', () => {
    expect(createPinnedHostResolverRule('qa.example.com', '8.8.8.8')).toBe('MAP qa.example.com 8.8.8.8');
  });

  it('pins a DNS hostname to an already-validated public IPv6 address', () => {
    expect(createPinnedHostResolverRule('qa.example.com', '2606:4700:4700::1111')).toBe('MAP qa.example.com [2606:4700:4700::1111]');
  });

  it('does not add a DNS mapping for an IP-literal target', () => {
    expect(createPinnedHostResolverRule('8.8.8.8', '8.8.8.8')).toBeNull();
  });

  it('refuses to pin a hostname to a private or reserved address', () => {
    expect(() => createPinnedHostResolverRule('qa.example.com', '127.0.0.1')).toThrow(/private or reserved/);
  });

  it('allows only the exact target origin for browser requests', () => {
    expect(isAllowedTargetOrigin('https://qa.example.com/projects', 'https://qa.example.com')).toBe(true);
    expect(isAllowedTargetOrigin('https://qa.example.com:443/projects', 'https://qa.example.com')).toBe(true);
    expect(isAllowedTargetOrigin('https://other.example.com/', 'https://qa.example.com')).toBe(false);
    expect(isAllowedTargetOrigin('http://qa.example.com/', 'https://qa.example.com')).toBe(false);
    expect(isAllowedTargetOrigin('not a URL', 'https://qa.example.com')).toBe(false);
  });
});
