import { describe, expect, it } from 'vitest';
import { encodeInstruction, GuacamoleParser, GuacamoleProtocolError, MAX_PENDING } from './guac-protocol';

describe('encodeInstruction', () => {
  it('encodes opcode + args with character lengths', () => {
    expect(encodeInstruction('select', 'rdp')).toBe('6.select,3.rdp;');
  });

  it('encodes an opcode with no args', () => {
    expect(encodeInstruction('audio')).toBe('5.audio;');
  });

  it('counts unicode code points, not bytes', () => {
    // 'café' is 4 code points (the original codec uses [...string].length)
    expect(encodeInstruction('x', 'café')).toBe('1.x,4.café;');
  });
});

describe('GuacamoleParser', () => {
  it('parses a single complete instruction', () => {
    const p = new GuacamoleParser();
    expect(p.push('4.args,3.1.0,8.hostname;')).toEqual([['args', '1.0', 'hostname']]);
  });

  it('parses multiple instructions in one chunk', () => {
    const p = new GuacamoleParser();
    expect(p.push('5.ready,4.$abc;3.nop;')).toEqual([
      ['ready', '$abc'],
      ['nop'],
    ]);
  });

  it('buffers a partial instruction until the rest arrives', () => {
    const p = new GuacamoleParser();
    expect(p.push('4.args,3.1.0,8.host')).toEqual([]);
    expect(p.push('name;')).toEqual([['args', '1.0', 'hostname']]);
  });

  it('handles a value that itself contains a dot', () => {
    const p = new GuacamoleParser();
    // value "1.0" has length 3 and contains a '.'
    expect(p.push('3.1.0;')).toEqual([['1.0']]);
  });
});

/**
 * In view mode this parser is fed by the browser, so these cases are what a
 * hand-written client sends — not what guacd or guacamole-common-js ever does.
 */
describe('GuacamoleParser — input that is not the protocol', () => {
  it('gives up on a separator the protocol does not allow', () => {
    const p = new GuacamoleParser();
    // Treated as "incomplete", this byte would sit at the front of the buffer
    // for the life of the socket: nothing behind it ever parses again, and
    // every later frame is appended to a buffer that is never drained.
    expect(() => p.push('4.sync,4.1234X')).toThrow(GuacamoleProtocolError);
  });

  it('gives up on a length prefix that is not a plain number', () => {
    // A negative length puts the value's end BEFORE the cursor, so the scan
    // restarts at the same offset with the same bytes — an endless loop inside
    // the event loop, which stops the proxy serving every other session too.
    expect(() => new GuacamoleParser().push('1.a,-4.xyz')).toThrow(GuacamoleProtocolError);
    expect(() => new GuacamoleParser().push('0x10.abcdefghijklmnop;')).toThrow(GuacamoleProtocolError);
    expect(() => new GuacamoleParser().push('1e3.abc')).toThrow(GuacamoleProtocolError);
  });

  it('stops buffering once nothing held can still complete', () => {
    const p = new GuacamoleParser();
    expect(() => p.push('A'.repeat(MAX_PENDING + 1))).toThrow(GuacamoleProtocolError);
  });

  it('refuses a length no instruction could ever reach', () => {
    const p = new GuacamoleParser();
    // Declared but never sent: without the ceiling the socket may keep the
    // buffer growing towards it for as long as it stays open.
    expect(() => p.push(`${MAX_PENDING + 1}.abc`)).toThrow(GuacamoleProtocolError);
  });

  it('still waits for an instruction that is only incomplete', () => {
    const p = new GuacamoleParser();
    expect(p.push('8000.')).toEqual([]);
    expect(p.push('x'.repeat(8000))).toEqual([]);
    expect(p.push(';')).toEqual([['x'.repeat(8000)]]);
  });
});
