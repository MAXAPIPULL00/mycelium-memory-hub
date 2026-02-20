/**
 * Tests for FederationWebSocketPool authentication and lifecycle.
 */

// Mock socket.io before requiring the module
const mockSocket = {
  id: 'test-socket-123',
  emit: jest.fn(),
  join: jest.fn(),
  broadcast: { to: jest.fn(() => ({ emit: jest.fn() })) },
  on: jest.fn(),
};

const mockIo = {
  to: jest.fn(() => ({ emit: jest.fn() })),
};

// Create a minimal hub mock
function createMockHub(identityAuth = null) {
  return {
    io: mockIo,
    db: {
      all: jest.fn().mockResolvedValue([]),
      get: jest.fn(),
      run: jest.fn(),
    },
    identityAuth,
    nodeRegistry: null,
    eventBus: null,
  };
}

const FederationWebSocketPool = require('../federation/services/websocket-pool');

describe('FederationWebSocketPool', () => {
  let pool;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateConnection', () => {
    test('rejects missing nodeId', async () => {
      pool = new FederationWebSocketPool(createMockHub());
      const result = await pool.authenticateConnection(null, 'token123');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/missing/i);
    });

    test('rejects missing token', async () => {
      pool = new FederationWebSocketPool(createMockHub());
      const result = await pool.authenticateConnection('node-1', null);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/missing/i);
    });

    test('accepts connection when identity-auth not available (with warning)', async () => {
      pool = new FederationWebSocketPool(createMockHub(null));
      const result = await pool.authenticateConnection('node-1', 'token123');
      expect(result.success).toBe(true);
    });

    test('rejects invalid token via identity-auth', async () => {
      const identityAuth = {
        validateToken: jest.fn().mockReturnValue({ valid: false, error: 'Token expired' }),
      };
      pool = new FederationWebSocketPool(createMockHub(identityAuth));
      const result = await pool.authenticateConnection('node-1', 'bad-token');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    test('accepts valid token via identity-auth', async () => {
      const identityAuth = {
        validateToken: jest.fn().mockReturnValue({
          valid: true,
          node_id: 'node-1',
          scopes: ['read', 'write'],
        }),
      };
      pool = new FederationWebSocketPool(createMockHub(identityAuth));
      const result = await pool.authenticateConnection('node-1', 'valid-token');
      expect(result.success).toBe(true);
      expect(result.node_id).toBe('node-1');
      expect(result.scopes).toEqual(['read', 'write']);
    });

    test('rejects token with mismatched node_id', async () => {
      const identityAuth = {
        validateToken: jest.fn().mockReturnValue({
          valid: true,
          node_id: 'other-node',
          scopes: ['read'],
        }),
      };
      pool = new FederationWebSocketPool(createMockHub(identityAuth));
      const result = await pool.authenticateConnection('node-1', 'stolen-token');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/does not match/i);
    });
  });

  describe('handleNodeRegistration', () => {
    test('stores connection on successful auth', async () => {
      const identityAuth = {
        validateToken: jest.fn().mockReturnValue({
          valid: true,
          node_id: 'node-1',
          scopes: ['read', 'write'],
        }),
      };
      pool = new FederationWebSocketPool(createMockHub(identityAuth));

      await pool.handleNodeRegistration(mockSocket, {
        node_id: 'node-1',
        auth_token: 'valid-token',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'federation:connected',
        expect.objectContaining({
          federation_id: 'scri-federation',
        })
      );
      expect(pool.getConnectedNodeIds()).toContain('node-1');
    });

    test('emits auth-failed on invalid credentials', async () => {
      const identityAuth = {
        validateToken: jest.fn().mockReturnValue({ valid: false, error: 'Bad token' }),
      };
      pool = new FederationWebSocketPool(createMockHub(identityAuth));

      await pool.handleNodeRegistration(mockSocket, {
        node_id: 'node-1',
        auth_token: 'bad-token',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'federation:auth-failed',
        expect.objectContaining({ error: 'Bad token' })
      );
      expect(pool.getConnectedNodeIds()).not.toContain('node-1');
    });
  });

  describe('connection lifecycle', () => {
    test('getConnectionCount returns 0 initially', () => {
      pool = new FederationWebSocketPool(createMockHub());
      expect(pool.getConnectionCount()).toBe(0);
    });

    test('handleDisconnect removes connection', async () => {
      const identityAuth = {
        validateToken: jest.fn().mockReturnValue({ valid: true, node_id: 'node-1' }),
      };
      pool = new FederationWebSocketPool(createMockHub(identityAuth));

      await pool.handleNodeRegistration(mockSocket, {
        node_id: 'node-1',
        auth_token: 'valid-token',
      });

      expect(pool.getConnectionCount()).toBe(1);

      pool.handleDisconnect(mockSocket);
      expect(pool.getConnectionCount()).toBe(0);
    });
  });
});
