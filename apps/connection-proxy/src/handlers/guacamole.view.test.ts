import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../session-store.js';
import { filterViewInstructions, resolveParam } from './guacamole.js';
import { GuacamoleParser } from './guac-protocol.js';

const SESSION = {
  sessionId: 's1',
  kasmId: 'k1',
  orgId: 'o1',
  userId: 'u1',
  protocol: 'RDP',
  internalHost: '10.0.0.5',
  internalPort: 3389,
  status: 'RUNNING',
} as unknown as SessionRecord;

/** Parse a browser frame the way the handler does before filtering it. */
const filterFrame = (frame: string): string =>
  filterViewInstructions(new GuacamoleParser().push(frame));

describe('filterViewInstructions — what an observer is allowed to send', () => {
  it('keeps the frame acknowledgement', () => {
    // Without `sync` guacd waits forever for the observer to confirm the frame
    // and the stream stops after the first one.
    expect(filterFrame('4.sync,4.1234;')).toBe('4.sync,4.1234;');
  });

  it('keeps nop and the observer own viewport size', () => {
    expect(filterFrame('3.nop;')).toBe('3.nop;');
    expect(filterFrame('4.size,4.1280,3.720;')).toBe('4.size,4.1280,3.720;');
  });

  it('drops keyboard and mouse input', () => {
    // `monitor=1` was a query parameter the browser set: dropping it was enough
    // to type into a colleague's desktop.
    expect(filterFrame('3.key,5.65289,1.1;')).toBe('');
    expect(filterFrame('5.mouse,3.640,3.480,1.1;')).toBe('');
  });

  it('drops clipboard, file, pipe, ack and disconnect', () => {
    expect(filterFrame('9.clipboard,1.0,10.text/plain;')).toBe('');
    expect(filterFrame('4.file,1.0,10.text/plain,5.a.txt;')).toBe('');
    expect(filterFrame('4.pipe,1.0,10.text/plain,4.name;')).toBe('');
    expect(filterFrame('3.ack,1.0,2.ok,1.0;')).toBe('');
    expect(filterFrame('10.disconnect;')).toBe('');
  });

  it('keeps the allowed instruction out of a mixed frame and drops the rest', () => {
    expect(filterFrame('3.key,5.65289,1.1;4.sync,4.1234;5.mouse,1.1,1.1,1.1;')).toBe('4.sync,4.1234;');
  });

  it('re-encodes rather than forwarding the frame it was given', () => {
    // Anything malformed stops at the parser, so guacd only ever sees whole,
    // freshly encoded instructions.
    expect(filterFrame('4.sync,4.1234;3.ke')).toBe('4.sync,4.1234;');
  });
});

describe('resolveParam — read-only', () => {
  it('tells guacd to refuse input from an observer', () => {
    // The second enforcement point: if the instruction filter above is ever
    // wrong, guacd still drops the input on its own.
    expect(resolveParam('read-only', SESSION, 'view')).toBe('true');
  });

  it('leaves the session own viewer able to work', () => {
    expect(resolveParam('read-only', SESSION, 'control')).toBe('false');
    expect(resolveParam('read-only', SESSION)).toBe('false');
  });
});
