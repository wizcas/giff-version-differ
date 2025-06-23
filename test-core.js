#!/usr/bin/env node

import { getCommitsBetween } from "./lib/core.js";

console.log("🧪 Testing Git Version Differ Core Module...");

// Test the core function
const testOptions = {
  repoUrl: "https://github.com/octocat/Hello-World",
  from: "v1.0.0",
  to: "HEAD",
  token: process.env.GITHUB_TOKEN,
  targetDir: null,
  excludeDir: null,
  restOnly: false,
};

console.log("Test 1: Core function with minimal options");
try {
  const result = await getCommitsBetween(testOptions);

  if (result.success) {
    console.log("✅ Core function works");
    console.log(`Found ${result.totalCommits} commits`);
    console.log(`API used: ${result.apiUsed}`);
    console.log(`Elapsed time: ${result.elapsedTime}`);
  } else {
    console.log("❌ Core function failed:");
    console.log(result.error);
  }
} catch (error) {
  console.log("❌ Test failed:", error.message);
}

console.log("\n🎉 Core module tests completed!");
console.log("💡 To test the Vercel function locally, run: pnpm vercel-dev");
console.log("🌐 Then visit: http://localhost:3000/git-diff?repo=https://github.com/owner/repo&from=tag1&to=tag2");
