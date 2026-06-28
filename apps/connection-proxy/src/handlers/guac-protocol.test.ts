import { describe, expect, it } from 'vitest';
import { encodeInstruction, GuacamoleParser } from './guac-protocol';

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
