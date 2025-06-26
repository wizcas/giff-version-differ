/**
 * Test script for Google Apps Script integration
 * Copy this code to Google Apps Script to test the streaming API
 */

function testGitDifferStreaming() {
  // Configuration
  const config = {
    baseUrl: "http://localhost:3000", // Change to your deployed URL
    repo: "https://github.com/vercel/next.js",
    from: "v14.0.0",
    to: "v14.0.1",
    // token: 'your-github-token', // Uncomment for private repos
  };

  console.log("Testing Git Differ Streaming API...");
  console.log("Configuration:", config);

  try {
    // Test the streaming endpoint
    const result = fetchCommitsStream(config);

    console.log("✅ Success!");
    console.log(`Total commits received: ${result.commits.length}`);
    console.log(`Processing time: ${result.elapsedTime}`);

    if (result.commits.length > 0) {
      console.log("First commit:", result.commits[0]);
      console.log("Last commit:", result.commits[result.commits.length - 1]);
    }

    return result;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

function fetchCommitsStream(config) {
  const params = new URLSearchParams({
    repo: config.repo,
    from: config.from,
    to: config.to,
  });

  if (config.token) {
    params.append("token", config.token);
  }

  if (config.targetDir) {
    params.append("targetDir", config.targetDir);
  }

  if (config.excludeSubPaths) {
    params.append("excludeSubPaths", config.excludeSubPaths);
  }

  const url = `${config.baseUrl}/api/git-diff/stream?${params.toString()}`;
  console.log("Fetching:", url);

  // In Google Apps Script, use UrlFetchApp
  // For local testing, we'll simulate the response parsing
  const response = UrlFetchApp.fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/x-ndjson",
    },
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }

  const lines = response.getContentText().split("\\n");
  let allCommits = [];
  let totalCommits = 0;
  let elapsedTime = "0ms";
  let processingStatus = "Starting...";

  console.log(`Processing ${lines.length} response lines...`);

  lines.forEach((line, index) => {
    if (line.trim()) {
      try {
        const data = JSON.parse(line);

        switch (data.type) {
          case "start":
            console.log(`📡 Started: ${data.repoUrl} (${data.timestamp})`);
            processingStatus = "Processing...";
            break;

          case "progress":
            console.log(`⏳ ${data.status}`);
            processingStatus = data.status;
            break;

          case "commits":
            allCommits = allCommits.concat(data.commits);
            console.log(
              `📦 Batch ${Math.floor(index / 10) + 1}: +${data.commits.length} commits (${data.progress.processed}/${data.progress.total})`
            );
            break;

          case "complete":
            totalCommits = data.totalCommits;
            elapsedTime = data.elapsedTime;
            console.log(`✅ Complete: ${totalCommits} commits in ${elapsedTime}`);
            processingStatus = "Completed";
            break;

          case "error":
            throw new Error(`API Error: ${data.error}`);

          default:
            console.log(`Unknown event type: ${data.type}`);
        }
      } catch (parseError) {
        console.warn(`Failed to parse line ${index + 1}: ${line.substring(0, 100)}...`);
      }
    }
  });

  return {
    commits: allCommits,
    totalCommits: totalCommits || allCommits.length,
    elapsedTime: elapsedTime,
    status: processingStatus,
    success: true,
  };
}

// For local testing (not needed in Google Apps Script)
function simulateUrlFetchApp() {
  if (typeof UrlFetchApp === "undefined") {
    // Use Node.js fetch for local testing
    const { default: fetch } = require("node-fetch");
    global.UrlFetchApp = {
      fetch: async function (url, options) {
        const response = await fetch(url, options);
        return {
          getResponseCode: () => response.status,
          getContentText: () => response.text(),
        };
      },
    };
  }
}

// Test runner for both local and Google Apps Script environments
async function runTest() {
  // Enable simulation for local testing
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    console.log("Running in Node.js environment - enabling fetch simulation");
    simulateUrlFetchApp();
  }
  
  try {
    const result = await testGitDifferStreaming();
    console.log("✅ Test completed successfully!");
    return result;
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    throw error;
  }
}

// Uncomment for local testing
// runTest();
