import { afterEach, describe, expect, it, vi } from 'vitest';
import { artifactSchema, templateSchemas } from '../src/core/contracts.js';
import { quietExamples } from '../src/core/quiet-examples.js';
import { MotionPlayer } from '../src/web/motion-player.js';

afterEach(() => vi.useRealTimers());
describe('quiet surface contracts', () => {
  it('validates all collection variants and restricts portrait images to fictional assets', () => {
    for (const input of quietExamples) expect(artifactSchema.safeParse(input).success).toBe(true);
    expect(templateSchemas.portrait.safeParse({ name: 'Someone', src: 'architecture' }).success).toBe(false);
    expect(templateSchemas.portrait.safeParse({ name: 'Someone', src: 'portrait-mira', hideLabel: true }).success).toBe(false);
    // Generic image cards cannot display these portraits without their provenance label.
    expect(templateSchemas.image.safeParse({ src: 'portrait-mira' }).success).toBe(false);
  });
  it('bounds motion phases and progress and rejects autoplay/network payloads', () => {
    for (const phase of [-1, 16, 0.5, Infinity]) expect(templateSchemas.motion.safeParse({ title: 'Quiet', phase }).success).toBe(false);
    expect(templateSchemas.motion.safeParse({ title: 'Quiet', autoplay: true }).success).toBe(false);
    expect(templateSchemas.glance.safeParse({ title: 'Next', value: '10:00', backdrop: 'https://example.com/image.png' }).success).toBe(false);
    for (const progress of [-0.1, 1.1, Infinity]) expect(templateSchemas.focus.safeParse({ title: 'Quiet', value: '10:00', progress }).success).toBe(false);
  });
});

describe('completion-paced motion', () => {
  it('never overlaps slow frames, including pause/play during a pending send', async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const frame = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const player = new MotionPlayer(frame, vi.fn(), 1);
    player.play();
    await vi.advanceTimersByTimeAsync(10000);
    expect(frame).toHaveBeenCalledTimes(1);
    player.pause(); player.play(); await player.step(); player.play();
    expect(frame).toHaveBeenCalledTimes(1);
    resolve(); await vi.advanceTimersByTimeAsync(999);
    expect(frame).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(frame).toHaveBeenCalledTimes(2);
    player.pause(); resolve(); await vi.advanceTimersByTimeAsync(10000);
    expect(frame).toHaveBeenCalledTimes(2);
  });
  it('fails closed on an error and does not resume after a timeout-shaped rejection', async () => {
    vi.useFakeTimers();
    const frame = vi.fn().mockRejectedValue(new Error('Image update timed out'));
    const onError = vi.fn(); const player = new MotionPlayer(frame, onError);
    player.play(); await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledOnce(); expect(player.playing).toBe(false);
    player.play(); await player.step(); await vi.advanceTimersByTimeAsync(10000);
    expect(frame).toHaveBeenCalledOnce();
  });
});
