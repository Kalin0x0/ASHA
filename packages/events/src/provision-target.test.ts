import { describe, expect, it } from 'vitest';
import { isProvisionForAgent } from './index';

/**
 * The provision channel is per-ZONE (`asha:zone:<zone>:provision`), so every
 * agent in a zone receives every command — but the manager's scheduler reserves
 * capacity on exactly ONE agent and records it on the session.
 *
 * Before this rule existed, N agents in a zone each provisioned every session.
 * The manager only ever learned about one container, so the other N-1 were
 * tracked by nothing, destroyed by nothing, and ran until the host was rebuilt —
 * while the scheduler's capacity accounting described a world with 1/N the load
 * that actually existed.
 */
describe('isProvisionForAgent', () => {
  it('accepts a command addressed to this agent', () => {
    expect(isProvisionForAgent({ agentId: 'agent-1' }, 'agent-1')).toBe(true);
  });

  it('rejects a command addressed to a different agent', () => {
    // The whole point: this is what stops the duplicate container.
    expect(isProvisionForAgent({ agentId: 'agent-2' }, 'agent-1')).toBe(false);
  });

  it('accepts an unaddressed command, so a new agent still works with an old manager', () => {
    // A manager that predates targeting sends no agentId. Refusing those would
    // make upgrading the agent first take the whole zone offline.
    expect(isProvisionForAgent({}, 'agent-1')).toBe(true);
    expect(isProvisionForAgent({ agentId: undefined }, 'agent-1')).toBe(true);
    expect(isProvisionForAgent({ agentId: '' }, 'agent-1')).toBe(true);
  });

  it('lets exactly one of several agents in a zone take the command', () => {
    const zone = ['agent-1', 'agent-2', 'agent-3'];
    const takers = zone.filter((id) => isProvisionForAgent({ agentId: 'agent-2' }, id));
    expect(takers).toEqual(['agent-2']);
  });
});
