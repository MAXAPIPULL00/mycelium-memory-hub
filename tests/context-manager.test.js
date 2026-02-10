const ContextManager = require('../core/context-manager');

// Mock database
function createMockDb() {
  const conversations = [];
  const projects = new Map();
  return {
    addConversation: jest.fn(async (conv) => { conversations.push(conv); }),
    getConversationsByProject: jest.fn(async (projectId) =>
      conversations.filter(c => c.projectId === projectId || c.project_id === projectId)
    ),
    getProject: jest.fn(async (projectId) => projects.get(projectId) || null),
    _conversations: conversations,
    _projects: projects
  };
}

describe('ContextManager', () => {
  let cm;
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    cm = new ContextManager(mockDb);
  });

  describe('addConversation', () => {
    it('stores a conversation and returns an id', async () => {
      const id = await cm.addConversation('vscode', 'proj-1', 'hello world');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(mockDb.addConversation).toHaveBeenCalledTimes(1);
    });

    it('passes platform, projectId, and message to the database', async () => {
      await cm.addConversation('claude-desktop', 'proj-2', 'generate a function');
      const saved = mockDb.addConversation.mock.calls[0][0];
      expect(saved.platform).toBe('claude-desktop');
      expect(saved.projectId).toBe('proj-2');
      expect(saved.message).toBe('generate a function');
    });

    it('attaches optional context', async () => {
      const ctx = { language: 'python', file: 'app.py' };
      await cm.addConversation('web', 'proj-3', 'write tests', ctx);
      const saved = mockDb.addConversation.mock.calls[0][0];
      expect(saved.context).toEqual(ctx);
    });
  });

  describe('detectMessageType', () => {
    it('detects code generation messages', () => {
      expect(cm.detectMessageType('create a new component')).toBe('code_generation');
      expect(cm.detectMessageType('generate a function')).toBe('code_generation');
      expect(cm.detectMessageType('write a test')).toBe('code_generation');
    });

    it('detects debugging messages', () => {
      expect(cm.detectMessageType('debug this error')).toBe('debugging');
      expect(cm.detectMessageType('fix the null pointer')).toBe('debugging');
    });

    it('detects question messages', () => {
      expect(cm.detectMessageType('explain this function')).toBe('question');
      expect(cm.detectMessageType('what does this do')).toBe('question');
      expect(cm.detectMessageType('how does routing work')).toBe('question');
    });

    it('detects refactoring messages', () => {
      expect(cm.detectMessageType('refactor the auth module')).toBe('refactoring');
      expect(cm.detectMessageType('optimize the query')).toBe('refactoring');
      expect(cm.detectMessageType('improve performance')).toBe('refactoring');
    });

    it('returns general for unrecognized messages', () => {
      expect(cm.detectMessageType('hello')).toBe('general');
      expect(cm.detectMessageType('thanks')).toBe('general');
    });
  });

  describe('getProjectContext', () => {
    it('builds context from database on first call', async () => {
      const ctx = await cm.getProjectContext('new-project');
      expect(ctx).toBeDefined();
      expect(ctx.projectInfo).toBeDefined();
      expect(ctx.conversationHistory).toEqual([]);
      expect(mockDb.getConversationsByProject).toHaveBeenCalledWith('new-project');
    });

    it('uses cache on subsequent calls', async () => {
      await cm.getProjectContext('cached-proj');
      await cm.getProjectContext('cached-proj');
      // Database should only be called once — second call uses cache
      expect(mockDb.getConversationsByProject).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateContextCache', () => {
    it('prepends new conversation to cached history', async () => {
      // Prime the cache
      await cm.getProjectContext('proj-cache');
      cm.updateContextCache('proj-cache', {
        platform: 'vscode',
        message: 'new message',
        timestamp: new Date().toISOString(),
        type: 'general',
        context: {}
      });
      const ctx = await cm.getProjectContext('proj-cache');
      expect(ctx.conversationHistory[0].message).toBe('new message');
    });

    it('respects maxConversationHistory limit', async () => {
      await cm.getProjectContext('proj-limit');
      cm.maxConversationHistory = 3;
      for (let i = 0; i < 5; i++) {
        cm.updateContextCache('proj-limit', {
          platform: 'test',
          message: `msg-${i}`,
          timestamp: new Date().toISOString(),
          type: 'general',
          context: {}
        });
      }
      const ctx = await cm.getProjectContext('proj-limit');
      expect(ctx.conversationHistory.length).toBeLessThanOrEqual(3);
    });
  });

  describe('helper methods', () => {
    it('extractTopic returns known topics', () => {
      expect(cm.extractTopic('build the react component')).toBe('react_development');
      expect(cm.extractTopic('create an api endpoint')).toBe('api_development');
      expect(cm.extractTopic('update the database schema')).toBe('database');
      expect(cm.extractTopic('fix the css styles')).toBe('styling');
      expect(cm.extractTopic('write unit tests')).toBe('testing');
      expect(cm.extractTopic('deploy to production')).toBe('deployment');
      expect(cm.extractTopic('hello world')).toBe('general');
    });

    it('isPlatformActive returns true for recent activity', () => {
      const recent = new Date().toISOString();
      expect(cm.isPlatformActive(recent)).toBe(true);
    });

    it('isPlatformActive returns false for old activity', () => {
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      expect(cm.isPlatformActive(old)).toBe(false);
    });

    it('isPlatformActive returns false for null', () => {
      expect(cm.isPlatformActive(null)).toBe(false);
    });

    it('generateContextSummary handles empty conversations', () => {
      const summary = cm.generateContextSummary([]);
      expect(summary).toBe('No previous conversations in this project.');
    });

    it('generateContextSummary describes conversation stats', () => {
      const convs = [
        { platform: 'vscode', type: 'general', timestamp: new Date().toISOString() },
        { platform: 'claude', type: 'code_generation', timestamp: new Date().toISOString() },
      ];
      const summary = cm.generateContextSummary(convs);
      expect(summary).toContain('2 conversations');
      expect(summary).toContain('2 platforms');
      expect(summary).toContain('1 code generations');
    });

    it('detectIndentation distinguishes spaces vs tabs', () => {
      expect(cm.detectIndentation('  line1\n  line2\n\tline3')).toBe('spaces');
      expect(cm.detectIndentation('\tline1\n\tline2\n  line3')).toBe('tabs');
    });

    it('detectQuoteStyle distinguishes single vs double', () => {
      expect(cm.detectQuoteStyle("const x = 'hello'; const y = 'world';")).toBe('single');
      expect(cm.detectQuoteStyle('const x = "hello"; const y = "world";')).toBe('double');
    });

    it('detectFrameworkPatterns identifies React', () => {
      expect(cm.detectFrameworkPatterns('import { useState } from "react"')).toContain('react');
    });

    it('detectFrameworkPatterns identifies Express', () => {
      expect(cm.detectFrameworkPatterns('app.get("/api", handler)')).toContain('express');
    });

    it('getMostCommon returns the most frequent element', () => {
      expect(cm.getMostCommon(['a', 'b', 'a', 'c', 'a'])).toBe('a');
      expect(cm.getMostCommon(['x', 'y', 'y'])).toBe('y');
    });

    it('getMostCommon returns null for empty array', () => {
      expect(cm.getMostCommon([])).toBeNull();
    });
  });
});
