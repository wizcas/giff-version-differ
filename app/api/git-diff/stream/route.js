import { streamCommitsBetween } from "../../../../lib/core.js";

/**
 * Streaming API endpoint optimized for Google Apps Script
 * Returns data as JSON Lines (one JSON object per line)
 */

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get("repo");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const token = searchParams.get("token");
    const targetDir = searchParams.get("targetDir");
    const excludeSubPaths = searchParams.get("excludeSubPaths");
    const restOnly = searchParams.get("restOnly");

    // Validate required parameters
    if (!repo || !from || !to) {
      return new Response(
        JSON.stringify({
          type: "error",
          success: false,
          error: "Missing required parameters: repo, from, to",
        }) + "\n",
        {
          status: 400,
          headers: {
            "Content-Type": "application/x-ndjson",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const options = {
      repoUrl: repo,
      from,
      to,
      token: token || process.env.GITHUB_TOKEN,
      targetDir: targetDir || null,
      excludeSubPaths: excludeSubPaths || null,
      restOnly: restOnly === "true" || restOnly === "1",
      maxCommits: searchParams.get("maxCommits") ? parseInt(searchParams.get("maxCommits"), 10) : 10000,
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const startTime = Date.now();

          // Send initial metadata
          const metadata = {
            type: "start",
            repoUrl: options.repoUrl,
            from: options.from,
            to: options.to,
            targetDir: options.targetDir,
            excludeSubPaths: options.excludeSubPaths,
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(encoder.encode(JSON.stringify(metadata) + "\n"));

          // Stream commits
          const onCommitBatch = (commits, progress) => {
            const chunk = {
              type: "commits",
              commits,
              progress,
              timestamp: new Date().toISOString(),
            };
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          };

          const onProgress = (status) => {
            const chunk = {
              type: "progress",
              status,
              timestamp: new Date().toISOString(),
            };
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          };

          // Process commits
          const result = await streamCommitsBetween(options, onCommitBatch, onProgress);

          // Send completion
          const completion = {
            type: "complete",
            success: result.success,
            totalCommits: result.totalCommits,
            summary: result.summary,
            elapsedTime: `${Date.now() - startTime}ms`,
            error: result.error,
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(encoder.encode(JSON.stringify(completion) + "\n"));

          controller.close();
        } catch (error) {
          const errorChunk = {
            type: "error",
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + "\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        type: "error",
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }) + "\n",
      {
        status: 500,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
