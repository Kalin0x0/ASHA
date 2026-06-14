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

  export class Client {
    constructor(tunnel: WebSocketTunnel);
    getDisplay(): Display;
    connect(data?: string): void;
    disconnect(): void;
    sendMouseState(state: MouseState): void;
    sendKeyEvent(pressed: number, keysym: number): void;
    onstatechange: ((state: number) => void) | null;
    onerror: ((status: { code: number; message: string }) => void) | null;
    onname: ((name: string) => void) | null;
  }

  const Guacamole: {
    WebSocketTunnel: typeof WebSocketTunnel;
    Display: typeof Display;
    Mouse: typeof Mouse;
    Keyboard: typeof Keyboard;
    Client: typeof Client;
  };
  export default Guacamole;
}
