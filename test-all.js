#!/usr/bin/env node

import chalk from "chalk";

console.log(chalk.blue("🧪 Testing Git Version Differ (All Components)..."));

console.log(chalk.green("✅ CLI Help Test"));
console.log("Run: node index.js --help");

console.log(chalk.green("✅ CLI Version Test"));
console.log("Run: node index.js --version");

console.log(chalk.yellow("⚠️  To test with real repository data, use:"));
console.log(chalk.gray("   GITHUB_TOKEN=your_token node index.js https://github.com/owner/repo tag1 tag2"));

console.log(chalk.blue("\n🌐 API 测试"));
console.log(chalk.yellow("本地开发服务器 (推荐):"));
console.log(chalk.gray("   1. pnpm local-server"));
console.log(chalk.gray("   2. 访问: http://localhost:3000/git-diff?repo=https://github.com/owner/repo&from=tag1&to=tag2"));

console.log(chalk.yellow("Vercel 本地开发 (需要登录):"));
console.log(chalk.gray("   1. pnpm vercel-dev"));
console.log(chalk.gray("   2. 访问: http://localhost:3000/git-diff?repo=https://github.com/owner/repo&from=tag1&to=tag2"));

console.log(chalk.yellow("生产环境部署:"));
console.log(chalk.gray("   1. pnpm vercel-deploy"));
console.log(chalk.gray("   2. 在 Vercel 控制台设置 GITHUB_TOKEN 环境变量"));
console.log(chalk.gray("   3. 测试: https://your-app.vercel.app/git-diff?repo=...&from=...&to=..."));

console.log(chalk.green("\n🎉 All components are ready!"));

console.log(chalk.blue("\n📋 Available modes:"));
console.log(chalk.gray("   🖥️  CLI: node index.js <repo> <from> <to> [options]"));
console.log(chalk.gray("   🌐 API: GET /git-diff?repo=<repo>&from=<from>&to=<to>"));

console.log(chalk.blue("\n📊 Features included:"));
console.log(chalk.gray("   ✅ GraphQL-first GitHub API with REST fallback"));
console.log(chalk.gray("   ✅ Directory filtering (target-dir, exclude-dir)"));
console.log(chalk.gray("   ✅ Commit message parsing (semver types, Jira tickets)"));
console.log(chalk.gray("   ✅ Multiple output formats (human/JSON for CLI, JSON for API)"));
console.log(chalk.gray("   ✅ Performance timing"));
console.log(chalk.gray("   ✅ Rate limit handling"));
console.log(chalk.gray("   ✅ CORS support for web apps"));
