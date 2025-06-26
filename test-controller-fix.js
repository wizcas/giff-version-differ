/**
 * Quick test to verify the controller fix
 */

async function testStreamingFix() {
  console.log("Testing streaming API controller fix...");

  try {
    const response = await fetch(
      "http://localhost:3000/api/git-diff/stream?repo=https://github.com/microsoft/vscode&from=1.80.0&to=1.81.0"
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log("✅ Stream started without controller error");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventCount = 0;
    let commitCount = 0;

    try {
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

            if (data.type === "commits") {
              commitCount += data.commits.length;
              console.log(`📦 Batch: +${data.commits.length} commits (total: ${commitCount})`);
            } else if (data.type === "complete") {
              console.log(`✅ Completed: ${data.totalCommits} commits in ${data.elapsedTime}`);
            } else if (data.type === "error") {
              console.error(`❌ API Error: ${data.error}`);
            } else {
              console.log(`📡 ${data.type}: ${data.status || "event"}`);
            }
          } catch (parseError) {
            console.warn(`⚠️ Parse error:`, parseError.message);
          }
        }
      }
    } catch (streamError) {
      console.error(`❌ Stream reading error: ${streamError.message}`);
    } finally {
      reader.releaseLock();
    }

    console.log(`\n📊 Results:`);
    console.log(`- Total events: ${eventCount}`);
    console.log(`- Total commits: ${commitCount}`);

    if (commitCount > 0) {
      console.log(`🎉 SUCCESS: Controller fix works! Got ${commitCount} commits`);
    } else {
      console.log(`⚠️ No commits received`);
    }

    return { success: true, events: eventCount, commits: commitCount };
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return { success: false, error: error.message };
  }
}

testStreamingFix();
