/**
 * Quick test to verify the commit count fix
 */

async function testCommitCount() {
  try {
    // Use a repo with known tags (VS Code has many releases)
    const response = await fetch(
      "http://localhost:3000/api/git-diff/stream?repo=https://github.com/microsoft/vscode&from=1.80.0&to=1.81.0&maxCommits=5000"
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.trim());

    console.log(`Total response lines: ${lines.length}`);

    let totalCommits = 0;
    let commitBatches = 0;
    let allCommits = [];

    lines.forEach((line, index) => {
      try {
        const data = JSON.parse(line);

        if (data.type === "commits") {
          commitBatches++;
          allCommits = allCommits.concat(data.commits);
          console.log(`Batch ${commitBatches}: +${data.commits.length} commits (${data.progress.processed}/${data.progress.total})`);
        } else if (data.type === "complete") {
          totalCommits = data.totalCommits;
          console.log(`✅ Complete: ${totalCommits} total commits`);
        }
      } catch (err) {
        console.warn(`Failed to parse line ${index + 1}: ${err.message}`);
      }
    });

    console.log(`\n📊 Results:`);
    console.log(`- Response lines: ${lines.length}`);
    console.log(`- Commit batches: ${commitBatches}`);
    console.log(`- Commits received: ${allCommits.length}`);
    console.log(`- Reported total: ${totalCommits}`);

    if (allCommits.length > 100) {
      console.log(`🎉 SUCCESS: Got ${allCommits.length} commits (more than 100)!`);
    } else {
      console.log(`❌ ISSUE: Only got ${allCommits.length} commits (100 or less)`);
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testCommitCount();
