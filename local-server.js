#!/usr/bin/env node

import http from "http";
import url from "url";
import { getCommitsBetween } from "./lib/core.js";

const PORT = 3001;

/**
 * 简单的本地 HTTP 服务器用于测试 API 功能
 */
const server = http.createServer(async (req, res) => {
  // 设置 CORS 头
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  // 处理预检请求
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  // 只允许 GET 请求
  if (req.method !== "GET") {
    console.error(`[Local Server Error] Method not allowed: ${req.method} ${req.url}`);
    res.writeHead(405);
    res.end(
      JSON.stringify({
        success: false,
        error: "Method not allowed. Use GET method.",
      })
    );
    return;
  }
  const parsedUrl = url.parse(req.url, true);

  // 处理 /api/git-diff 路径 (支持 /git-diff 向后兼容)
  if (parsedUrl.pathname === "/api/git-diff" || parsedUrl.pathname === "/git-diff") {
    try {
      const { repo, from, to, token, targetDir, excludeDir, restOnly } = parsedUrl.query; // 验证必需参数
      if (!repo) {
        console.error(`[Local Server Error] Missing repo parameter: ${req.url}`);
        res.writeHead(400);
        res.end(
          JSON.stringify({
            success: false,
            error: "Missing required parameter: repo (GitHub repository URL)",
          })
        );
        return;
      }

      if (!from) {
        console.error(`[Local Server Error] Missing from parameter: ${req.url}`);
        res.writeHead(400);
        res.end(
          JSON.stringify({
            success: false,
            error: "Missing required parameter: from (starting tag or commit hash)",
          })
        );
        return;
      }

      if (!to) {
        console.error(`[Local Server Error] Missing to parameter: ${req.url}`);
        res.writeHead(400);
        res.end(
          JSON.stringify({
            success: false,
            error: "Missing required parameter: to (ending tag or commit hash)",
          })
        );
        return;
      }

      // 准备选项
      const options = {
        repoUrl: repo,
        from,
        to,
        token: token || process.env.GITHUB_TOKEN,
        targetDir: targetDir || null,
        excludeDir: excludeDir || null,
        restOnly: restOnly === "true" || restOnly === "1",
      };

      console.log(`🔍 Processing request: ${repo} ${from}..${to}`);

      // 获取提交信息
      const result = await getCommitsBetween(options);
      if (result.success) {
        res.writeHead(200);
        res.end(JSON.stringify(result, null, 2));
        console.log(`✅ Success: Found ${result.totalCommits} commits (${result.elapsedTime})`);
      } else {
        res.writeHead(500);
        res.end(JSON.stringify(result, null, 2));
        console.error(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      res.writeHead(500);
      res.end(
        JSON.stringify(
          {
            success: false,
            error: error.message,
            elapsedTime: "0ms",
          },
          null,
          2
        )
      );
      console.error(`❌ Server error: ${error.message}`, error.stack);
    }
  } else {
    // 处理其他路径
    res.writeHead(404);
    res.end(
      JSON.stringify({
        success: false,
        error: "Not found. Use /api/git-diff endpoint.",
        usage: "GET /api/git-diff?repo=<repo-url>&from=<from-ref>&to=<to-ref>",
        endpoints: ["/api/git-diff", "/git-diff"],
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Local API server running at http://localhost:${PORT}`);
  console.log(`📋 Primary endpoint: http://localhost:${PORT}/api/git-diff`);
  console.log(`📋 Legacy endpoint: http://localhost:${PORT}/git-diff`);
  console.log(`💡 Example: http://localhost:${PORT}/api/git-diff?repo=https://github.com/owner/repo&from=tag1&to=tag2`);
  console.log(`🔑 Set GITHUB_TOKEN environment variable for higher rate limits`);
  console.log(`⏹️  Press Ctrl+C to stop the server`);
});

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down server...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
