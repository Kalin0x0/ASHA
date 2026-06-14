// Minimal typings for the parts of guacamole-common-js the viewer uses.
// The package ships a UMD `Guacamole` object (no bundled .d.ts).
declare module 'guacamole-common-js' {
  export interface MouseState {
    x: number;
    y: number;
  }

  export class WebSocketTunnel {
    constructor(tunnelURL: string);
  }

  export class Display {
    getElement(): HTMLElement;
    scale(scale: number): void;
    getScale(): number;
    getWidth(): number;
    getHeight(): number;
    onresize: ((width: number, height: number) => void) | null;
  }

  export class Mouse {
    constructor(element: Element);
    onmousedown: ((state: MouseState) => void) | null;
    onmouseup: ((state: MouseState) => void) | null;
    onmousemove: ((state: MouseState) => void) | null;
  }

  export class Keyboard {
    constructor(element: Element | Document);
    onkeydown: ((keysym: number) => boolean | void) | null;
    onkeyup: ((keysym: number) => void) | null;
  }

  // Opaque stream handles for clipboard transfer.
  export class InputStream {}
  export class OutputStream {}

  /** Reads a text stream (e.g. the remote clipboard) chunk by chunk. */
  export class StringReader {
    constructor(stream: InputStream);
    ontext: ((text: string) => void) | null;
    onend: (() => void) | null;
  }

  /** Writes text to an output stream (e.g. the remote clipboard). */
  export class StringWriter {
    constructor(stream: OutputStream);
    sendText(text: string): void;
    sendEnd(): void;
  }

  export class Client {
    constructor(tunnel: WebSocketTunnel);
    getDisplay(): Display;
    connect(data?: string): void;
    disconnect(): void;
    sendSize(width: number, height: number): void;
    sendMouseState(state: MouseState): void;
    sendKeyEvent(pressed: number, keysym: number): void;
    /** Open an outbound stream to set the remote clipboard. */
    createClipboardStream(mimetype: string): OutputStream;
    onstatechange: ((state: number) => void) | null;
    onerror: ((status: { code: number; message: string }) => void) | null;
    onname: ((name: string) => void) | null;
    /** Fired when the remote clipboard changes (remote → local). */
    onclipboard: ((stream: InputStream, mimetype: string) => void) | null;
  }

  const Guacamole: {
    WebSocketTunnel: typeof WebSocketTunnel;
    Display: typeof Display;
    Mouse: typeof Mouse;
    Keyboard: typeof Keyboard;
    Client: typeof Client;
    StringReader: typeof StringReader;
    StringWriter: typeof StringWriter;
    InputStream: typeof InputStream;
    OutputStream: typeof OutputStream;
  };
  export default Guacamole;
}
