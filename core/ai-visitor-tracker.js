// AI Visitor Tracking Middleware for Memory Hub
// Logs all AI agent interactions automatically

const { v4: uuidv4 } = require('uuid');

class AIVisitorTracker {
  constructor(memoryHub) {
    this.memoryHub = memoryHub;
    this.recentVisitors = []; // In-memory cache of recent visitors
    this.maxRecentVisitors = 100; // Keep last 100 visits
  }

  /**
   * Middleware to track all API requests
   */
  trackVisitor() {
    return async (req, res, next) => {
      const startTime = Date.now();
      
      // Capture original res.json to intercept response
      const originalJson = res.json.bind(res);
      
      res.json = (data) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Log the visit
        this.logVisit({
          timestamp: new Date().toISOString(),
          agent: this.detectAgent(req),
          ai_type: this.detectAIType(req),
          project_directory: this.extractProjectDirectory(req),
          method: req.method,
          endpoint: req.path,
          project_id: this.extractProjectId(req),
          action: this.determineAction(req),
          success: res.statusCode >= 200 && res.statusCode < 300,
          duration_ms: duration,
          ip: req.ip || req.connection.remoteAddress,
          user_agent: req.get('user-agent'),
          content_id: req.body?.memory_id || req.body?.id || null
        });
        
        return originalJson(data);
      };
      
      next();
    };
  }

  /**
   * Detect which AI agent made the request
   */
  detectAgent(req) {
    const userAgent = req.get('user-agent') || '';
    const referer = req.get('referer') || '';
    
    // Check headers for explicit agent identification
    if (req.headers['x-ai-agent']) {
      return req.headers['x-ai-agent'];
    }
    
    // Check body for platform/agent info
    if (req.body) {
      if (req.body.platform === 'github_copilot') return 'GitHub Copilot';
      if (req.body.platform === 'claude') return 'Claude';
      if (req.body.platform === 'gemini') return 'Gemini';
      if (req.body.platform === 'grok') return 'Grok';
    }
    
    // Check endpoint patterns
    if (req.path.includes('/copilot/')) return 'GitHub Copilot';
    if (req.path.includes('/claude/')) return 'Claude';
    if (req.path.includes('/gemini/')) return 'Gemini';
    
    // Check user agent strings
    if (userAgent.includes('Copilot')) return 'GitHub Copilot';
    if (userAgent.includes('Claude')) return 'Claude';
    if (userAgent.includes('Gemini')) return 'Gemini';
    if (userAgent.includes('curl')) return 'Derek (via curl)';
    if (userAgent.includes('Invoke-RestMethod')) return 'Derek (via PowerShell)';
    
    // Default
    return 'Unknown Agent';
  }

  /**
   * Extract project_id from request
   */
  extractProjectId(req) {
    // Check URL params
    if (req.params.projectId) return req.params.projectId;
    if (req.params.project_id) return req.params.project_id;
    
    // Check query params
    if (req.query.project_id) return req.query.project_id;
    if (req.query.projectId) return req.query.projectId;
    
    // Check body
    if (req.body && req.body.project_id) return req.body.project_id;
    
    return null;
  }

  /**
   * Detect AI type for enhanced tracking
   * Returns: 'github_copilot', 'claude_code', 'gemini_ai', or 'unknown'
   */
  detectAIType(req) {
    const agent = this.detectAgent(req);
    const userAgent = req.get('user-agent') || '';
    
    // Check explicit platform in body
    if (req.body) {
      if (req.body.platform === 'github_copilot') return 'github_copilot';
      if (req.body.platform === 'claude' || req.body.platform === 'claude_code') return 'claude_code';
      if (req.body.platform === 'gemini' || req.body.platform === 'gemini_ai') return 'gemini_ai';
    }
    
    // Check based on detected agent
    if (agent.toLowerCase().includes('copilot') || agent.toLowerCase().includes('github')) {
      return 'github_copilot';
    }
    if (agent.toLowerCase().includes('claude')) {
      return 'claude_code';
    }
    if (agent.toLowerCase().includes('gemini')) {
      return 'gemini_ai';
    }
    
    // Check endpoint patterns
    if (req.path.includes('/copilot/')) return 'github_copilot';
    if (req.path.includes('/claude/')) return 'claude_code';
    if (req.path.includes('/gemini/')) return 'gemini_ai';
    
    // Check user agent
    if (userAgent.toLowerCase().includes('copilot')) return 'github_copilot';
    if (userAgent.toLowerCase().includes('claude')) return 'claude_code';
    if (userAgent.toLowerCase().includes('gemini')) return 'gemini_ai';
    
    return 'unknown';
  }

  /**
   * Extract project directory from request
   * Returns the project directory path if available
   */
  extractProjectDirectory(req) {
    // Try to get from body context
    if (req.body?.context?.project_directory) {
      return req.body.context.project_directory;
    }
    
    // Try to get from body directly
    if (req.body?.project_directory) {
      return req.body.project_directory;
    }
    
    if (req.body?.projectDirectory) {
      return req.body.projectDirectory;
    }
    
    // Try to get from projectId (might be a path)
    if (req.body?.projectId && req.body.projectId.includes('\\') || req.body?.projectId && req.body.projectId.includes('/')) {
      return req.body.projectId;
    }
    
    // Try params
    if (req.params?.project_directory) {
      return req.params.project_directory;
    }
    
    // Try query params
    if (req.query?.project_directory) {
      return req.query.project_directory;
    }
    
    return null;
  }

  /**
   * Determine what action was performed
   */
  determineAction(req) {
    const method = req.method;
    const path = req.path;
    
    if (method === 'POST') {
      if (path.includes('/memory')) return 'Uploaded Memory';
      if (path.includes('/projects')) return 'Registered Project';
      if (path.includes('/conversations')) return 'Added Conversation';
      if (path.includes('/search')) return 'Searched';
      return 'Created';
    }
    
    if (method === 'GET') {
      if (path.includes('/memory')) return 'Retrieved Memory';
      if (path.includes('/projects')) return 'Listed Projects';
      if (path.includes('/conversations')) return 'Retrieved Conversations';
      if (path.includes('/search')) return 'Searched';
      return 'Retrieved';
    }
    
    if (method === 'PUT' || method === 'PATCH') return 'Updated';
    if (method === 'DELETE') return 'Deleted';
    
    return 'Unknown';
  }

  /**
   * Log a visit
   */
  async logVisit(visitData) {
    try {
      // Add to recent visitors cache
      this.recentVisitors.unshift(visitData);
      
      // Trim cache if too large
      if (this.recentVisitors.length > this.maxRecentVisitors) {
        this.recentVisitors = this.recentVisitors.slice(0, this.maxRecentVisitors);
      }
      
      // Store in database as a special conversation type
      if (this.memoryHub && this.memoryHub.db) {
        try {
          await this.memoryHub.db.addConversation({
            id: uuidv4(),
            platform: 'visitor_log',
            project_id: visitData.project_id || 'memory-hub-system',
            message: `${visitData.agent} - ${visitData.action} at ${visitData.endpoint}`,
            context: visitData,
            timestamp: visitData.timestamp,
            type: 'visitor_log'
          });
        } catch (dbError) {
          // Silently skip database logging if it fails
          // This prevents crashes from visitor tracking
        }
      }
    } catch (error) {
      console.error('Error logging visit:', error);
      // Don't throw - visitor tracking shouldn't break the API
    }
  }

  /**
   * Get recent visitors
   */
  getRecentVisitors(limit = 50) {
    return this.recentVisitors.slice(0, limit);
  }

  /**
   * Get recent visitors from database with full details
   */
  async getRecentVisitorsFromDB(limit = 100) {
    try {
      if (!this.memoryHub?.db) {
        return [];
      }

      const visitors = await this.memoryHub.db.getVisitorLogs({ limit });
      
      return visitors.map(v => {
        const context = typeof v.context === 'string' ? JSON.parse(v.context) : v.context;
        return {
          id: v.id,
          agent: context?.agent || 'Unknown',
          ai_type: context?.ai_type || 'unknown',
          project_directory: context?.project_directory || null,
          method: context?.method || '',
          endpoint: context?.endpoint || '',
          project_id: context?.project_id || null,
          action: context?.action || '',
          success: context?.success || false,
          duration_ms: context?.duration_ms || 0,
          timestamp: v.timestamp,
          content_id: context?.content_id || null
        };
      });
    } catch (error) {
      console.error('Error fetching visitors from DB:', error);
      return [];
    }
  }

  /**
   * Get visitor stats
   */
  getVisitorStats() {
    const stats = {
      total_visits: this.recentVisitors.length,
      agents: {},
      endpoints: {},
      actions: {},
      projects: {}
    };
    
    this.recentVisitors.forEach(visit => {
      // Count by agent
      stats.agents[visit.agent] = (stats.agents[visit.agent] || 0) + 1;
      
      // Count by endpoint
      stats.endpoints[visit.endpoint] = (stats.endpoints[visit.endpoint] || 0) + 1;
      
      // Count by action
      stats.actions[visit.action] = (stats.actions[visit.action] || 0) + 1;
      
      // Count by project
      if (visit.project_id) {
        stats.projects[visit.project_id] = (stats.projects[visit.project_id] || 0) + 1;
      }
    });
    
    return stats;
  }

  /**
   * Generate visitor log markdown
   */
  generateVisitorLog() {
    const recentVisits = this.getRecentVisitors(20);
    const stats = this.getVisitorStats();
    
    let markdown = '# 🗺️ Memory Hub Visitor Log\n\n';
    markdown += `**Last Updated:** ${new Date().toISOString()}\n\n`;
    markdown += `**Total Recent Visits:** ${stats.total_visits}\n\n`;
    
    markdown += '## 📊 Visitor Statistics\n\n';
    markdown += '### By Agent\n';
    Object.entries(stats.agents).forEach(([agent, count]) => {
      markdown += `- **${agent}:** ${count} visits\n`;
    });
    
    markdown += '\n### By Action\n';
    Object.entries(stats.actions).forEach(([action, count]) => {
      markdown += `- **${action}:** ${count} times\n`;
    });
    
    markdown += '\n### Active Projects\n';
    Object.entries(stats.projects).forEach(([project, count]) => {
      markdown += `- **${project}:** ${count} interactions\n`;
    });
    
    markdown += '\n## 🚪 Recent Visitors\n\n';
    recentVisits.forEach(visit => {
      const date = new Date(visit.timestamp).toLocaleString();
      markdown += `### ${date}\n`;
      markdown += `**Agent:** ${visit.agent}\n`;
      markdown += `**Action:** ${visit.action}\n`;
      markdown += `**Endpoint:** \`${visit.method} ${visit.endpoint}\`\n`;
      if (visit.project_id) {
        markdown += `**Project:** ${visit.project_id}\n`;
      }
      markdown += `**Duration:** ${visit.duration_ms}ms\n`;
      markdown += `**Status:** ${visit.success ? '✅ Success' : '❌ Failed'}\n\n`;
      markdown += '---\n\n';
    });
    
    return markdown;
  }
}

module.exports = AIVisitorTracker;
