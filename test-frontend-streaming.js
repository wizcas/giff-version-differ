/**
 * Frontend test to verify streaming API integration
 */

async function testFrontendStreaming() {
  console.log("Testing frontend streaming functionality...");

  // Test with a repository that has working tags
  const testData = {
    repo: "https://github.com/microsoft/vscode",
    from: "1.80.0",
    to: "1.81.0",
    token: "", // Add your token here if needed
  };

  try {
    const params = new URLSearchParams(testData);
    const response = await fetch(`http://localhost:3000/api/git-diff/stream?${params}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log("✅ Stream started successfully");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let allCommits = [];
    let eventCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        try {
          const data = JSON.parse(trimmedLine);
          eventCount++;

          switch (data.type) {
            case "start":
              console.log(`📡 Started: ${data.repoUrl} at ${data.timestamp}`);
              break;

            case "progress":
              console.log(`⏳ Progress: ${data.status}`);
              break;

            case "commits":
              allCommits = allCommits.concat(data.commits);
              console.log(`📦 Batch ${eventCount}: +${data.commits.length} commits (${data.progress.processed}/${data.progress.total})`);
              break;

            case "complete":
              console.log(`✅ Complete: ${data.totalCommits} commits in ${data.elapsedTime}`);
              break;

            case "error":
              console.error(`❌ API Error: ${data.error}`);
              break;
          }
        } catch (parseError) {
          console.warn(`⚠️ Parse error:`, parseError.message);
        }
      }
    }

    console.log(`\n📊 Final Results:`);
    console.log(`- Total events: ${eventCount}`);
    console.log(`- Total commits: ${allCommits.length}`);
    console.log(`- First commit: ${allCommits[0]?.hash} - ${allCommits[0]?.message?.substring(0, 50)}...`);
    console.log(
      `- Last commit: ${allCommits[allCommits.length - 1]?.hash} - ${allCommits[allCommits.length - 1]?.message?.substring(0, 50)}...`
    );

    if (allCommits.length > 100) {
      console.log(`🎉 SUCCESS: Got ${allCommits.length} commits (more than 100)!`);
    } else {
      console.log(`⚠️ Only got ${allCommits.length} commits`);
    }

    return { success: true, commits: allCommits, events: eventCount };
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return { success: false, error: error.message };
  }
}

// For browser testing
if (typeof window !== "undefined") {
  window.testFrontendStreaming = testFrontendStreaming;
  console.log("🔧 Test function available as window.testFrontendStreaming()");
}

// For Node.js testing
if (typeof module !== "undefined") {
  module.exports = { testFrontendStreaming };
}
