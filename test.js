#!/usr/bin/env node

// Simple test script to verify the CLI functionality without hitting rate limits

import { execSync } from "child_process";

console.log("🧪 Testing Git Version Differ CLI...\n");

// Test 1: Help command
console.log("Test 1: Help command");
try {
  const help = execSync("pnpm start --help", { encoding: "utf8" });
  console.log("✅ Help command works");
} catch (error) {
  console.log("❌ Help command failed:", error.message);
}

// Test 2: Version command
console.log("\nTest 2: Version command");
try {
  const version = execSync("pnpm start --version", { encoding: "utf8" });
  console.log("✅ Version command works");
} catch (error) {
  console.log("❌ Version command failed:", error.message);
}

console.log("\n🎉 Basic CLI tests completed!");
console.log("💡 To test with real data, set GITHUB_TOKEN environment variable and try:");
console.log("   pnpm start https://github.com/owner/repo tag1 tag2");
console.log("📊 Timing will be displayed at the end of each execution!");
