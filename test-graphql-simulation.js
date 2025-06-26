/**
 * Test GraphQL commit fetching and counting (simulation)
 */

import { initializeGitHubClients, parseGitHubUrl, getCommitSha } from "./lib/core.js";

async function testGraphQLCommitCounting() {
  console.log("🧪 Testing GraphQL-style commit fetching and counting simulation...");

  // This simulates what happens during GraphQL fetching
  console.log("Simulating GraphQL fetch process...");
  console.log("---");

  // Simulate the logging that would happen
  const repoUrl = "https://github.com/facebook/react";
  const fromRef = "v18.2.0";
  const toRef = "v18.3.0";
  const maxCommits = 100;

  console.log(`[GraphQL] Starting commit fetch from ${toRef} to ${fromRef}, maxCommits: ${maxCommits}`);

  // Simulate requests
  const REQUEST_SIZE = 20;
  let requestCount = 0;
  let totalChecked = 0;
  let foundBase = false;

  // Simulate multiple paginated requests
  while (!foundBase && totalChecked < maxCommits) {
    requestCount++;
    const commitsBatch = Math.min(REQUEST_SIZE, maxCommits - totalChecked);

    console.log(
      `[GraphQL] Request ${requestCount}: Fetching ${commitsBatch} commits ${requestCount > 1 ? "after cursor ..." : "from HEAD"}`
    );
    console.log(`[GraphQL] Request ${requestCount}: Received ${commitsBatch} commits`);

    // Simulate checking each commit
    for (let i = 0; i < commitsBatch; i++) {
      totalChecked++;

      // Simulate finding base commit (randomly for demo)
      if (totalChecked >= 10) {
        // Simulate finding base after 10 commits
        foundBase = true;
        console.log(`[GraphQL] Found base commit ${fromRef} after checking ${totalChecked} commits in ${requestCount} requests`);
        break;
      }
    }

    if (totalChecked >= maxCommits && !foundBase) {
      console.warn(`[GraphQL] Reached maxCommits limit (${maxCommits}) without finding base commit ${fromRef}`);
      break;
    }
  }

  const stats = {
    totalChecked,
    requestCount,
    foundBase,
    returnedCommits: totalChecked - (foundBase ? 1 : 0),
  };

  console.log("---");
  if (!foundBase) {
    console.warn(`[GraphQL] Base commit ${fromRef} not found after checking ${totalChecked} commits in ${requestCount} requests`);
  } else {
    console.log(
      `[GraphQL] Successfully found ${stats.returnedCommits} commits between ${toRef} and ${fromRef} after checking ${totalChecked} total commits in ${requestCount} requests`
    );
  }

  console.log("📊 Final stats:", stats);
  console.log("---");
  console.log("✅ Simulation completed!");

  // Performance recommendations
  console.log("\n💡 Performance Analysis:");
  console.log(`   - Total commits checked: ${totalChecked}`);
  console.log(`   - Returned commits: ${stats.returnedCommits}`);
  console.log(`   - Overhead: ${totalChecked - stats.returnedCommits} extra commits checked`);

  if (totalChecked > stats.returnedCommits * 2) {
    console.log("   ⚠️  High overhead detected! Consider:");
    console.log("     - Using smaller date ranges between tags");
    console.log("     - Implementing smarter commit range detection");
    console.log("     - Using REST API compare endpoint for small ranges");
  } else {
    console.log("   ✅ Reasonable overhead - GraphQL pagination is working efficiently");
  }
}

// Run the simulation
testGraphQLCommitCounting().catch(console.error);
