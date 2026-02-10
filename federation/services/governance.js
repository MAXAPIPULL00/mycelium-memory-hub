// Federation Hub v2 - Governance Service
// Task 22: Federation Governance Implementation
// Requirements: 16.1-16.7

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class FederationGovernance {
  constructor(federationHub) {
    this.hub = federationHub;
    this.db = federationHub.db;
    
    // Federation mode: 'open', 'approval', 'invite'
    this.mode = 'open';
    
    // Node roles
    this.roles = new Map(); // nodeId -> role
    
    // Pending join requests (for approval mode)
    this.pendingRequests = new Map();
    
    // Invite tokens (for invite mode)
    this.inviteTokens = new Map();
    
    // Banned nodes
    this.bannedNodes = new Set();
  }

  async initialize() {
    await this.loadGovernanceState();
    console.log('🏛️ Governance service initialized');
  }

  async loadGovernanceState() {
    try {
      // Load mode
      const config = await this.db.get(`SELECT * FROM federation_config WHERE key = 'mode'`);
      if (config) {
        this.mode = config.value;
      }

      // Load roles
      const roles = await this.db.all(`SELECT * FROM federation_node_roles`);
      for (const role of roles || []) {
        this.roles.set(role.node_id, role.role);
      }

      // Load banned nodes
      const banned = await this.db.all(`SELECT node_id FROM federation_banned_nodes`);
      for (const node of banned || []) {
        this.bannedNodes.add(node.node_id);
      }
    } catch (error) {
      console.log('⚠️ Governance tables not ready');
    }
  }

  // Requirement 16.1: Set federation mode
  async setMode(mode, adminNode) {
    if (!['open', 'approval', 'invite'].includes(mode)) {
      return { success: false, error: 'Invalid mode' };
    }

    // Only admins can change mode
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    this.mode = mode;

    try {
      await this.db.run(`
        INSERT OR REPLACE INTO federation_config (key, value, updated_at)
        VALUES ('mode', ?, ?)
      `, [mode, new Date().toISOString()]);
    } catch (error) {
      console.error('Failed to save mode:', error);
    }

    // Broadcast mode change
    await this.broadcastAnnouncement(`Federation mode changed to: ${mode}`, adminNode);

    return { success: true, mode };
  }

  // Requirement 16.2: Handle join request
  async requestJoin(nodeId, nodeInfo) {
    // Check if banned
    if (this.bannedNodes.has(nodeId)) {
      return { success: false, error: 'Node is banned from federation' };
    }

    switch (this.mode) {
      case 'open':
        // Auto-approve
        await this.setRole(nodeId, 'member');
        return { success: true, status: 'approved', role: 'member' };

      case 'approval':
        // Queue for approval
        const requestId = uuidv4();
        this.pendingRequests.set(requestId, {
          request_id: requestId,
          node_id: nodeId,
          node_info: nodeInfo,
          requested_at: new Date().toISOString()
        });

        // Notify admins
        await this.notifyAdmins('join_request', { node_id: nodeId, request_id: requestId });

        return { success: true, status: 'pending', request_id: requestId };

      case 'invite':
        // Require invite token
        return { success: false, error: 'Invite token required', status: 'invite_required' };

      default:
        return { success: false, error: 'Unknown federation mode' };
    }
  }

  // Requirement 16.3: Validate invite token
  async joinWithInvite(nodeId, inviteToken, nodeInfo) {
    // Check if banned
    if (this.bannedNodes.has(nodeId)) {
      return { success: false, error: 'Node is banned from federation' };
    }

    const invite = this.inviteTokens.get(inviteToken);
    if (!invite) {
      return { success: false, error: 'Invalid invite token' };
    }

    // Check expiration
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      this.inviteTokens.delete(inviteToken);
      return { success: false, error: 'Invite token expired' };
    }

    // Check usage limit
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      return { success: false, error: 'Invite token usage limit reached' };
    }

    // Accept the join
    invite.uses = (invite.uses || 0) + 1;
    await this.setRole(nodeId, invite.role || 'member');

    return { success: true, status: 'approved', role: invite.role || 'member' };
  }

  // Create invite token
  async createInvite(adminNode, options = {}) {
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    const token = crypto.randomBytes(16).toString('hex');
    const invite = {
      token,
      created_by: adminNode,
      role: options.role || 'member',
      max_uses: options.max_uses || null,
      uses: 0,
      expires_at: options.expires_at || null,
      created_at: new Date().toISOString()
    };

    this.inviteTokens.set(token, invite);

    return { success: true, invite_token: token, ...invite };
  }

  // Approve pending request
  async approveRequest(requestId, adminNode) {
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    await this.setRole(request.node_id, 'member');
    this.pendingRequests.delete(requestId);

    // Notify the node
    if (this.hub.webSocketPool) {
      await this.hub.webSocketPool.sendToNode(request.node_id, {
        type: 'join_approved',
        role: 'member'
      });
    }

    return { success: true, node_id: request.node_id, role: 'member' };
  }

  // Reject pending request
  async rejectRequest(requestId, adminNode, reason) {
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    this.pendingRequests.delete(requestId);

    // Notify the node
    if (this.hub.webSocketPool) {
      await this.hub.webSocketPool.sendToNode(request.node_id, {
        type: 'join_rejected',
        reason
      });
    }

    return { success: true, node_id: request.node_id };
  }

  // Requirement 16.4: Set node role
  async setRole(nodeId, role, adminNode = null) {
    if (adminNode && !this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!['admin', 'member', 'observer'].includes(role)) {
      return { success: false, error: 'Invalid role' };
    }

    this.roles.set(nodeId, role);

    try {
      await this.db.run(`
        INSERT OR REPLACE INTO federation_node_roles (node_id, role, updated_at)
        VALUES (?, ?, ?)
      `, [nodeId, role, new Date().toISOString()]);
    } catch (error) {
      console.error('Failed to save role:', error);
    }

    return { success: true, node_id: nodeId, role };
  }

  // Requirement 16.5: Ban node
  async banNode(nodeId, adminNode, reason) {
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    this.bannedNodes.add(nodeId);
    this.roles.delete(nodeId);

    try {
      await this.db.run(`
        INSERT INTO federation_banned_nodes (node_id, banned_by, reason, banned_at)
        VALUES (?, ?, ?, ?)
      `, [nodeId, adminNode, reason, new Date().toISOString()]);

      await this.db.run(`DELETE FROM federation_node_roles WHERE node_id = ?`, [nodeId]);
    } catch (error) {
      console.error('Failed to save ban:', error);
    }

    // Disconnect the node
    if (this.hub.webSocketPool) {
      await this.hub.webSocketPool.disconnectNode(nodeId, 'banned');
    }

    return { success: true, node_id: nodeId };
  }

  // Unban node
  async unbanNode(nodeId, adminNode) {
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    this.bannedNodes.delete(nodeId);

    try {
      await this.db.run(`DELETE FROM federation_banned_nodes WHERE node_id = ?`, [nodeId]);
    } catch (error) {
      console.error('Failed to remove ban:', error);
    }

    return { success: true, node_id: nodeId };
  }

  // Requirement 16.6: Broadcast announcement
  async broadcastAnnouncement(message, adminNode) {
    if (!this.isAdmin(adminNode)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (this.hub.eventBus) {
      await this.hub.eventBus.broadcast(adminNode, 'federation.announcement', {
        message,
        from: adminNode,
        timestamp: new Date().toISOString()
      });
    }

    return { success: true };
  }

  // Requirement 16.7: List members
  listMembers() {
    const members = [];
    for (const [nodeId, role] of this.roles) {
      members.push({ node_id: nodeId, role });
    }
    return members;
  }

  // Check if node is admin
  isAdmin(nodeId) {
    return this.roles.get(nodeId) === 'admin';
  }

  // Check if node is member (or higher)
  isMember(nodeId) {
    const role = this.roles.get(nodeId);
    return role === 'admin' || role === 'member';
  }

  // Get node role
  getRole(nodeId) {
    return this.roles.get(nodeId) || null;
  }

  // Notify admins
  async notifyAdmins(eventType, data) {
    for (const [nodeId, role] of this.roles) {
      if (role === 'admin' && this.hub.webSocketPool) {
        await this.hub.webSocketPool.sendToNode(nodeId, {
          type: `admin.${eventType}`,
          ...data
        });
      }
    }
  }

  // Get pending requests
  getPendingRequests() {
    return Array.from(this.pendingRequests.values());
  }

  // Get federation status
  getStatus() {
    return {
      mode: this.mode,
      total_members: this.roles.size,
      admins: Array.from(this.roles.entries()).filter(([, r]) => r === 'admin').length,
      members: Array.from(this.roles.entries()).filter(([, r]) => r === 'member').length,
      observers: Array.from(this.roles.entries()).filter(([, r]) => r === 'observer').length,
      pending_requests: this.pendingRequests.size,
      banned_nodes: this.bannedNodes.size
    };
  }
}

module.exports = FederationGovernance;
