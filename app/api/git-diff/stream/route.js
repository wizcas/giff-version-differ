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
    let isCancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        let isControllerClosed = false;

        const safeEnqueue = (data) => {
          try {
            if (!isControllerClosed && !isCancelled) {
              controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            }
          } catch (error) {
            console.error("[Stream] Failed to enqueue data:", error.message);
            isControllerClosed = true;
          }
        };

        const safeClose = () => {
          try {
            if (!isControllerClosed && !isCancelled) {
              controller.close();
              isControllerClosed = true;
            }
          } catch (error) {
            console.error("[Stream] Failed to close controller:", error.message);
            isControllerClosed = true;
          }
        };

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
          safeEnqueue(metadata);

          // Stream commits
          const onCommitBatch = (commits, progress) => {
            if (isControllerClosed || isCancelled) return;
            const chunk = {
              type: "commits",
              commits,
              progress,
              timestamp: new Date().toISOString(),
            };
            safeEnqueue(chunk);
          };

          const onProgress = (status) => {
            if (isControllerClosed || isCancelled) return;
            const chunk = {
              type: "progress",
              status,
              timestamp: new Date().toISOString(),
            };
            safeEnqueue(chunk);
          };

          // Process commits
          const result = await streamCommitsBetween(options, onCommitBatch, onProgress);

          // Send completion only if controller is still open
          if (!isControllerClosed && !isCancelled) {
            const completion = {
              type: "complete",
              success: result.success,
              totalCommits: result.totalCommits,
              summary: result.summary,
              fetchStats: result.fetchStats, // Add fetch statistics
              elapsedTime: `${Date.now() - startTime}ms`,
              error: result.error,
              repository: result.repository,
              fromRef: result.fromRef,
              toRef: result.toRef,
              fromSha: result.fromSha,
              toSha: result.toSha,
              apiUsed: result.apiUsed,
              timestamp: new Date().toISOString(),
            };
            safeEnqueue(completion);
          }

          safeClose();
        } catch (error) {
          console.error(`[Stream Error] ${options.repoUrl} ${options.from}..${options.to} - ${error.message}`, error);

          if (!isControllerClosed && !isCancelled) {
            const errorChunk = {
              type: "error",
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            };
            safeEnqueue(errorChunk);
          }

          safeClose();
        }
      },

      cancel() {
        // Handle client disconnect
        console.log("[Stream] Client disconnected");
        isCancelled = true;
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
