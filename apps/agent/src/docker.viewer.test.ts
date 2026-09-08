import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { execMock, getContainerMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
  getContainerMock: vi.fn(),
}));

vi.mock('dockerode', () => ({
  default: class {
    getContainer(idOrName: string) {
      getContainerMock(idOrName);
      return { exec: execMock };
    }
  },
}));

import { openViewerAccount, revokeViewerAccount } from './docker.js';

/** One Docker stream frame: 8-byte header (stream id + big-endian length). */
function frame(payload: string): Buffer {
  const body = Buffer.from(payload);
  const header = Buffer.alloc(8);
  header[0] = 1;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Answer the next exec with what the script printed on stdout. */
function respond(stdout: string) {
  execMock.mockImplementation(() =>
    Promise.resolve({
      start: () => {
        const stream = new PassThrough();
        stream.write(frame(stdout));
        stream.end();
        return Promise.resolve(stream);
      },
    }),
  );
}

/** The exec the last call built. */
const exec = () => execMock.mock.calls[0][0] as { Cmd: string[]; User?: string };

afterEach(() => {
  execMock.mockReset();
  getContainerMock.mockReset();
});

describe('openViewerAccount', () => {
  it('passes the password as an argument, never into the script', async () => {
    respond('ok');
    // The API mints this and it crosses the control channel, so it is not a
    // value the agent authored: interpolating it into a shell string is one
    // quote away from running the rest of it as commands.
    await openViewerAccount('asha-sess-k1', 'A-secret_pw01');

    expect(exec().Cmd[0]).toBe('/bin/sh');
    expect(exec().Cmd[2]).not.toContain('A-secret_pw01');
    expect(exec().Cmd[2]).toContain('"$1" "$1"');
    expect(exec().Cmd.slice(3)).toEqual(['sh', 'A-secret_pw01']);
    // kasm-user owns .kasmpasswd; the root that bootstrapCups needs would write
    // a file the VNC server cannot read.
    expect(exec().User).toBeUndefined();
  });

  it('refuses a password outside the charset instead of quoting around it', async () => {
    respond('ok');

    await expect(openViewerAccount('asha-sess-k1', "pw';id;'")).resolves.toBe(false);
    await expect(openViewerAccount('asha-sess-k1', 'short')).resolves.toBe(false);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('confirms only what kasmvncpasswd confirmed', async () => {
    respond('ok');
    await expect(openViewerAccount('asha-sess-k1', 'A-secret_pw01')).resolves.toBe(true);

    execMock.mockReset();
    // The guard's own exit path: no kasmvncpasswd in the image, no marker.
    respond('');
    await expect(openViewerAccount('asha-sess-k1', 'A-secret_pw01')).resolves.toBe(false);
  });

  it('answers false rather than throwing when the exec is refused', async () => {
    execMock.mockRejectedValue(new Error('OCI runtime exec failed'));

    // A third-party image losing its live view must never reach the session.
    await expect(openViewerAccount('asha-sess-k1', 'A-secret_pw01')).resolves.toBe(false);
  });
});

describe('revokeViewerAccount', () => {
  it('deletes the account instead of overwriting its password', async () => {
    respond('ok');
    await revokeViewerAccount('asha-sess-k1');

    // Measured: -d removes the entry and the account then answers 401. A
    // rewritten password would still be a credential, only a different one.
    expect(exec().Cmd[2]).toContain('kasmvncpasswd -d -u kasm_viewer');
    expect(exec().Cmd[2]).not.toContain('-r ');
    expect(getContainerMock).toHaveBeenCalledWith('asha-sess-k1');
  });

  it('answers false rather than throwing when the container is already gone', async () => {
    execMock.mockRejectedValue(new Error('no such container'));

    await expect(revokeViewerAccount('asha-sess-k1')).resolves.toBe(false);
  });
});
