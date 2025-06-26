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
  const params = [`repo=${config.repo}`, `from=${config.from}`, `to=${config.to}`];

  if (config.token) {
    params.push(`token=${config.token}`);
  }

  if (config.targetDir) {
    params.push(`targetDir=${config.targetDir}`);
  }

  if (config.excludeSubPaths) {
    params.push(`excludeSubPaths=${config.targetDir}`);
  }

  const url = `${config.baseUrl}/api/git-diff/stream?${params.filter(Boolean).join("&")}`;
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

  const responseText = response.getContentText();
  console.log(`Response length: ${responseText.length} characters`);

  // Parse JSON Lines format: each line should be a complete JSON object
  // JSON.stringify() properly escapes newlines as \n within strings
  let allCommits = [];
  let totalCommits = 0;
  let elapsedTime = "0ms";
  let processingStatus = "Starting...";

  // Split response into lines - each line should be a complete JSON object
  const lines = responseText.split("\n");
  console.log(`Processing ${lines.length} lines...`);

  let processedLines = 0;

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return; // Skip empty lines

    try {
      const data = JSON.parse(trimmedLine);
      processedLines++;

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
          console.log(`📦 Event ${processedLines}: +${data.commits.length} commits (${data.progress.processed}/${data.progress.total})`);
          // Log first commit for debugging
          if (data.commits.length > 0) {
            const firstCommit = data.commits[0];
            console.log(`   Sample: ${firstCommit.hash} - ${firstCommit.message.substring(0, 50)}...`);
          }
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
      console.warn(`Failed to parse line ${index + 1} (length: ${trimmedLine.length}): ${parseError.message}`);
      console.warn(`Line content: ${trimmedLine.substring(0, 200)}...`);

      // Try to find where the JSON might be malformed
      if (trimmedLine.includes('{"type"')) {
        const jsonStart = trimmedLine.indexOf('{"type"');
        const potentialJson = trimmedLine.substring(jsonStart);
        console.warn(`Potential JSON starts at position ${jsonStart}: ${potentialJson.substring(0, 100)}...`);
      }
    }
  });

  console.log(`Successfully processed ${processedLines} JSON objects out of ${lines.length} lines`);

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
    global.UrlFetchApp = {
      fetch: function (url, options) {
        const fetch = require("node-fetch");
        return {
          getResponseCode: () => 200,
          getContentText: () => {
            // Simulate streaming response
            return (
              JSON.stringify({ type: "start", timestamp: new Date().toISOString() }) +
              "\\n" +
              JSON.stringify({ type: "progress", status: "Fetching commits..." }) +
              "\\n" +
              JSON.stringify({ type: "commits", commits: [{ hash: "abc123", author: "Test" }], progress: { processed: 1, total: 1 } }) +
              "\\n" +
              JSON.stringify({ type: "complete", success: true, totalCommits: 1, elapsedTime: "500ms" }) +
              "\\n"
            );
          },
        };
      },
    };
  }
}

// Uncomment for local testing
// simulateUrlFetchApp();
// testGitDifferStreaming();
