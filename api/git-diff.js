import { getCommitsBetween } from "../lib/core.js";

/**
 * Vercel serverless function to get commits between two Git references
 * GET /api/git-diff?repo=<repo-url>&from=<from-ref>&to=<to-ref>&[options]
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // Only allow GET method
  if (req.method !== "GET") {
    console.error(`[API Error] Method not allowed: ${req.method} ${req.url}`);
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET method.",
    });
  }

  try {
    const { repo, from, to, token, targetDir, excludeDir, restOnly } = req.query; // Validate required parameters
    if (!repo) {
      console.error(`[API Error] Missing repo parameter: ${req.url}`);
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: repo (GitHub repository URL)",
      });
    }

    if (!from) {
      console.error(`[API Error] Missing from parameter: ${req.url}`);
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: from (starting tag or commit hash)",
      });
    }

    if (!to) {
      console.error(`[API Error] Missing to parameter: ${req.url}`);
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: to (ending tag or commit hash)",
      });
    }

    // Prepare options
    const options = {
      repoUrl: repo,
      from,
      to,
      token: token || process.env.GITHUB_TOKEN,
      targetDir: targetDir || null,
      excludeDir: excludeDir || null,
      restOnly: restOnly === "true" || restOnly === "1",
    };

    // Get commits
    const result = await getCommitsBetween(options);
    if (result.success) {
      console.log(`[API Success] ${repo} ${from}..${to} - ${result.totalCommits} commits (${result.elapsedTime})`);
      return res.status(200).json(result);
    } else {
      console.error(`[API Error] ${repo} ${from}..${to} - ${result.error}`);
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error(`[API Exception] ${req.url} - ${error.message}`, error.stack);
    return res.status(500).json({
      success: false,
      error: error.message,
      elapsedTime: "0ms",
    });
  }
}
