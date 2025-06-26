#!/usr/bin/env node

/**
 * Test script to verify the repository information fix
 * Tests that the streaming API now includes repository info in completion event
 */

import http from "http";

const testStreamingRepositoryFix = async () => {
  console.log("🧪 Testing repository information fix in streaming API...");

  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      repo: "https://github.com/microsoft/vscode",
      from: "1.90.0",
      to: "1.90.1",
      maxCommits: "5", // Keep it small for testing
    });

    const options = {
      hostname: "localhost",
      port: 3001,
      path: `/api/git-diff/stream?${params}`,
      method: "GET",
    };

    console.log("📡 Making streaming request...");

    const req = http.request(options, (res) => {
      let buffer = "";
      let foundComplete = false;
      let repositoryInfo = null;

      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            const data = JSON.parse(trimmedLine);

            if (data.type === "complete") {
              foundComplete = true;
              repositoryInfo = {
                repository: data.repository,
                fromRef: data.fromRef,
                toRef: data.toRef,
                fromSha: data.fromSha,
                toSha: data.toSha,
              };
              console.log("✅ Found completion event with repository info:");
              console.log("   Repository:", data.repository);
              console.log("   From:", data.fromRef, "(" + data.fromSha + ")");
              console.log("   To:", data.toRef, "(" + data.toSha + ")");

              // Validate the fix
              if (!repositoryInfo.repository || !repositoryInfo.repository.owner || !repositoryInfo.repository.repo) {
                reject(new Error("❌ Repository information missing or incomplete"));
                return;
              }

              console.log("🎉 Test PASSED! Repository information is now included in completion event");
              console.log(`   Frontend can now access: {result.repository.owner}/{result.repository.repo}`);
              console.log(`   Value: ${repositoryInfo.repository.owner}/${repositoryInfo.repository.repo}`);
              resolve();
              return;
            }
          } catch (e) {
            console.warn("⚠️  Failed to parse line:", e.message);
          }
        }
      });

      res.on("end", () => {
        if (!foundComplete) {
          reject(new Error("❌ No completion event found"));
        }
      });

      res.on("error", (error) => {
        reject(new Error(`❌ Request error: ${error.message}`));
      });
    });

    req.on("error", (error) => {
      reject(new Error(`❌ Request failed: ${error.message}`));
    });

    req.end();
  });
};

// Run the test
testStreamingRepositoryFix().catch((error) => {
  console.error("❌ Test FAILED:", error.message);
  process.exit(1);
});
