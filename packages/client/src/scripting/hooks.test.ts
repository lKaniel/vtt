import { describe, expect, it, vi } from 'vitest';
import { Hooks } from './hooks.ts';

describe('hooks', () => {
  it('call every listener of a hook with its arguments', () => {
    const hooks = new Hooks();
    const a = vi.fn();
    const b = vi.fn();
    hooks.on('chat', a);
    hooks.on('chat', b);
    hooks.on('combat', b);
    hooks.call('chat', 'hi', 2);
    expect(a).toHaveBeenCalledWith('hi', 2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stop calling a listener once it is turned off, or after once', () => {
    const hooks = new Hooks();
    const fn = vi.fn();
    const off = hooks.on('chat', fn);
    hooks.once('chat', fn);
    hooks.call('chat');
    off();
    hooks.call('chat');
    expect(fn).toHaveBeenCalledTimes(2);
    hooks.on('chat', fn);
    hooks.off('chat', fn);
    hooks.call('chat');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keep calling the others when one listener throws, and report it', () => {
    const failed = vi.fn();
    const hooks = new Hooks(failed);
    const after = vi.fn();
    hooks.on('chat', () => {
      throw new Error('boom');
    });
    hooks.on('chat', after);
    hooks.call('chat');
    expect(after).toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith('chat', expect.objectContaining({ message: 'boom' }));
  });

  it('let go of every listener at once', () => {
    const hooks = new Hooks();
    const fn = vi.fn();
    hooks.on('chat', fn);
    hooks.clear();
    hooks.call('chat');
    expect(fn).not.toHaveBeenCalled();
  });
});
