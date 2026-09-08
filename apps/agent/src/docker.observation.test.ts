import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));

vi.mock('dockerode', () => ({
  default: class {
    getContainer() {
      return { exec: execMock };
    }
  },
}));

import { captureObservation } from './docker.js';

/** One Docker stream frame: 8-byte header (stream id + big-endian length). */
function frame(payload: Buffer | string, stream = 1): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Minimal lossy WebP: RIFF/WEBP/VP8 header with the 14-bit size fields. */
function webp(width: number, height: number, padding = 0): Buffer {
  const buf = Buffer.alloc(30 + padding);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(buf.length - 20, 16);
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

let destroyed = false;

/**
 * Answer the next exec with `chunks(nonce)`. The nonce is read back out of the
 * script the code just built, which is the only way a caller could know it.
 */
function respond(chunks: (nonce: string) => Buffer[], keepOpen = false) {
  destroyed = false;
  execMock.mockImplementation((opts: { Cmd: string[] }) => {
    const nonce = /\necho ([0-9a-f]+)\n/.exec(opts.Cmd[2] ?? '')?.[1] ?? '';
    return Promise.resolve({
      start: () => {
        const stream = new PassThrough();
        const realDestroy = stream.destroy.bind(stream);
        stream.destroy = ((e?: Error) => {
          destroyed = true;
          return realDestroy(e);
        }) as typeof stream.destroy;
        for (const chunk of chunks(nonce)) stream.write(chunk);
        if (!keepOpen) stream.end();
        return Promise.resolve(stream);
      },
    });
  });
}

/** The script the last capture ran inside the container. */
const lastScript = (): string => (execMock.mock.calls[0][0] as { Cmd: string[] }).Cmd[2] ?? '';

afterEach(() => {
  execMock.mockReset();
  vi.useRealTimers();
});

describe('captureObservation — the exec it runs', () => {
  it('runs as the session user, because kasm-user owns the X display', async () => {
    respond((nonce) => [frame(`W 2\n${nonce}\n`)]);
    await captureObservation('asha-sess-k1');

    const opts = execMock.mock.calls[0][0] as { User?: string; AttachStdout: boolean; Cmd: string[] };
    // bootstrapCups needs root; this must NOT, or there is no display to grab.
    expect(opts.User).toBeUndefined();
    expect(opts.AttachStdout).toBe(true);
    expect(opts.Cmd[0]).toBe('/bin/sh');
  });

  it('guards every helper so a third-party image cannot break the session', async () => {
    respond((nonce) => [frame(`W 2\n${nonce}\n`)]);
    await captureObservation('asha-sess-k1');

    const script = lastScript();
    for (const helper of ['xprop', 'wmctrl', 'ffmpeg']) {
      expect(script).toContain(`command -v ${helper} >/dev/null 2>&1`);
    }
  });

  it('clamps the thumbnail width and formats it itself', async () => {
    respond((nonce) => [frame(`${nonce}\n`)]);

    await captureObservation('asha-sess-k1', { thumbWidth: 4_000 });
    expect(lastScript()).toContain('scale=640:-2');

    execMock.mockClear();
    await captureObservation('asha-sess-k1', { thumbWidth: 10 });
    expect(lastScript()).toContain('scale=160:-2');

    execMock.mockClear();
    // Odd widths break yuv420 subsampling, so the width is pulled down to even.
    await captureObservation('asha-sess-k1', { thumbWidth: 321 });
    expect(lastScript()).toContain('scale=320:-2');
  });
});

describe('captureObservation — what it reads back', () => {
  it('reports the focused window, the window count and the frame', async () => {
    const image = webp(320, 180, 64);
    respond((nonce) => [
      frame(
        'T _NET_WM_NAME(UTF8_STRING) = "New Tab - Google Chrome"\n' +
          'C WM_CLASS(STRING) = "google-chrome", "Google-chrome"\n' +
          `W 3\n${nonce}\n`,
      ),
      frame(image),
    ]);

    const sample = await captureObservation('asha-sess-k1');

    expect(sample.title).toBe('New Tab - Google Chrome');
    expect(sample.appClass).toBe('google-chrome');
    expect(sample.windowCount).toBe(3);
    expect(sample.image).toBe(image.toString('base64'));
    expect(sample.imageWidth).toBe(320);
    expect(sample.imageHeight).toBe(180);
    expect(sample.degraded).toBeUndefined();
  });

  it('reassembles frames that arrive split across chunks', async () => {
    const image = webp(320, 200);
    respond((nonce) => {
      const full = Buffer.concat([frame(`W 1\n${nonce}\n`), frame(image)]);
      // Cut mid-header of the second frame — a split Docker never promises not to make.
      return [full.subarray(0, 20), full.subarray(20, 24), full.subarray(24)];
    });

    const sample = await captureObservation('asha-sess-k1');
    expect(sample.windowCount).toBe(1);
    expect(sample.image).toBe(image.toString('base64'));
  });

  it('reports no title when nothing is focused, which is a normal desktop', async () => {
    respond((nonce) => [frame(`W 0\n${nonce}\n`), frame(webp(320, 180))]);

    const sample = await captureObservation('asha-sess-k1');
    expect(sample.title).toBeUndefined();
    expect(sample.appClass).toBeUndefined();
    expect(sample.windowCount).toBe(0);
    expect(sample.degraded).toBeUndefined();
  });

  it('degrades instead of failing when a helper is missing from the image', async () => {
    respond((nonce) => [frame(`D xprop\nW 4\nD ffmpeg\n${nonce}\n`)]);

    const sample = await captureObservation('asha-sess-k1');
    expect(sample.degraded).toBe('missing:xprop,missing:ffmpeg');
    expect(sample.image).toBeUndefined();
    // The metadata that did survive is still worth a tile.
    expect(sample.windowCount).toBe(4);
  });

  it('ignores stderr, so an ffmpeg warning cannot end up in the frame', async () => {
    const image = webp(320, 180);
    respond((nonce) => [
      frame(`W 1\n${nonce}\n`),
      frame('[x11grab] warning: something\n', 2),
      frame(image),
    ]);

    const sample = await captureObservation('asha-sess-k1');
    expect(sample.image).toBe(image.toString('base64'));
  });
});

describe('captureObservation — what it refuses to do', () => {
  it('aborts the read past the cap instead of buffering an endless stream', async () => {
    respond((nonce) => [frame(`W 1\n${nonce}\n`), frame(Buffer.alloc(200_000, 1))]);

    const sample = await captureObservation('asha-sess-k1');
    expect(sample.image).toBeUndefined();
    expect(sample.degraded).toBe('image-too-large');
    expect(destroyed).toBe(true);
    expect(sample.windowCount).toBe(1);
  });

  it('drops a frame whose base64 would not fit the wire contract', async () => {
    // Between the read cap and the contract's 131_072-character image field:
    // sending it would get the whole sample rejected, metadata included.
    respond((nonce) => [frame(`W 1\n${nonce}\n`), frame(webp(320, 180, 100_000))]);

    const sample = await captureObservation('asha-sess-k1');
    expect(sample.image).toBeUndefined();
    expect(sample.degraded).toBe('image-too-large');
  });

  it('gives up on a wedged container rather than pinning the agent', async () => {
    vi.useFakeTimers();
    respond((nonce) => [frame(`W 1\n${nonce}\n`)], true);

    const pending = captureObservation('asha-sess-k1');
    await vi.advanceTimersByTimeAsync(5_000);
    const sample = await pending;

    expect(sample.degraded).toContain('timeout');
    expect(destroyed).toBe(true);
  });
});
