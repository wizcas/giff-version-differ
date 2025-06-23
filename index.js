#!/usr/bin/env node

/**
 * Git Version Differ - Vercel API Project
 *
 * This is primarily a Vercel serverless API project with an optional CLI tool.
 *
 * API Endpoint: /api/git-diff
 * CLI Tool: node cli.js
 * Local Dev Server: node local-server.js
 */

console.log("🌐 Git Version Differ - Vercel API Project");
console.log("");
console.log("📋 Available commands:");
console.log("  🖥️  CLI:         node cli.js <repo> <from> <to> [options]");
console.log("  🏠 Local API:   pnpm dev");
console.log("  🚀 Vercel Dev:  pnpm vercel-dev");
console.log("  📝 Help:       node cli.js --help");
console.log("");
console.log("🌐 API Endpoint: /api/git-diff");
console.log("📚 Documentation: See README.md and index.md");
console.log("");
console.log("💡 Quick start:");
console.log("  1. pnpm dev");
console.log("  2. Visit: http://localhost:3001/api/git-diff?repo=https://github.com/octocat/Hello-World&from=v1.0&to=HEAD");
console.log("");
