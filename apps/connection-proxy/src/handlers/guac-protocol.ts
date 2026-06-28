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
 * Incremental parser. Feed it chunks; it emits fully-parsed instructions
 * (arrays where [0] is the opcode). Leftover partial data is buffered.
 */
export class GuacamoleParser {
  private buffer = '';

  /** Append a chunk and return any instructions that are now complete. */
  push(chunk: string): string[][] {
    this.buffer += chunk;
    const instructions: string[][] = [];

    for (;;) {
      const parsed = this.parseOne();
      if (!parsed) break;
      instructions.push(parsed.elements);
      this.buffer = this.buffer.slice(parsed.consumed);
    }
    return instructions;
  }

  /** Try to parse a single complete instruction from the front of the buffer. */
  private parseOne(): { elements: string[]; consumed: number } | null {
    const elements: string[] = [];
    let i = 0;

    for (;;) {
      // Read LENGTH up to the '.'
      const dot = this.buffer.indexOf('.', i);
      if (dot === -1) return null; // incomplete
      const len = Number(this.buffer.slice(i, dot));
      if (!Number.isFinite(len)) return null;

      const valueStart = dot + 1;
      const valueEnd = valueStart + len;
      if (this.buffer.length < valueEnd + 1) return null; // value + separator not all here yet

      elements.push(this.buffer.slice(valueStart, valueEnd));
      const sep = this.buffer[valueEnd];
      i = valueEnd + 1;

      if (sep === ';') return { elements, consumed: i };
      if (sep !== ',') return null; // malformed — wait for more / give up on this frame
    }
  }
}
