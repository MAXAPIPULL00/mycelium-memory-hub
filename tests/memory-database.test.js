const path = require('path');
const fs = require('fs-extra');

// Use a temp directory so tests don't touch the real DB
const TEST_DB_DIR = path.join(__dirname, '.test-db');

beforeAll(async () => {
  await fs.ensureDir(TEST_DB_DIR);
});

afterAll(async () => {
  // On Windows, SQLite may hold locks briefly after close — retry cleanup
  await new Promise(r => setTimeout(r, 200));
  try { await fs.remove(TEST_DB_DIR); } catch { /* ignore cleanup errors */ }
});

// Patch the db path before requiring the module
let MemoryDatabase;
let db;

beforeEach(async () => {
  // Fresh require each test to get a clean DB
  jest.resetModules();

  // Monkey-patch path.join so the DB goes to our temp dir
  const originalJoin = path.join;
  const testDbPath = originalJoin(TEST_DB_DIR, `test-${Date.now()}.db`);

  MemoryDatabase = require('../database/memory-database');
  db = new MemoryDatabase();
  db.dbPath = testDbPath;
  db.db = null;
  await db.init();
});

afterEach(async () => {
  if (db) {
    db.close();
    // Give SQLite time to release the file lock on Windows
    await new Promise(r => setTimeout(r, 100));
  }
});

describe('MemoryDatabase', () => {
  describe('conversations', () => {
    it('adds and retrieves a conversation by project', async () => {
      const conv = {
        id: 'conv-1',
        platform: 'vscode',
        projectId: 'proj-1',
        message: 'Hello from test',
        context: { file: 'test.js' },
        timestamp: new Date().toISOString(),
        type: 'general'
      };

      await db.addConversation(conv);
      const results = await db.getConversationsByProject('proj-1');
      expect(results.length).toBe(1);
      expect(results[0].message).toBe('Hello from test');
      expect(results[0].context).toEqual({ file: 'test.js' });
    });

    it('retrieves conversations by platform', async () => {
      await db.addConversation({
        id: 'c1', platform: 'vscode', projectId: 'p1',
        message: 'msg1', context: {}, timestamp: new Date().toISOString(), type: 'general'
      });
      await db.addConversation({
        id: 'c2', platform: 'claude', projectId: 'p1',
        message: 'msg2', context: {}, timestamp: new Date().toISOString(), type: 'general'
      });

      const vscodeConvs = await db.getConversationsByPlatform('vscode');
      expect(vscodeConvs.length).toBe(1);
      expect(vscodeConvs[0].platform).toBe('vscode');
    });

    it('counts conversations', async () => {
      await db.addConversation({
        id: 'c1', platform: 'a', projectId: 'p1',
        message: 'm', context: {}, timestamp: new Date().toISOString(), type: 'general'
      });
      await db.addConversation({
        id: 'c2', platform: 'b', projectId: 'p1',
        message: 'm', context: {}, timestamp: new Date().toISOString(), type: 'general'
      });

      const count = await db.getConversationCount();
      expect(count).toBe(2);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await db.addConversation({
          id: `c${i}`, platform: 'test', projectId: 'p1',
          message: `msg${i}`, context: {}, timestamp: new Date().toISOString(), type: 'general'
        });
      }

      const limited = await db.getConversationsByProject('p1', 2);
      expect(limited.length).toBe(2);
    });
  });

  describe('projects', () => {
    it('adds and retrieves a project', async () => {
      const project = {
        id: 'proj-1',
        name: 'Test Project',
        path: '/home/user/test',
        type: 'node',
        framework: 'express',
        lastModified: new Date().toISOString(),
        aiEnabled: true,
        config: { autoScan: true }
      };

      await db.addProject(project);
      const result = await db.getProject('proj-1');
      expect(result).not.toBeNull();
      expect(result.name).toBe('Test Project');
      expect(result.aiEnabled).toBe(true);
      expect(result.config).toEqual({ autoScan: true });
    });

    it('returns null for non-existent project', async () => {
      const result = await db.getProject('nonexistent');
      expect(result).toBeNull();
    });

    it('lists all projects', async () => {
      await db.addProject({
        id: 'p1', name: 'A', path: '/a', type: 'node',
        framework: null, lastModified: '2026-01-01', aiEnabled: false, config: {}
      });
      await db.addProject({
        id: 'p2', name: 'B', path: '/b', type: 'python',
        framework: 'fastapi', lastModified: '2026-02-01', aiEnabled: true, config: {}
      });

      const all = await db.getAllProjects();
      expect(all.length).toBe(2);
    });

    it('upserts a project on duplicate id', async () => {
      const project = {
        id: 'dup', name: 'Original', path: '/orig', type: 'node',
        framework: null, lastModified: '2026-01-01', aiEnabled: false, config: {}
      };
      await db.addProject(project);
      await db.addProject({ ...project, name: 'Updated' });

      const result = await db.getProject('dup');
      expect(result.name).toBe('Updated');
    });
  });

  describe('patterns', () => {
    it('adds and retrieves patterns', async () => {
      await db.addPattern('proj-1', 'code_style', { indent: 'spaces' }, 0.9);
      const patterns = await db.getPatterns('proj-1');
      expect(patterns.length).toBe(1);
      expect(patterns[0].pattern_type).toBe('code_style');
      expect(patterns[0].pattern_data).toEqual({ indent: 'spaces' });
      expect(patterns[0].success_rate).toBeCloseTo(0.9);
    });

    it('filters patterns by type', async () => {
      await db.addPattern('proj-1', 'code_style', { indent: 'spaces' });
      await db.addPattern('proj-1', 'naming', { convention: 'camelCase' });

      const codePatterns = await db.getPatterns('proj-1', 'code_style');
      expect(codePatterns.length).toBe(1);
      expect(codePatterns[0].pattern_type).toBe('code_style');
    });

    it('updates pattern usage correctly', async () => {
      await db.addPattern('proj-1', 'test', { data: true }, 1.0);
      const patterns = await db.getPatterns('proj-1');
      const patternId = patterns[0].id;

      // Successful usage
      await db.updatePatternUsage(patternId, true);
      const updated = await db.getPatterns('proj-1');
      expect(updated[0].usage_count).toBe(2);
      expect(updated[0].success_rate).toBeCloseTo(1.0);

      // Failed usage
      await db.updatePatternUsage(patternId, false);
      const afterFail = await db.getPatterns('proj-1');
      expect(afterFail[0].usage_count).toBe(3);
      expect(afterFail[0].success_rate).toBeLessThan(1.0);
    });

    it('rejects updating a nonexistent pattern', async () => {
      await expect(db.updatePatternUsage(9999, true)).rejects.toThrow('Pattern not found');
    });
  });

  describe('sessions', () => {
    it('starts and ends a session', async () => {
      await db.startSession('sess-1', 'vscode', 'proj-1');
      // Small delay to ensure duration > 0
      await new Promise(r => setTimeout(r, 50));
      await db.endSession('sess-1', 5);
      // If we get here without error, the session lifecycle works
    });

    it('rejects ending a nonexistent session', async () => {
      await expect(db.endSession('nonexistent', 0)).rejects.toThrow('Session not found');
    });
  });

  describe('analytics', () => {
    it('returns project stats', async () => {
      await db.addConversation({
        id: 'c1', platform: 'vscode', projectId: 'stats-proj',
        message: 'm1', context: {}, timestamp: '2026-02-10T01:00:00Z', type: 'general'
      });
      await db.addConversation({
        id: 'c2', platform: 'claude', projectId: 'stats-proj',
        message: 'm2', context: {}, timestamp: '2026-02-10T02:00:00Z', type: 'general'
      });

      const stats = await db.getProjectStats('stats-proj');
      expect(stats.conversationCount).toBe(2);
      expect(stats.platformDistribution.length).toBe(2);
      expect(stats.lastActivity).toBeDefined();
    });
  });
});
