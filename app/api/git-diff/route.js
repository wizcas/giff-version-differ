import { getCommitsBetween } from "../../../lib/core.js";
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
    const { searchParams } = new URL(request.url);    const repo = searchParams.get("repo");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const token = searchParams.get("token");
    const targetDir = searchParams.get("targetDir");
    const excludeSubPaths = searchParams.get("excludeSubPaths");
    const restOnly = searchParams.get("restOnly");

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
    }    // Prepare options
    const options = {
      repoUrl: repo,
      from,
      to,
      token: token || process.env.GITHUB_TOKEN,
      targetDir: targetDir || null,
      excludeSubPaths: excludeSubPaths || null,
      restOnly: restOnly === "true" || restOnly === "1",
    };

    // Get commits
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
