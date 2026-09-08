/**
 * Minimal Guacamole protocol codec.
 *
 * The Guacamole wire protocol is a stream of instructions, each of the form:
 *   LENGTH.VALUE,LENGTH.VALUE,…;
 * where LENGTH is the number of UTF-8 characters in VALUE. The first element is
 * the opcode, the rest are arguments. Instructions are terminated by ';'.
 *
 * This codec is deliberately small — just enough to drive the guacd handshake
 * (select → args → size/audio/video/image → connect) before the proxy switches
 * to raw byte-bridging between the browser and guacd.
 */

/** Encode an instruction from an opcode + args into the wire format. */
export function encodeInstruction(opcode: string, ...args: string[]): string {
  const parts = [opcode, ...args].map((p) => `${[...p].length}.${p}`);
  return `${parts.join(',')};`;
}

/**
 * Raised for input that is not a Guacamole stream at all — as opposed to an
 * instruction that is simply not here in full yet. The two look the same to a
 * parser that only ever waits for more, which is why they are told apart here.
 */
export class GuacamoleProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuacamoleProtocolError';
  }
}

/**
 * Ceiling on data held for an instruction that has not completed yet. guacd caps
 * a single instruction at 8 KB, so many times that with nothing parseable in it
 * is not a slow sender — it is a client with no intention of finishing one.
 */
export const MAX_PENDING = 64 * 1024;

/**
 * Incremental parser. Feed it chunks; it emits fully-parsed instructions
 * (arrays where [0] is the opcode). Leftover partial data is buffered.
 *
 * It is strict on purpose: in view mode the browser feeds it, and treating a
 * malformed frame like an incomplete one leaves those bytes at the front of the
 * buffer for good — nothing parses behind them again, and every frame that
 * follows makes the buffer bigger.
 */
export class GuacamoleParser {
  private buffer = '';

  /**
   * Append a chunk and return any instructions that are now complete. Throws
   * GuacamoleProtocolError when the stream cannot go on; the caller closes the
   * connection, because nothing that follows can be interpreted either.
   */
  push(chunk: string): string[][] {
    this.buffer += chunk;
    const instructions: string[][] = [];

    for (;;) {
      const parsed = this.parseOne();
      if (!parsed) break;
      instructions.push(parsed.elements);
      this.buffer = this.buffer.slice(parsed.consumed);
    }
    // Every complete instruction was just consumed, so what is left is a single
    // instruction in flight — it cannot reach this size on legitimate traffic.
    if (this.buffer.length > MAX_PENDING) {
      this.fail(`no complete instruction in ${this.buffer.length} buffered characters`);
    }
    return instructions;
  }

  /**
   * Try to parse a single complete instruction from the front of the buffer.
   * null means "not all here yet"; input that can never complete throws.
   */
  private parseOne(): { elements: string[]; consumed: number } | null {
    const elements: string[] = [];
    let i = 0;

    for (;;) {
      // Read LENGTH up to the '.'
      const dot = this.buffer.indexOf('.', i);
      if (dot === -1) return null; // incomplete
      const raw = this.buffer.slice(i, dot);
      // Digits, nothing else: Number() also takes ' 12', '0x0a', '1e9' and '-4',
      // and a negative length moves the cursor BACKWARDS — the loop then reads
      // the same offset for ever, and the proxy stops serving anyone at all.
      if (!/^\d+$/.test(raw)) this.fail(`length prefix is not a number: ${JSON.stringify(raw.slice(0, 32))}`);
      const len = Number(raw);
      if (len > MAX_PENDING) this.fail(`element of ${len} characters is past the ceiling`);

      const valueStart = dot + 1;
      const valueEnd = valueStart + len;
      if (this.buffer.length < valueEnd + 1) return null; // value + separator not all here yet

      elements.push(this.buffer.slice(valueStart, valueEnd));
      const sep = this.buffer[valueEnd];
      i = valueEnd + 1;

      if (sep === ';') return { elements, consumed: i };
      if (sep !== ',') this.fail(`expected ',' or ';' after an element, got ${JSON.stringify(sep)}`);
    }
  }

  /** Give up and drop what is buffered: a broken stream cannot resynchronize. */
  private fail(reason: string): never {
    this.buffer = '';
    throw new GuacamoleProtocolError(reason);
  }
}
