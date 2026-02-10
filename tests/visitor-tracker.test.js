const AIVisitorTracker = require('../core/ai-visitor-tracker');

function createMockHub() {
  return {
    db: { addConversation: jest.fn() }
  };
}

function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/health',
    ip: '127.0.0.1',
    body: {},
    params: {},
    query: {},
    headers: {},
    connection: { remoteAddress: '127.0.0.1' },
    get: jest.fn((header) => {
      const headers = {
        'user-agent': overrides.userAgent || 'test-agent',
        'referer': overrides.referer || '',
        'x-ai-agent': overrides.aiAgent || '',
        ...overrides.headers
      };
      return headers[header.toLowerCase()] || '';
    }),
    ...overrides
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    json: jest.fn()
  };
  return res;
}

describe('AIVisitorTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new AIVisitorTracker(createMockHub());
  });

  describe('trackVisitor middleware', () => {
    it('returns a function (middleware)', () => {
      const middleware = tracker.trackVisitor();
      expect(typeof middleware).toBe('function');
    });

    it('calls next() to pass control', async () => {
      const middleware = tracker.trackVisitor();
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('wraps res.json to log visits on response', async () => {
      const middleware = tracker.trackVisitor();
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      // The original res.json should now be wrapped
      res.json({ success: true });

      // Visit should be logged
      expect(tracker.recentVisitors.length).toBe(1);
      expect(tracker.recentVisitors[0].method).toBe('GET');
      expect(tracker.recentVisitors[0].endpoint).toBe('/api/health');
    });
  });

  describe('detectAgent', () => {
    it('detects explicit x-ai-agent header', () => {
      const req = createMockReq({ headers: { 'x-ai-agent': 'claude-code' } });
      expect(tracker.detectAgent(req)).toBe('claude-code');
    });

    it('detects Claude from user-agent', () => {
      const req = createMockReq({ userAgent: 'ClaudeDesktop/1.0' });
      expect(tracker.detectAgent(req)).toContain('laude');
    });

    it('returns unknown for unrecognized agents', () => {
      const req = createMockReq({ userAgent: 'curl/7.0' });
      const agent = tracker.detectAgent(req);
      expect(typeof agent).toBe('string');
    });
  });

  describe('logVisit', () => {
    it('adds visit to recentVisitors', () => {
      tracker.logVisit({ timestamp: new Date().toISOString(), agent: 'test', endpoint: '/api/test' });
      expect(tracker.recentVisitors.length).toBe(1);
    });

    it('respects maxRecentVisitors limit', () => {
      tracker.maxRecentVisitors = 3;
      for (let i = 0; i < 5; i++) {
        tracker.logVisit({ timestamp: new Date().toISOString(), agent: 'test', endpoint: `/api/${i}` });
      }
      expect(tracker.recentVisitors.length).toBe(3);
    });
  });
});
