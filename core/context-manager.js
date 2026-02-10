// Context Manager - Handles SCRI Core Memory and context across platforms
const { v4: uuidv4 } = require('uuid');

class ContextManager {
  constructor(database) {
    this.db = database;
    this.contextCache = new Map();
    this.maxContextLength = 50000; // Max characters for context
    this.maxConversationHistory = 100; // Max conversation entries
  }

  async addConversation(platform, projectId, message, context = {}) {
    const conversationId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const conversation = {
      id: conversationId,
      platform,
      projectId,
      message,
      context,
      timestamp,
      type: this.detectMessageType(message)
    };

    // Store in database
    await this.db.addConversation(conversation);
    
    // Update cache
    this.updateContextCache(projectId, conversation);
    
    return conversationId;
  }

  async getProjectContext(projectId) {
    // Check cache first
    if (this.contextCache.has(projectId)) {
      return this.contextCache.get(projectId);
    }

    // Build context from database
    const context = await this.buildProjectContext(projectId);
    this.contextCache.set(projectId, context);
    
    return context;
  }

  async buildProjectContext(projectId) {
    const conversations = await this.db.getConversationsByProject(projectId);
    const project = await this.db.getProject(projectId);
    
    const context = {
      projectInfo: project || { id: projectId, name: projectId },
      conversationHistory: this.processConversationHistory(conversations),
      codePatterns: this.extractCodePatterns(conversations),
      preferences: this.extractPreferences(conversations),
      currentFocus: this.determineCurrentFocus(conversations),
      lastActivity: conversations.length > 0 ? conversations[0].timestamp : null,
      platforms: this.getActivePlatforms(conversations),
      summary: this.generateContextSummary(conversations)
    };

    return context;
  }

  processConversationHistory(conversations) {
    // Sort by timestamp (newest first)
    const sorted = conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit to recent conversations
    const recent = sorted.slice(0, this.maxConversationHistory);
    
    // Format for AI context
    return recent.map(conv => ({
      platform: conv.platform,
      message: conv.message,
      timestamp: conv.timestamp,
      type: conv.type,
      context: conv.context
    }));
  }

  extractCodePatterns(conversations) {
    const patterns = [];
    
    for (const conv of conversations) {
      if (conv.type === 'code_generation' && conv.context.generatedCode) {
        patterns.push({
          language: conv.context.language || 'javascript',
          pattern: this.analyzeCodePattern(conv.context.generatedCode),
          success: conv.context.approved || false,
          timestamp: conv.timestamp
        });
      }
    }

    return this.consolidatePatterns(patterns);
  }

  extractPreferences(conversations) {
    const preferences = {
      codingStyle: {},
      frameworks: [],
      patterns: [],
      conventions: {}
    };

    // Analyze conversations for preferences
    for (const conv of conversations) {
      if (conv.context.preferences) {
        Object.assign(preferences, conv.context.preferences);
      }
      
      // Extract implicit preferences from successful code generations
      if (conv.type === 'code_generation' && conv.context.approved) {
        this.updatePreferencesFromCode(preferences, conv.context);
      }
    }

    return preferences;
  }

  determineCurrentFocus(conversations) {
    const recentConversations = conversations
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    const topics = new Map();
    
    for (const conv of recentConversations) {
      const topic = this.extractTopic(conv.message);
      if (topic) {
        topics.set(topic, (topics.get(topic) || 0) + 1);
      }
    }

    // Return most frequent topic
    let maxCount = 0;
    let currentFocus = 'general';
    
    for (const [topic, count] of topics) {
      if (count > maxCount) {
        maxCount = count;
        currentFocus = topic;
      }
    }

    return {
      topic: currentFocus,
      confidence: maxCount / recentConversations.length,
      relatedTopics: Array.from(topics.keys()).filter(t => t !== currentFocus)
    };
  }

  getActivePlatforms(conversations) {
    const platforms = new Set();
    const platformActivity = new Map();
    
    for (const conv of conversations) {
      platforms.add(conv.platform);
      platformActivity.set(conv.platform, conv.timestamp);
    }

    return Array.from(platforms).map(platform => ({
      name: platform,
      lastActivity: platformActivity.get(platform),
      isActive: this.isPlatformActive(platformActivity.get(platform))
    }));
  }

  generateContextSummary(conversations) {
    if (conversations.length === 0) {
      return "No previous conversations in this project.";
    }

    const totalConversations = conversations.length;
    const recentActivity = conversations[0].timestamp;
    const platforms = new Set(conversations.map(c => c.platform)).size;
    const codeGenerations = conversations.filter(c => c.type === 'code_generation').length;

    return `Project has ${totalConversations} conversations across ${platforms} platforms. ` +
           `Last activity: ${this.formatTimestamp(recentActivity)}. ` +
           `${codeGenerations} code generations completed.`;
  }

  updateContextCache(projectId, newConversation) {
    if (this.contextCache.has(projectId)) {
      const context = this.contextCache.get(projectId);
      context.conversationHistory.unshift({
        platform: newConversation.platform,
        message: newConversation.message,
        timestamp: newConversation.timestamp,
        type: newConversation.type,
        context: newConversation.context
      });
      
      // Limit history length
      if (context.conversationHistory.length > this.maxConversationHistory) {
        context.conversationHistory = context.conversationHistory.slice(0, this.maxConversationHistory);
      }
      
      // Update other context fields
      context.lastActivity = newConversation.timestamp;
      context.summary = `Recent activity: ${this.formatTimestamp(newConversation.timestamp)}`;
    }
  }

  detectMessageType(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('create') || lowerMessage.includes('generate') || lowerMessage.includes('write')) {
      return 'code_generation';
    }
    
    if (lowerMessage.includes('debug') || lowerMessage.includes('fix') || lowerMessage.includes('error')) {
      return 'debugging';
    }
    
    if (lowerMessage.includes('explain') || lowerMessage.includes('what') || lowerMessage.includes('how')) {
      return 'question';
    }
    
    if (lowerMessage.includes('refactor') || lowerMessage.includes('improve') || lowerMessage.includes('optimize')) {
      return 'refactoring';
    }

    return 'general';
  }

  analyzeCodePattern(code) {
    // Basic pattern analysis
    const patterns = {
      indentation: this.detectIndentation(code),
      quotes: this.detectQuoteStyle(code),
      semicolons: code.includes(';'),
      asyncStyle: code.includes('async/await') ? 'async/await' : code.includes('.then') ? 'promises' : 'sync',
      frameworkPatterns: this.detectFrameworkPatterns(code)
    };

    return patterns;
  }

  detectIndentation(code) {
    const lines = code.split('\n').filter(line => line.trim().length > 0);
    let spaceCount = 0;
    let tabCount = 0;

    for (const line of lines) {
      if (line.startsWith('  ')) spaceCount++;
      if (line.startsWith('\t')) tabCount++;
    }

    return spaceCount > tabCount ? 'spaces' : 'tabs';
  }

  detectQuoteStyle(code) {
    const singleQuotes = (code.match(/'/g) || []).length;
    const doubleQuotes = (code.match(/"/g) || []).length;
    return singleQuotes > doubleQuotes ? 'single' : 'double';
  }

  detectFrameworkPatterns(code) {
    const patterns = [];
    
    if (code.includes('React.') || code.includes('useState') || code.includes('useEffect')) {
      patterns.push('react');
    }
    
    if (code.includes('express') || code.includes('app.get') || code.includes('app.post')) {
      patterns.push('express');
    }
    
    if (code.includes('fastapi') || code.includes('@app.get') || code.includes('FastAPI')) {
      patterns.push('fastapi');
    }

    return patterns;
  }

  consolidatePatterns(patterns) {
    // Group similar patterns and identify common preferences
    const consolidated = {
      mostUsedLanguages: this.getMostUsedLanguages(patterns),
      preferredStyles: this.getPreferredStyles(patterns),
      successfulPatterns: patterns.filter(p => p.success)
    };

    return consolidated;
  }

  getMostUsedLanguages(patterns) {
    const languageCount = new Map();
    
    for (const pattern of patterns) {
      const count = languageCount.get(pattern.language) || 0;
      languageCount.set(pattern.language, count + 1);
    }

    return Array.from(languageCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([language, count]) => ({ language, count }));
  }

  getPreferredStyles(patterns) {
    // Analyze successful patterns for style preferences
    const successful = patterns.filter(p => p.success);
    
    if (successful.length === 0) return {};

    const styles = {
      indentation: this.getMostCommon(successful.map(p => p.pattern.indentation)),
      quotes: this.getMostCommon(successful.map(p => p.pattern.quotes)),
      asyncStyle: this.getMostCommon(successful.map(p => p.pattern.asyncStyle))
    };

    return styles;
  }

  getMostCommon(array) {
    const count = new Map();
    for (const item of array) {
      if (item) count.set(item, (count.get(item) || 0) + 1);
    }
    
    let maxCount = 0;
    let mostCommon = null;
    
    for (const [item, itemCount] of count) {
      if (itemCount > maxCount) {
        maxCount = itemCount;
        mostCommon = item;
      }
    }

    return mostCommon;
  }

  updatePreferencesFromCode(preferences, context) {
    if (context.generatedCode) {
      const patterns = this.analyzeCodePattern(context.generatedCode);
      
      // Update coding style preferences based on successful generations
      Object.assign(preferences.codingStyle, patterns);
      
      // Update framework preferences
      if (patterns.frameworkPatterns.length > 0) {
        for (const framework of patterns.frameworkPatterns) {
          if (!preferences.frameworks.includes(framework)) {
            preferences.frameworks.push(framework);
          }
        }
      }
    }
  }

  extractTopic(message) {
    const lowerMessage = message.toLowerCase();
    
    // Simple topic extraction
    if (lowerMessage.includes('component') || lowerMessage.includes('react')) return 'react_development';
    if (lowerMessage.includes('api') || lowerMessage.includes('endpoint')) return 'api_development';
    if (lowerMessage.includes('database') || lowerMessage.includes('sql')) return 'database';
    if (lowerMessage.includes('style') || lowerMessage.includes('css')) return 'styling';
    if (lowerMessage.includes('test') || lowerMessage.includes('unit')) return 'testing';
    if (lowerMessage.includes('deploy') || lowerMessage.includes('build')) return 'deployment';

    return 'general';
  }

  isPlatformActive(lastActivity) {
    if (!lastActivity) return false;
    
    const lastActivityDate = new Date(lastActivity);
    const now = new Date();
    const hoursSinceActivity = (now - lastActivityDate) / (1000 * 60 * 60);
    
    return hoursSinceActivity < 24; // Active if used in last 24 hours
  }

  formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  }
}

module.exports = ContextManager;