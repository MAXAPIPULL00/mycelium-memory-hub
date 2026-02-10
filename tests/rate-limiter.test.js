const FederationRateLimiter = require('../federation/services/rate-limiter');

function createMockHub() {
  return {
    eventBus: { emit: jest.fn() }
  };
}

describe('FederationRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new FederationRateLimiter(createMockHub());
  });

  afterEach(() => {
    // Clean up the reset interval if it was started
    if (limiter.resetInterval) {
      clearInterval(limiter.resetInterval);
    }
  });

  describe('default limits', () => {
    it('has sane default request limits', () => {
      expect(limiter.defaultLimits.requests_per_minute).toBeGreaterThan(0);
      expect(limiter.defaultLimits.bandwidth_mb_per_minute).toBeGreaterThan(0);
      expect(limiter.defaultLimits.websocket_messages_per_minute).toBeGreaterThan(0);
    });
  });

  describe('setNodeLimits / getLimits', () => {
    it('returns default limits for unknown nodes', () => {
      const limits = limiter.getLimits('unknown-node');
      expect(limits).toEqual(limiter.defaultLimits);
    });

    it('stores and retrieves custom limits', () => {
      limiter.setNodeLimits('node-1', { requests_per_minute: 500 });
      const limits = limiter.getLimits('node-1');
      expect(limits.requests_per_minute).toBe(500);
      // Should fill in defaults for unspecified fields
      expect(limits.bandwidth_mb_per_minute).toBe(limiter.defaultLimits.bandwidth_mb_per_minute);
    });
  });

  describe('getUsage', () => {
    it('creates a fresh usage tracker for new nodes', () => {
      const usage = limiter.getUsage('new-node');
      expect(usage.requests).toBe(0);
      expect(usage.bandwidth_bytes).toBe(0);
      expect(usage.websocket_messages).toBe(0);
      expect(usage.window_start).toBeGreaterThan(0);
    });

    it('returns existing usage for known nodes', () => {
      const first = limiter.getUsage('node-x');
      first.requests = 42;
      const second = limiter.getUsage('node-x');
      expect(second.requests).toBe(42);
    });
  });

  describe('warning threshold', () => {
    it('is set to 80%', () => {
      expect(limiter.warningThreshold).toBe(0.8);
    });
  });
});
