/**
 * Test the Google Apps Script streaming API integration
 */

import { createServer } from "http";
import { streamCommitsBetween } from "./lib/core.js";

// Simulate the Google Apps Script streaming API call
async function testGoogleAppsScriptStreaming() {
  console.log("🧪 Testing Google Apps Script Streaming API Integration...");

  // Test data similar to what GAS would send
  const testParams = {
    repo: "https://github.com/facebook/react",
    from: "v18.2.0",
    to: "v18.3.0",
    token: process.env.GITHUB_TOKEN,
    maxCommits: 100,
  };

  console.log(`Testing: ${testParams.repo} (${testParams.from} → ${testParams.to})`);
  console.log("---");

  try {
    // Build URL like GAS would
    const queryParts = [];
    Object.keys(testParams).forEach((key) => {
      if (testParams[key]) {
        queryParts.push(`${key}=${encodeURIComponent(testParams[key])}`);
      }
    });

    const streamUrl = `http://localhost:3001/api/git-diff/stream?${queryParts.join("&")}`;
    console.log(`Simulated GAS Request URL: ${streamUrl}`);
    console.log("---");

    // Simulate the fetch call that GAS would make
    const response = await fetch(streamUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const responseBody = await response.text();

    // Simulate GAS processing of the streaming response
    const lines = responseBody.split("\n").filter((line) => line.trim());
    console.log(`📦 Received ${lines.length} lines from streaming API`);

    let allCommits = [];
    let finalStats = {};
    let hasError = false;
    let errorMessage = "";
    let progressCount = 0;

    for (let i = 0; i < lines.length; i++) {
      try {
        const data = JSON.parse(lines[i]);

        switch (data.type) {
          case "start":
            console.log(`🚀 Streaming started for ${data.repoUrl} (${data.from} → ${data.to})`);
            break;

          case "progress":
            progressCount++;
            if (progressCount <= 5 || progressCount % 3 === 0) {
              console.log(`📊 Progress: ${data.status}`);
            }
            break;

          case "commits":
            if (data.commits && Array.isArray(data.commits)) {
              allCommits = allCommits.concat(data.commits);
              console.log(`📦 Batch: ${data.commits.length} commits (total: ${allCommits.length})`);
            }
            break;

          case "complete":
            console.log(`✅ Streaming completed: ${data.totalCommits} total commits`);
            finalStats = {
              totalCommits: data.totalCommits,
              elapsedTime: data.elapsedTime,
              fetchStats: data.fetchStats,
              apiUsed: data.apiUsed,
              repository: data.repository,
            };
            break;

          case "error":
            hasError = true;
            errorMessage = data.error;
            console.log(`❌ Streaming error: ${errorMessage}`);
            break;
        }
      } catch (parseError) {
        console.log(`⚠️  Failed to parse line ${i + 1}: ${parseError.message}`);
      }
    }

    console.log("---");

    if (hasError) {
      throw new Error(`Streaming API Error: ${errorMessage}`);
    }

    // Simulate GAS success message generation
    let successMessage = `Successfully processed and would insert ${allCommits.length} commits using streaming API.`;
    if (finalStats.fetchStats) {
      successMessage += ` API efficiency: ${finalStats.fetchStats.totalChecked || "N/A"} commits checked in ${
        finalStats.fetchStats.requestCount || "N/A"
      } requests.`;
    }
    if (finalStats.elapsedTime) {
      successMessage += ` Total time: ${finalStats.elapsedTime}.`;
    }

    console.log("📋 GAS Success Message:");
    console.log(successMessage);
    console.log("---");

    // Performance analysis
    console.log("📊 Performance Analysis:");
    console.log(`   Total commits: ${allCommits.length}`);
    console.log(`   Progress updates: ${progressCount}`);
    console.log(`   API method: ${finalStats.apiUsed}`);
    if (finalStats.fetchStats) {
      console.log(`   Commits checked: ${finalStats.fetchStats.totalChecked}`);
      console.log(`   API requests: ${finalStats.fetchStats.requestCount}`);
      console.log(`   Fetch time: ${finalStats.fetchStats.fetchTime}`);

      if (finalStats.fetchStats.totalChecked > 0) {
        const efficiency = Math.round((allCommits.length / finalStats.fetchStats.totalChecked) * 100);
        console.log(`   Efficiency: ${efficiency}%`);
      }
    }

    console.log("✅ Google Apps Script streaming integration test passed!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    throw error;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testGoogleAppsScriptStreaming().catch(console.error);
}

export { testGoogleAppsScriptStreaming };
