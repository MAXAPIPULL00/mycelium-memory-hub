// Project Scanner - Discovers all SCRI AI projects automatically
const fs = require('fs-extra');
const path = require('path');

class ProjectScanner {
  constructor() {
    this.scriAIRoot = process.env.PROJECT_SCAN_ROOT || process.cwd();
    this.projectTypes = {
      'package.json': 'node.js',
      'requirements.txt': 'python',
      'Cargo.toml': 'rust',
      'go.mod': 'go',
      'composer.json': 'php',
      'pom.xml': 'java',
      '.csproj': 'dotnet'
    };
  }

  async scanForProjects() {
    const projects = [];
    
    try {
      const entries = await fs.readdir(this.scriAIRoot, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(this.scriAIRoot, entry.name);
          const project = await this.analyzeProject(projectPath, entry.name);
          
          if (project) {
            projects.push(project);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning projects:', error);
    }

    return projects;
  }

  async analyzeProject(projectPath, projectName) {
    try {
      const files = await fs.readdir(projectPath);
      const projectType = this.detectProjectType(files);
      
      if (!projectType) return null;

      const project = {
        id: projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: projectName,
        path: projectPath,
        type: projectType,
        framework: await this.detectFramework(projectPath, files),
        lastModified: await this.getLastModified(projectPath),
        aiEnabled: await this.isAIEnabled(projectPath, files),
        config: await this.getProjectConfig(projectPath, projectType)
      };

      return project;
    } catch (error) {
      console.error(`Error analyzing project ${projectName}:`, error);
      return null;
    }
  }

  detectProjectType(files) {
    for (const [configFile, type] of Object.entries(this.projectTypes)) {
      if (files.includes(configFile)) {
        return type;
      }
    }
    return null;
  }

  async detectFramework(projectPath, files) {
    if (files.includes('package.json')) {
      try {
        const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (deps['next']) return 'next.js';
        if (deps['react']) return 'react';
        if (deps['express']) return 'express';
        if (deps['fastify']) return 'fastify';
        if (deps['vue']) return 'vue';
        if (deps['angular']) return 'angular';
        
        return 'node.js';
      } catch (error) {
        return 'node.js';
      }
    }
    
    if (files.includes('requirements.txt')) {
      try {
        const requirements = await fs.readFile(path.join(projectPath, 'requirements.txt'), 'utf8');
        if (requirements.includes('fastapi')) return 'fastapi';
        if (requirements.includes('flask')) return 'flask';
        if (requirements.includes('django')) return 'django';
        return 'python';
      } catch (error) {
        return 'python';
      }
    }

    return 'unknown';
  }

  async getLastModified(projectPath) {
    try {
      const stats = await fs.stat(projectPath);
      return stats.mtime;
    } catch (error) {
      return new Date();
    }
  }

  async isAIEnabled(projectPath, files) {
    // Check for SCRI Core Memory integration markers
    const aiMarkers = [
      'memory-hub-platform',
      'memory-hub-vscode',
      '.memory-hub',
      'ai-generated'
    ];

    for (const marker of aiMarkers) {
      if (files.includes(marker)) return true;
    }

    // Check package.json for AI dependencies
    if (files.includes('package.json')) {
      try {
        const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (deps['memory-hub-helper'] || deps['@mycelium/memory-hub']) return true;
      } catch (error) {
        // Ignore
      }
    }

    return false;
  }

  async getProjectConfig(projectPath, projectType) {
    const config = {
      aiContext: {},
      preferences: {},
      patterns: []
    };

    // Try to load existing SCRI Core Memory config
    const configPaths = [
      path.join(projectPath, '.memory-hub.json'),
      path.join(projectPath, 'scri-core-memory-config.json'),
      path.join(projectPath, '.ai', 'config.json')
    ];

    for (const configPath of configPaths) {
      try {
        if (await fs.pathExists(configPath)) {
          const existingConfig = await fs.readJson(configPath);
          Object.assign(config, existingConfig);
          break;
        }
      } catch (error) {
        // Ignore
      }
    }

    return config;
  }

  // Backward compatibility alias
  async scan() {
    return await this.scanForProjects();
  }
}

module.exports = ProjectScanner;

