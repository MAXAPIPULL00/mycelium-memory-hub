#!/usr/bin/env node

// Mycelium Memory Hub Startup Script
const path = require('path');
const { spawn } = require('child_process');

console.log(`
🧠 Mycelium Memory Hub Startup
==================================
Initializing universal AI memory system...
`);

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '3002';

// Start the memory hub
const memoryHubPath = path.join(__dirname, 'core', 'memory-server.js');

const child = spawn('node', [memoryHubPath], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (error) => {
  console.error('❌ Failed to start Mycelium Memory Hub:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`🔌 Mycelium Memory Hub exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Mycelium Memory Hub...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating Mycelium Memory Hub...');
  child.kill('SIGTERM');
});

