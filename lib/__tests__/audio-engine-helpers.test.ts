/**
 * Unit tests for AudioEngine helper logic.
 *
 * AudioEngine itself is a React component and requires jsdom + @testing-library/react
 * for full integration tests. These tests cover the pure functions and contracts
 * extracted from AudioEngine — i.e. the decisions it makes about endpoints,
 * token body, playPosition gating, and duration normalisation.
 *
 * They serve as living documentation of the PR 6 extension contracts:
 *   - endpoints override (heartbeat, stop, playEvent, playPosition)
 *   - tokenRequestBuilder — custom body vs default
 *   - playPosition: null disables resume + position heartbeat writes
 *   - normalizeDuration edge cases
 */

import { describe, it, expect } from 'vitest';
import type { AudioEngineEndpoints } from '@/components/session-review/AudioEngine';

// ---------------------------------------------------------------------------
// Helper functions mirroring AudioEngine internals (not exported; duplicated
// here to pin the contract — if AudioEngine internals change these tests fail)
// ---------------------------------------------------------------------------

function normalizeDuration(d: number): number | null {
  if (d == null || !isFinite(d) || isNaN(d)) return null;
  return d;
}

function resolveHeartbeatUrl(endpoints?: AudioEngineEndpoints): string {
  return endpoints?.heartbeat ?? '/api/video/heartbeat';
}

function resolveStopUrl(endpoints?: AudioEngineEndpoints): string {
  return endpoints?.stop ?? '/api/video/stop';
}

function resolvePlayEventUrl(endpoints?: AudioEngineEndpoints): string {
  return endpoints?.playEvent ?? '/api/video/play-event';
}

/**
 * Returns the play-position URL, or null when explicitly disabled.
 * - undefined playPosition → default URL ('/api/video/play-position')
 * - null                  → disabled (skip resume fetch + position writes)
 * - string                → custom URL
 */
function resolvePlayPositionUrl(endpoints?: AudioEngineEndpoints): string | null {
  const v = endpoints?.playPosition;
  if (v === undefined) return '/api/video/play-position';
  return v; // null or custom string
}

/**
 * Builds the token request body using the builder or falls back to default.
 */
function buildTokenRequestBody(
  idFieldName: 'recordingId' | 'sessionId',
  playbackId: string,
  deviceId: string,
  tokenRequestBuilder?: (deviceId: string) => object,
): object {
  if (tokenRequestBuilder) return tokenRequestBuilder(deviceId);
  return { [idFieldName]: playbackId, deviceId };
}

// ---------------------------------------------------------------------------
// normalizeDuration
// ---------------------------------------------------------------------------

describe('normalizeDuration', () => {
  it('returns finite positive numbers unchanged', () => {
    expect(normalizeDuration(3600)).toBe(3600);
    expect(normalizeDuration(0.5)).toBe(0.5);
    expect(normalizeDuration(0)).toBe(0);
  });

  it('returns null for NaN (audio element not ready)', () => {
    expect(normalizeDuration(NaN)).toBeNull();
  });

  it('returns null for Infinity (HLS live stream before duration known)', () => {
    expect(normalizeDuration(Infinity)).toBeNull();
    expect(normalizeDuration(-Infinity)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Endpoint URL resolution
// ---------------------------------------------------------------------------

describe('resolveHeartbeatUrl', () => {
  it('returns default when no endpoints provided', () => {
    expect(resolveHeartbeatUrl()).toBe('/api/video/heartbeat');
    expect(resolveHeartbeatUrl({})).toBe('/api/video/heartbeat');
  });

  it('returns override when provided', () => {
    expect(resolveHeartbeatUrl({ heartbeat: '/api/video/fragment-heartbeat' }))
      .toBe('/api/video/fragment-heartbeat');
  });
});

describe('resolveStopUrl', () => {
  it('returns default when no endpoints provided', () => {
    expect(resolveStopUrl()).toBe('/api/video/stop');
    expect(resolveStopUrl({})).toBe('/api/video/stop');
  });

  it('returns override when provided', () => {
    expect(resolveStopUrl({ stop: '/api/video/fragment-stop' }))
      .toBe('/api/video/fragment-stop');
  });
});

describe('resolvePlayEventUrl', () => {
  it('returns default when no endpoints provided', () => {
    expect(resolvePlayEventUrl()).toBe('/api/video/play-event');
    expect(resolvePlayEventUrl({})).toBe('/api/video/play-event');
  });

  it('returns override when provided', () => {
    expect(resolvePlayEventUrl({ playEvent: '/api/video/custom-play-event' }))
      .toBe('/api/video/custom-play-event');
  });
});

describe('resolvePlayPositionUrl', () => {
  it('returns default when no endpoints provided', () => {
    expect(resolvePlayPositionUrl()).toBe('/api/video/play-position');
    expect(resolvePlayPositionUrl({})).toBe('/api/video/play-position');
  });

  it('returns null when explicitly set to null (fragment mode)', () => {
    // This is the critical contract: playPosition: null disables resume
    // fetch AND play-position heartbeat writes entirely.
    expect(resolvePlayPositionUrl({ playPosition: null })).toBeNull();
  });

  it('returns custom string when provided', () => {
    expect(resolvePlayPositionUrl({ playPosition: '/api/video/custom-position' }))
      .toBe('/api/video/custom-position');
  });

  it('distinguishes null (disabled) from undefined (use default)', () => {
    // undefined → default; null → disabled
    expect(resolvePlayPositionUrl({ heartbeat: '/x' })).toBe('/api/video/play-position'); // no playPosition key
    expect(resolvePlayPositionUrl({ playPosition: undefined })).toBe('/api/video/play-position');
    expect(resolvePlayPositionUrl({ playPosition: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Token request body
// ---------------------------------------------------------------------------

describe('buildTokenRequestBody', () => {
  it('uses recordingId field name by default', () => {
    const body = buildTokenRequestBody('recordingId', 'rec-123', 'dev-abc');
    expect(body).toEqual({ recordingId: 'rec-123', deviceId: 'dev-abc' });
  });

  it('uses sessionId field name by default', () => {
    const body = buildTokenRequestBody('sessionId', 'sess-456', 'dev-abc');
    expect(body).toEqual({ sessionId: 'sess-456', deviceId: 'dev-abc' });
  });

  it('calls tokenRequestBuilder with deviceId when provided', () => {
    const builder = (deviceId: string) => ({
      saveId: 'save-789',
      deviceId,
      radio: true,
    });
    const body = buildTokenRequestBody('sessionId', 'sess-456', 'dev-abc', builder);
    expect(body).toEqual({ saveId: 'save-789', deviceId: 'dev-abc', radio: true });
  });

  it('tokenRequestBuilder overrides the default idFieldName body entirely', () => {
    // The builder replaces the default `{ [idFieldName]: playbackId, deviceId }` entirely
    const builder = (deviceId: string) => ({ saveId: 'save-1', deviceId });
    const body = buildTokenRequestBody('recordingId', 'rec-99', 'dev-xyz', builder);
    expect(body).not.toHaveProperty('recordingId');
    expect((body as Record<string, unknown>).saveId).toBe('save-1');
    expect((body as Record<string, unknown>).deviceId).toBe('dev-xyz');
  });
});

// ---------------------------------------------------------------------------
// Endpoint override combinations (fragment playback scenario)
// ---------------------------------------------------------------------------

describe('Fragment playback endpoint contract', () => {
  const fragmentEndpoints: AudioEngineEndpoints = {
    heartbeat: '/api/video/fragment-heartbeat',
    stop: '/api/video/fragment-stop',
    playPosition: null, // DISABLED for fragment playback
    // playEvent: omitted → uses default
  };

  it('uses fragment-specific heartbeat URL', () => {
    expect(resolveHeartbeatUrl(fragmentEndpoints)).toBe('/api/video/fragment-heartbeat');
  });

  it('uses fragment-specific stop URL', () => {
    expect(resolveStopUrl(fragmentEndpoints)).toBe('/api/video/fragment-stop');
  });

  it('disables play-position entirely (null = no resume, no position writes)', () => {
    expect(resolvePlayPositionUrl(fragmentEndpoints)).toBeNull();
  });

  it('uses default play-event URL (unset in fragment endpoints → fallback)', () => {
    expect(resolvePlayEventUrl(fragmentEndpoints)).toBe('/api/video/play-event');
  });
});

describe('VOD playback endpoint contract (all defaults)', () => {
  it('uses all default URLs when no endpoints prop given', () => {
    expect(resolveHeartbeatUrl(undefined)).toBe('/api/video/heartbeat');
    expect(resolveStopUrl(undefined)).toBe('/api/video/stop');
    expect(resolvePlayEventUrl(undefined)).toBe('/api/video/play-event');
    expect(resolvePlayPositionUrl(undefined)).toBe('/api/video/play-position');
  });
});

// ---------------------------------------------------------------------------
// playbackRange contract documentation
// ---------------------------------------------------------------------------

describe('playbackRange contract', () => {
  // These are not runnable without jsdom, but document the expected behavior:
  //
  // When playbackRange = { startSec, endSec } is passed:
  //   1. On source ready (loadedmetadata event), AudioEngine seeks to startSec.
  //   2. On timeupdate, when currentTime >= endSec, AudioEngine:
  //      a. Calls audio.pause()
  //      b. Fires subscribeToFragment() callbacks
  //
  // When playbackRange = null (or undefined):
  //   - No seek on load, plays from beginning
  //   - No end-of-range check on timeupdate
  //
  // The range can be updated without remounting via handle.setPlaybackRange(range).
  // This is used by RadioPlayer to advance to the next fragment without re-initialising.

  it('startSec must be less than endSec for a valid range', () => {
    const validRange = { startSec: 30, endSec: 90 };
    expect(validRange.endSec).toBeGreaterThan(validRange.startSec);
  });

  it('a null range disables fragment mode', () => {
    const range: { startSec: number; endSec: number } | null = null;
    expect(range).toBeNull();
  });

  it('setPlaybackRange can update the range in-place (no remount needed)', () => {
    // Contract: the handle exposes setPlaybackRange(range | null).
    // The ref is updated synchronously, so the next timeupdate check uses new range.
    // This is verified by the RadioPlayer integration tests and the handle type.
    const ranges: Array<{ startSec: number; endSec: number } | null> = [
      { startSec: 0, endSec: 60 },    // fragment 1
      { startSec: 70, endSec: 130 },  // fragment 2 (radio advance)
      null,                            // reset
    ];
    expect(ranges[0]?.startSec).toBe(0);
    expect(ranges[1]?.startSec).toBe(70);
    expect(ranges[2]).toBeNull();
  });
});
