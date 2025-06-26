import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";

const REQUEST_SIZE = 20;

/**
 * Initialize GitHub clients with optional token
 * @param {string} token - GitHub personal access token
 * @returns {object} - Object containing octokit and graphqlWithAuth
 */
export function initializeGitHubClients(token = null) {
  const authToken = token || process.env.GITHUB_TOKEN;

  const octokit = new Octokit({
    auth: authToken,
  });

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: authToken ? `token ${authToken}` : undefined,
    },
  });

  return { octokit, graphqlWithAuth };
}

/**
 * Parse GitHub repository URL to extract owner and repo name
 * @param {string} url - GitHub repository URL
 * @returns {object} - Object containing owner and repo
 */
export function parseGitHubUrl(url) {
  const patterns = [/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/, /github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }
  }

  throw new Error("Invalid GitHub repository URL. Please provide a valid GitHub repository URL.");
}

/**
 * Get commit SHA for a given tag or return the hash if it's already a commit SHA
 * @param {object} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} tagOrCommit - Tag name or commit SHA
 * @returns {string} - Commit SHA
 */
export async function getCommitSha(octokit, owner, repo, tagOrCommit) {
  try {
    // First, try to get the commit directly (in case it's already a SHA)
    try {
      const response = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: tagOrCommit,
      });
      return response.data.sha;
    } catch (error) {
      // If that fails, try to get it as a tag
      try {
        const response = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `tags/${tagOrCommit}`,
        });
        return response.data.object.sha;
      } catch (tagError) {
        // If that also fails, try as a branch
        try {
          const response = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${tagOrCommit}`,
          });
          return response.data.object.sha;
        } catch (branchError) {
          throw new Error(`Could not find tag or commit: ${tagOrCommit}`);
        }
      }
    }
  } catch (error) {
    throw new Error(`Could not find tag or commit: ${tagOrCommit}`);
  }
}

/**
 * Get commit list between two SHAs using GraphQL
 * @param {object} graphqlWithAuth - GraphQL client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @returns {Array} - Array of commit objects
 */
export async function getCommitList(graphqlWithAuth, owner, repo, baseSha, headSha) {
  const query = `
    query($owner: String!, $repo: String!, $baseSha: String!, $headSha: String!) {
      repository(owner: $owner, name: $repo) {
        refs(first: 100, query: $baseSha) {
          nodes {
            name
            target {
              ... on Commit {
                history(first: ${REQUEST_SIZE}, since: $headSha) {
                  nodes {
                    oid
                    message
                    author {
                      name
                      date
                    }
                    changedFilesIfAvailable
                    associatedPullRequests(first: 1) {
                      nodes {
                        files(first: 100) {
                          nodes {
                            path
                          }
                        }
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    owner,
    repo,
    baseSha,
    headSha,
  };

  const result = await graphqlWithAuth(query, variables);
  const commits = result.repository.refs.nodes.flatMap((node) => node.target.history.nodes);

  return commits;
}

/**
 * Get commits between two references using GraphQL
 * @param {object} graphqlWithAuth - GraphQL client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @returns {Array} - Array of commit objects with file information
 */
export async function getCommitsBetweenGraphQL(graphqlWithAuth, owner, repo, baseSha, headSha) {
  try {
    const query = `
      query($owner: String!, $repo: String!, $headSha: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $headSha) {
            ... on Commit {
              history(first: ${REQUEST_SIZE}) {
                nodes {
                  oid
                  message
                  author {
                    name
                    date
                  }
                  changedFilesIfAvailable
                  associatedPullRequests(first: 1) {
                    nodes {
                      files(first: 100) {
                        nodes {
                          path
                        }
                      }
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      }
    `;

    let allCommits = [];
    let hasNextPage = true;
    let cursor = null;
    let foundBase = false;

    while (hasNextPage && !foundBase && allCommits.length < 1000) {
      const paginatedQuery = cursor
        ? `
        query($owner: String!, $repo: String!, $cursor: String!) {
          repository(owner: $owner, name: $repo) {
            object(expression: "HEAD") {
              ... on Commit {
                history(first: ${REQUEST_SIZE}, after: $cursor) {
                  nodes {
                    oid
                    message
                    author {
                      name
                      date
                    }
                    changedFilesIfAvailable
                    associatedPullRequests(first: 1) {
                      nodes {
                        files(first: 100) {
                          nodes {
                            path
                          }
                        }
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          }
        }
      `
        : query;

      const variables = cursor ? { owner, repo, cursor } : { owner, repo, headSha };

      const result = await graphqlWithAuth(paginatedQuery, variables);
      const commits = result.repository.object.history.nodes;

      for (const commit of commits) {
        if (commit.oid === baseSha) {
          foundBase = true;
          break;
        }

        // Extract file paths from PR if available
        let files = [];
        if (commit.associatedPullRequests.nodes.length > 0 && commit.associatedPullRequests.nodes[0].files.nodes.length > 0) {
          files = commit.associatedPullRequests.nodes[0].files.nodes.map((f) => f.path);
        }

        allCommits.push({
          sha: commit.oid,
          commit: {
            message: commit.message,
            author: {
              name: commit.author.name,
              date: commit.author.date,
            },
          },
          files: files,
          changedFilesCount: commit.changedFilesIfAvailable || files.length,
        });
      }

      hasNextPage = result.repository.object.history.pageInfo.hasNextPage;
      cursor = result.repository.object.history.pageInfo.endCursor;
    }

    return allCommits;
  } catch (error) {
    throw new Error(`GraphQL query failed: ${error.message}`);
  }
}

/**
 * Get commits between two references using REST API
 * @param {object} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @returns {Array} - Array of commit objects
 */
export async function getCommitsBetweenREST(octokit, owner, repo, baseSha, headSha) {
  const response = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha,
  });

  return response.data.commits.map((commit) => ({
    sha: commit.sha,
    commit: {
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        date: commit.commit.author.date,
      },
    },
    files: [],
    changedFilesCount: 0,
  }));
}

/**
 * Get files changed in a commit
 * @param {object} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} sha - Commit SHA
 * @returns {Array} - Array of file paths
 */
export async function getFilesChangedInCommit(octokit, owner, repo, sha) {
  try {
    const response = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });

    return response.data.files ? response.data.files.map((file) => file.filename) : [];
  } catch (error) {
    console.error(`Warning: Could not get files for commit ${sha}: ${error.message}`);
    return [];
  }
}

/**
 * Check if commit should be included based on target directory and exclude sub-paths
 * @param {Array} files - Array of file paths changed in the commit
 * @param {string} targetDir - Target directory to include
 * @param {string} excludeSubPaths - Comma-separated sub-paths to exclude
 * @returns {boolean} - Whether to include the commit
 */
export function shouldIncludeCommit(files, targetDir, excludeSubPaths) {
  if (!targetDir && !excludeSubPaths) {
    return true;
  }

  const hasTargetChanges = targetDir ? files.some((file) => file.startsWith(targetDir)) : true;

  if (!hasTargetChanges) {
    return false;
  }

  // If we have excludeSubPaths, check if any files in the target directory match exclusion patterns
  if (excludeSubPaths && targetDir) {
    const excludePatterns = excludeSubPaths
      .split(",")
      .map((path) => path.trim())
      .filter((path) => path);

    // Check if ALL files in target directory are excluded
    const targetFiles = files.filter((file) => file.startsWith(targetDir));
    const allExcluded = targetFiles.every((file) => {
      const relativePath = file.substring(targetDir.length);
      const cleanRelativePath = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;

      return excludePatterns.some((pattern) => {
        if (pattern.startsWith("/") || pattern.includes("../")) {
          return false;
        }
        return cleanRelativePath.startsWith(pattern);
      });
    });

    return !allExcluded;
  }

  return hasTargetChanges;
}

/**
 * Filter commits based on directory criteria
 * @param {object} octokit - Octokit instance
 * @param {Array} commits - Array of commit objects
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} targetDir - Target directory to include
 * @param {string} excludeSubPaths - Comma-separated sub-paths to exclude
 * @returns {Array} - Filtered array of commits
 */
export async function filterCommitsByDirectory(octokit, commits, owner, repo, targetDir, excludeSubPaths) {
  if (!targetDir && !excludeSubPaths) {
    return commits;
  }

  const filteredCommits = [];

  for (const commit of commits) {
    let files = commit.files || [];

    if (files.length === 0) {
      try {
        files = await getFilesChangedInCommit(octokit, owner, repo, commit.sha);
        commit.files = files;
      } catch (error) {
        console.error(`[Core Error] Could not get files for commit ${commit.sha}: ${error.message}`);
        if (targetDir) {
          continue;
        }
        files = [];
      }
    }
    if (shouldIncludeCommit(files, targetDir, excludeSubPaths)) {
      filteredCommits.push(commit);
    }
  }

  return filteredCommits;
}

/**
 * Parse commit message for semver type and Jira ticket ID
 * @param {string} message - Commit message
 * @returns {object} - Object containing semverType and jiraTicketId
 */
export function parseCommitMessage(message) {
  const semverTypes = [
    "major",
    "minor",
    "patch",
    "fix",
    "maint",
    "chore",
    "feat",
    "feature",
    "docs",
    "style",
    "refactor",
    "test",
    "build",
    "ci",
    "perf",
    "revert",
  ];
  const semverPattern = new RegExp(`^(${semverTypes.join("|")}):\\s*(?:\\[([A-Z]+-\\d+)\\]\\s*)?(.*)`, "i");

  const match = message.match(semverPattern);

  if (match) {
    return {
      semverType: match[1].toLowerCase(),
      jiraTicketId: match[2] || null,
      cleanMessage: match[3].trim(),
    };
  }

  const jiraMatch = message.match(/\[([A-Z]+-\d+)\]/);

  return {
    semverType: null,
    jiraTicketId: jiraMatch ? jiraMatch[1] : null,
    cleanMessage: message,
  };
}

/**
 * Process commits and extract relevant information
 * @param {Array} commits - Array of commit objects
 * @returns {Array} - Array of processed commit objects
 */
export function processCommits(commits) {
  return commits
    .map((commit) => {
      const shortHash = commit.sha.substring(0, 7);
      const message = commit.commit.message || `Commit ${shortHash}`;
      const { semverType, jiraTicketId, cleanMessage } = parseCommitMessage(message);

      return {
        hash: commit.sha,
        shortHash,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        message: message.split("\n")[0],
        cleanMessage,
        semverType,
        jiraTicketId,
      };
    })
    .filter(Boolean);
}

/**
 * Format elapsed time in a human-readable way
 * @param {number} milliseconds - Elapsed time in milliseconds
 * @returns {string} - Formatted time string
 */
export function formatElapsedTime(milliseconds) {
  const seconds = milliseconds / 1000;

  if (seconds < 1) {
    return `${milliseconds}ms`;
  } else if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(2);
    return `${minutes}m ${remainingSeconds}s`;
  }
}

/**
 * Main function to get commits between two references
 * @param {object} options - Configuration options
 * @param {string} options.repoUrl - GitHub repository URL
 * @param {string} options.from - Starting tag or commit hash
 * @param {string} options.to - Ending tag or commit hash
 * @param {string} options.token - GitHub personal access token
 * @param {string} options.targetDir - Target directory to include
 * @param {string} options.excludeSubPaths - Comma-separated sub-paths to exclude
 * @param {boolean} options.restOnly - Force use of REST API only
 * @returns {object} - Result object with commits and metadata
 */
export async function getCommitsBetween(options) {
  const startTime = Date.now();

  try {
    const { octokit, graphqlWithAuth } = initializeGitHubClients(options.token);

    // Parse GitHub URL
    const { owner, repo } = parseGitHubUrl(options.repoUrl);

    // Get commit SHAs for the references
    const fromSha = await getCommitSha(octokit, owner, repo, options.from);
    const toSha = await getCommitSha(octokit, owner, repo, options.to);

    let commits;
    let apiUsed = "unknown";

    if (options.restOnly) {
      commits = await getCommitsBetweenREST(octokit, owner, repo, fromSha, toSha);
      apiUsed = "rest";
    } else {
      try {
        commits = await getCommitsBetweenGraphQL(graphqlWithAuth, owner, repo, fromSha, toSha);
        apiUsed = "graphql";
      } catch (error) {
        console.warn(`[Core Warning] GraphQL API failed, falling back to REST API: ${error.message}`);
        commits = await getCommitsBetweenREST(octokit, owner, repo, fromSha, toSha);
        apiUsed = "rest-fallback";
      }
    } // Filter commits by directory if specified
    if (options.targetDir || options.excludeSubPaths) {
      commits = await filterCommitsByDirectory(octokit, commits, owner, repo, options.targetDir, options.excludeSubPaths);
    }

    // Process commits to extract semver and Jira information
    const processedCommits = processCommits(commits);

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    return {
      success: true,
      commits: processedCommits.map((commit) => ({
        hash: commit.hash,
        author: commit.author,
        date: commit.date,
        message: commit.cleanMessage || commit.message,
        semverType: commit.semverType,
        jiraTicketId: commit.jiraTicketId,
      })),
      totalCommits: processedCommits.length,
      elapsedTime: formatElapsedTime(elapsedTime),
      apiUsed,
      repository: { owner, repo },
      fromRef: options.from,
      toRef: options.to,
      fromSha: fromSha.substring(0, 7),
      toSha: toSha.substring(0, 7),
    };
  } catch (error) {
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    console.error(`[Core Error] ${options.repoUrl} ${options.from}..${options.to} - ${error.message}`, error.stack);

    return {
      success: false,
      error: error.message,
      elapsedTime: formatElapsedTime(elapsedTime),
    };
  }
}

/**
 * Stream commits between two Git references with real-time progress updates
 * This version processes commits in batches and calls progress callbacks
 * @param {object} options - Options object
 * @param {function} onCommitBatch - Callback for when a batch of commits is processed
 * @param {function} onProgress - Callback for progress updates
 * @returns {Promise<object>} - Result object with success status and summary
 */
export async function streamCommitsBetween(options, onCommitBatch, onProgress) {
  const startTime = Date.now();
  let apiUsed = "unknown";

  try {
    onProgress("Initializing GitHub clients...");
    const { octokit, graphqlWithAuth } = initializeGitHubClients(options.token);
    const { owner, repo } = parseGitHubUrl(options.repoUrl);

    onProgress("Fetching commit SHAs...");
    const fromSha = await getCommitSha(octokit, owner, repo, options.from);
    const toSha = await getCommitSha(octokit, owner, repo, options.to);

    onProgress("Determining commit list...");
    const commits = await getCommitList(graphqlWithAuth, owner, repo, fromSha, toSha);
    apiUsed = "GraphQL";

    if (commits.length === 0) {
      onProgress("No commits found in range");
      return {
        success: true,
        totalCommits: 0,
        summary: { total: 0, processed: 0 },
      };
    }

    onProgress(`Found ${commits.length} commits. Starting processing...`);

    const BATCH_SIZE = 10; // Process commits in batches
    let processedCommits = [];
    let processedCount = 0;

    // Process commits in batches
    for (let i = 0; i < commits.length; i += BATCH_SIZE) {
      const batch = commits.slice(i, i + BATCH_SIZE);
      const batchResults = [];

      onProgress(`Processing commits ${i + 1}-${Math.min(i + BATCH_SIZE, commits.length)} of ${commits.length}...`);

      for (const commit of batch) {
        try {
          // Get commit details
          const commitDetails = await getCommitDetails(octokit, owner, repo, commit.sha);

          // Filter files if needed
          const filteredFiles = filterFiles(commitDetails.files, options.targetDir, options.excludeSubPaths);

          if (options.restOnly && filteredFiles.length === 0) {
            continue; // Skip commits with no relevant files
          }

          // Process commit
          const processedCommit = {
            hash: commit.sha.substring(0, 7),
            fullHash: commit.sha,
            author: commitDetails.commit.author?.name || "Unknown",
            date: commitDetails.commit.author?.date || new Date().toISOString(),
            message: commitDetails.commit.message,
            cleanMessage: cleanCommitMessage(commitDetails.commit.message),
            semverType: getSemverType(commitDetails.commit.message),
            jiraTicketId: extractJiraTicket(commitDetails.commit.message),
            filesChanged: filteredFiles.length,
            files: filteredFiles.map((file) => ({
              filename: file.filename,
              status: file.status,
              additions: file.additions || 0,
              deletions: file.deletions || 0,
            })),
          };

          batchResults.push(processedCommit);
          processedCommits.push(processedCommit);
          processedCount++;
        } catch (error) {
          console.warn(`[Stream Warning] Failed to process commit ${commit.sha}: ${error.message}`);
        }
      }

      // Send batch to callback
      if (batchResults.length > 0) {
        onCommitBatch(batchResults, {
          processed: processedCount,
          total: commits.length,
        });
      }

      // Add small delay to prevent rate limiting
      if (i + BATCH_SIZE < commits.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    onProgress("Processing complete. Generating summary...");

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    return {
      success: true,
      totalCommits: processedCommits.length,
      summary: {
        total: commits.length,
        processed: processedCommits.length,
        skipped: commits.length - processedCommits.length,
      },
      elapsedTime: formatElapsedTime(elapsedTime),
      apiUsed,
      repository: { owner, repo },
      fromRef: options.from,
      toRef: options.to,
      fromSha: fromSha.substring(0, 7),
      toSha: toSha.substring(0, 7),
    };
  } catch (error) {
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    console.error(`[Stream Error] ${options.repoUrl} ${options.from}..${options.to} - ${error.message}`, error.stack);

    return {
      success: false,
      error: error.message,
      elapsedTime: formatElapsedTime(elapsedTime),
    };
  }
}
