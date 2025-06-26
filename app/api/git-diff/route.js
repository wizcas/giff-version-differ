import { getCommitsBetween, streamCommitsBetween } from "../../../lib/core.js";
import { NextResponse } from "next/server";

/**
 * Next.js App Router API to get commits between two Git references
 * GET /api/git-diff?repo=<repo-url>&from=<from-ref>&to=<to-ref>&[options]
 */

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
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
    const stream = searchParams.get("stream"); // New parameter for streaming

    // Validate required parameters
    if (!repo) {
      console.error(`[API Error] Missing repo parameter: ${request.url}`);
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameter: repo (GitHub repository URL)",
        },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    if (!from) {
      console.error(`[API Error] Missing from parameter: ${request.url}`);
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameter: from (starting tag or commit hash)",
        },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    }

    if (!to) {
      console.error(`[API Error] Missing to parameter: ${request.url}`);
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameter: to (ending tag or commit hash)",
        },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }
      );
    } // Prepare options
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

    // Handle streaming requests
    if (stream === "true" || stream === "1") {
      return handleStreamingRequest(options);
    }

    // Get commits (non-streaming, original behavior)
    const result = await getCommitsBetween(options);

    if (result.success) {
      console.log(`[API Success] ${repo} ${from}..${to} - ${result.totalCommits} commits (${result.elapsedTime})`);
      return NextResponse.json(result, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    } else {
      console.error(`[API Error] ${repo} ${from}..${to} - ${result.error}`);
      return NextResponse.json(result, {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }
  } catch (error) {
    console.error(`[API Exception] ${request.url} - ${error.message}`, error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        elapsedTime: "0ms",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  }
}

/**
 * Handle streaming requests that send data as it's processed
 * This prevents Vercel timeout issues for large repositories
 */
async function handleStreamingRequest(options) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial metadata
        const startTime = Date.now();
        const metadata = {
          type: "metadata",
          repoUrl: options.repoUrl,
          from: options.from,
          to: options.to,
          targetDir: options.targetDir,
          excludeSubPaths: options.excludeSubPaths,
          startTime: new Date().toISOString(),
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`));

        // Stream commits as they're processed
        const onCommitBatch = (commits, progress) => {
          const chunk = {
            type: "commits",
            commits,
            progress: {
              processed: progress.processed,
              total: progress.total,
              percentage: Math.round((progress.processed / progress.total) * 100),
            },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        };

        const onProgress = (status) => {
          const chunk = {
            type: "progress",
            status,
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        };

        // Process commits with streaming
        const result = await streamCommitsBetween(options, onCommitBatch, onProgress);

        // Send final result
        const finalResult = {
          type: "complete",
          success: result.success,
          totalCommits: result.totalCommits,
          summary: result.summary,
          elapsedTime: `${Date.now() - startTime}ms`,
          error: result.error,
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalResult)}\n\n`));
        controller.close();
      } catch (error) {
        console.error(`[Streaming Error] ${options.repoUrl} - ${error.message}`);
        const errorResult = {
          type: "error",
          success: false,
          error: error.message,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResult)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
