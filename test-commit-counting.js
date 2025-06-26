/**
 * Test commit counting and logging functionality
 */

import { streamCommitsBetween } from "./lib/core.js";

async function testCommitCounting() {
  console.log("🧪 Testing commit counting and logging...");

  // Test with a smaller repository that has recent tags
  const options = {
    repoUrl: "https://github.com/facebook/react",
    from: "v18.2.0",
    to: "v18.3.0",
    token: process.env.GITHUB_TOKEN,
    maxCommits: 100, // Limit to see the optimization
  };

  console.log(`Testing with ${options.repoUrl} from ${options.from} to ${options.to}`);
  console.log(`Max commits: ${options.maxCommits}`);
  console.log("---");

  let progressCount = 0;
  let commitBatchCount = 0;

  const startTime = Date.now();

  try {
    const result = await streamCommitsBetween(
      options,
      // onCommitBatch callback
      (commits, progress) => {
        commitBatchCount++;
        console.log(`📦 Batch ${commitBatchCount}: ${commits.length} commits processed (${progress.processed}/${progress.total})`);

        // Show first commit in each batch
        if (commits.length > 0) {
          const firstCommit = commits[0];
          console.log(`   First: ${firstCommit.hash} - ${firstCommit.message.substring(0, 60)}...`);
        }
      },
      // onProgress callback
      (message) => {
        progressCount++;
        console.log(`📊 Progress ${progressCount}: ${message}`);
      }
    );

    const endTime = Date.now();
    console.log("---");
    console.log("✅ Test completed successfully!");
    console.log(`⏱️  Total time: ${endTime - startTime}ms`);
    console.log(`📈 Progress updates: ${progressCount}`);
    console.log(`📦 Commit batches: ${commitBatchCount}`);
    console.log(`📊 Final result:`, {
      success: result.success,
      totalCommits: result.totalCommits,
      summary: result.summary,
      fetchStats: result.fetchStats,
      apiUsed: result.apiUsed,
      elapsedTime: result.elapsedTime,
    });
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testCommitCounting().catch(console.error);
