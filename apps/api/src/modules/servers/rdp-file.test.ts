import { describe, expect, it } from 'vitest';
import { buildRdpFile } from './rdp-file';

describe('buildRdpFile', () => {
  it('targets the host:port and enables multimon, clipboard and drive redirection by default', () => {
    const rdp = buildRdpFile({ address: '10.0.0.5' });
    expect(rdp).toContain('full address:s:10.0.0.5:3389');
    expect(rdp).toContain('use multimon:i:1');
    expect(rdp).toContain('redirectclipboard:i:1');
    expect(rdp).toContain('drivestoredirect:s:*');
    expect(rdp).toContain('redirectprinters:i:1');
    // CRLF line endings (Windows .rdp convention).
    expect(rdp).toContain('\r\n');
  });

  it('never embeds a password and splits DOMAIN\\user', () => {
    const rdp = buildRdpFile({ address: 'host', username: 'CORP\\alice' });
    expect(rdp).toContain('username:s:alice');
    expect(rdp).toContain('domain:s:CORP');
    expect(rdp).not.toMatch(/password/i);
  });

  it('respects an address that already carries a port', () => {
    expect(buildRdpFile({ address: 'host:53389' })).toContain('full address:s:host:53389');
  });

  it('disables redirection when flags are off', () => {
    const rdp = buildRdpFile({ address: 'h', multimon: false, clipboard: false, drives: false, printers: false });
    expect(rdp).toContain('use multimon:i:0');
    expect(rdp).toContain('redirectclipboard:i:0');
    expect(rdp).toContain('drivestoredirect:s:\r\n'); // empty value
    expect(rdp).toContain('redirectprinters:i:0');
  });
});
