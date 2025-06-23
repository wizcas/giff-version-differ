#!/usr/bin/env node

import { program } from "commander";
import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import chalk from "chalk";

const REQUEST_SIZE = 50;

// Initialize Octokit (GitHub API client)
let octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN, // Optional: for higher rate limits
});

let graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: process.env.GITHUB_TOKEN ? `token ${process.env.GITHUB_TOKEN}` : undefined,
  },
});

/**
 * Parse GitHub repository URL to extract owner and repo name
 * @param {string} url - GitHub repository URL
 * @returns {object} - Object containing owner and repo
 */
function parseGitHubUrl(url) {
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
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} tagOrCommit - Tag name or commit SHA
 * @returns {string} - Commit SHA
 */
async function getCommitSha(owner, repo, tagOrCommit) {
  try {
    // First, try to get it as a tag
    const tagResponse = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tagOrCommit}`,
    });

    // If it's a tag, get the commit SHA
    const tagSha = tagResponse.data.object.sha;

    // Check if the tag points to a tag object or directly to a commit
    if (tagResponse.data.object.type === "tag") {
      const tagObject = await octokit.rest.git.getTag({
        owner,
        repo,
        tag_sha: tagSha,
      });
      return tagObject.data.object.sha;
    } else {
      return tagSha;
    }
  } catch (error) {
    // If it's not a tag, assume it's a commit SHA and validate it
    try {
      const commitResponse = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: tagOrCommit,
      });
      return commitResponse.data.sha;
    } catch (commitError) {
      console.error(commitError);
      throw new Error(`Could not find tag or commit: ${tagOrCommit}`);
    }
  }
}

/**
 * Get commits between two commit SHAs with file information
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @returns {Object} - Object containing commits and files data
 */
/**
 * Get commits between two SHAs using optimized GraphQL
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @returns {Array} - Array of commit objects with file information
 */
async function getCommitsBetweenGraphQL(owner, repo, baseSha, headSha) {
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
 * Get files changed in a commit
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} sha - Commit SHA
 * @returns {Array} - Array of file paths
 */
async function getFilesChangedInCommit(owner, repo, sha) {
  try {
    const response = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });

    return response.data.files ? response.data.files.map((file) => file.filename) : [];
  } catch (error) {
    console.warn(`Warning: Could not get files for commit ${sha}: ${error.message}`);
    return [];
  }
}

/**
 * Check if commit should be included based on target and exclude directories
 * @param {Array} files - Array of file paths changed in the commit
 * @param {string} targetDir - Target directory to include
 * @param {string} excludeDir - Directory to exclude
 * @returns {boolean} - Whether to include the commit
 */
function shouldIncludeCommit(files, targetDir, excludeDir) {
  if (!targetDir && !excludeDir) {
    return true; // No filtering
  }

  const hasTargetChanges = targetDir ? files.some((file) => file.startsWith(targetDir)) : false;
  const hasExcludeChanges = excludeDir ? files.some((file) => file.startsWith(excludeDir)) : false;

  if (targetDir) {
    // If target directory is specified, include only if it has changes in target
    return hasTargetChanges;
  }

  if (excludeDir) {
    // If exclude directory is specified, exclude only if it has changes in exclude dir and no target dir
    return !hasExcludeChanges;
  }

  return true;
}

/**
 * Parse commit message for semver type and Jira ticket ID
 * Format: "Semver type: [Jira ticket ID] Commit message"
 * @param {string} message - Commit message
 * @returns {object} - Object containing semverType and jiraTicketId
 */
function parseCommitMessage(message) {
  // Regex to match: "type: [JIRA-123] message" or "type: message"
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

  // Also check for Jira ticket anywhere in the message
  const jiraMatch = message.match(/\[([A-Z]+-\d+)\]/);

  return {
    semverType: null,
    jiraTicketId: jiraMatch ? jiraMatch[1] : null,
    cleanMessage: message,
  };
}

/**
 * Filter commits based on directory criteria (optimized version)
 * @param {Array} commits - Array of commit objects
 * @param {Array} allFiles - All files changed in the comparison (from compare API)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} targetDir - Target directory to include
 * @param {string} excludeDir - Directory to exclude
 * @returns {Array} - Filtered array of commits
 */
/**
 * Filter commits based on directory criteria using GraphQL data
 * @param {Array} commits - Array of commit objects with files property
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} targetDir - Target directory to include
 * @param {string} excludeDir - Directory to exclude
 * @returns {Array} - Filtered array of commits
 */
async function filterCommitsByDirectory(commits, owner, repo, targetDir, excludeDir) {
  if (!targetDir && !excludeDir) {
    return commits; // No filtering needed
  }

  const filteredCommits = [];

  for (const commit of commits) {
    let files = commit.files || [];

    // If no files from GraphQL or REST initial call, fetch them individually
    if (files.length === 0) {
      try {
        files = await getFilesChangedInCommit(owner, repo, commit.sha);
        // Cache the files in the commit object for potential reuse
        commit.files = files;
      } catch (error) {
        // If we can't get file info, include the commit to be safe (unless we have a strict target dir)
        if (targetDir) {
          // Skip commits we can't verify for target directory
          console.warn(`Warning: Skipping commit ${commit.sha.substring(0, 7)} - could not get file info for target directory filtering`);
          continue;
        }
        files = [];
      }
    }

    if (shouldIncludeCommit(files, targetDir, excludeDir)) {
      filteredCommits.push(commit);
    }
  }

  return filteredCommits;
}

/**
 * Process commits and extract relevant information
 * @param {Array} commits - Array of commit objects
 * @returns {Array} - Array of processed commit objects
 */
function processCommits(commits) {
  return commits.map((commit) => {
    const { semverType, jiraTicketId, cleanMessage } = parseCommitMessage(commit.commit.message);

    return {
      hash: commit.sha,
      shortHash: commit.sha.substring(0, 7),
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      message: commit.commit.message.split("\n")[0], // First line only
      cleanMessage,
      semverType,
      jiraTicketId,
    };
  });
}

/**
 * Display commits in human-readable format
 * @param {Array} processedCommits - Array of processed commit objects
 * @param {string} fromRef - Starting reference (tag or commit)
 * @param {string} toRef - Ending reference (tag or commit)
 */
function displayCommitsHuman(processedCommits, fromRef, toRef) {
  console.log(chalk.blue.bold(`\n📋 Commits between ${fromRef} and ${toRef}:`));
  console.log(chalk.gray("─".repeat(80)));

  if (processedCommits.length === 0) {
    console.log(chalk.yellow("No commits found between the specified references."));
    return;
  }

  processedCommits.forEach((commit, index) => {
    const date = new Date(commit.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let messageDisplay = `${chalk.green(index + 1 + ".")} ${chalk.cyan(commit.shortHash)} ${chalk.white(commit.message)}`;

    // Add semver type if present
    if (commit.semverType) {
      const semverColor = getSemverColor(commit.semverType);
      messageDisplay += ` ${chalk.bgBlack(semverColor(`[${commit.semverType.toUpperCase()}]`))}`;
    }

    // Add Jira ticket if present
    if (commit.jiraTicketId) {
      messageDisplay += ` ${chalk.bgBlue.white(`[${commit.jiraTicketId}]`)}`;
    }

    console.log(messageDisplay);
    console.log(`   ${chalk.gray("By:")} ${chalk.yellow(commit.author)} ${chalk.gray("on")} ${chalk.magenta(date)}`);
    console.log("");
  });

  console.log(chalk.blue.bold(`Total commits: ${processedCommits.length}`));
}

/**
 * Get color for semver type
 * @param {string} semverType - The semver type
 * @returns {Function} - Chalk color function
 */
function getSemverColor(semverType) {
  const colors = {
    major: chalk.red,
    minor: chalk.yellow,
    patch: chalk.green,
    fix: chalk.green,
    feat: chalk.blue,
    feature: chalk.blue,
    chore: chalk.gray,
    maint: chalk.gray,
    docs: chalk.cyan,
    style: chalk.magenta,
    refactor: chalk.yellow,
    test: chalk.green,
    build: chalk.orange,
    ci: chalk.blue,
    perf: chalk.yellow,
    revert: chalk.red,
  };

  return colors[semverType] || chalk.white;
}

/**
 * Format elapsed time in a human-readable way
 * @param {number} milliseconds - Elapsed time in milliseconds
 * @returns {string} - Formatted time string
 */
function formatElapsedTime(milliseconds) {
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
 * Output commits in JSON format
 * @param {Array} processedCommits - Array of processed commit objects
 * @param {number} elapsedTime - Elapsed time in milliseconds (optional)
 */
function outputCommitsJson(processedCommits, elapsedTime = null) {
  const output = {
    commits: processedCommits.map((commit) => ({
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.cleanMessage || commit.message,
      semverType: commit.semverType,
      jiraTicketId: commit.jiraTicketId,
    })),
    totalCommits: processedCommits.length,
  };

  if (elapsedTime !== null) {
    output.elapsedTime = formatElapsedTime(elapsedTime);
  }

  console.log(JSON.stringify(output, null, 2));
}

// CLI Program Setup
program
  .name("git-version-differ")
  .description("Get commit information between two Git tags or commit hashes from a GitHub repository")
  .version("1.0.0")
  .argument("<repo-url>", "GitHub repository URL")
  .argument("<from>", "Starting tag or commit hash")
  .argument("<to>", "Ending tag or commit hash")
  .option("-t, --token <token>", "GitHub personal access token (or set GITHUB_TOKEN env var)")
  .option("-f, --format <format>", "Output format: human or json", "human")
  .option("--target-dir <directory>", "Limit commits to those that changed files in this directory")
  .option("--exclude-dir <directory>", "Exclude commits that only changed files in this directory")
  .action(async (repoUrl, from, to, options) => {
    const startTime = Date.now(); // Start timing

    try {
      // Set GitHub token if provided via option
      if (options.token) {
        octokit = new Octokit({
          auth: options.token,
        });
        graphqlWithAuth = graphql.defaults({
          headers: {
            authorization: `token ${options.token}`,
          },
        });
      }

      // Validate output format
      if (!["human", "json"].includes(options.format)) {
        throw new Error('Invalid output format. Use "human" or "json".');
      }

      if (options.format === "human") {
        console.log(chalk.blue("🔍 Analyzing repository..."));
      }

      // Parse GitHub URL
      const { owner, repo } = parseGitHubUrl(repoUrl);
      if (options.format === "human") {
        console.log(chalk.gray(`Repository: ${owner}/${repo}`));
      }

      // Get commit SHAs for the references
      if (options.format === "human") {
        console.log(chalk.blue("📍 Resolving references..."));
      }
      const fromSha = await getCommitSha(owner, repo, from);
      const toSha = await getCommitSha(owner, repo, to);

      if (options.format === "human") {
        console.log(chalk.gray(`From: ${from} (${fromSha.substring(0, 7)})`));
        console.log(chalk.gray(`To: ${to} (${toSha.substring(0, 7)})`));
      }

      // Get commits between the references using GraphQL (with REST fallback)
      if (options.format === "human") {
        console.log(chalk.blue("📊 Fetching commits..."));
      }

      let commits;
      try {
        commits = await getCommitsBetweenGraphQL(owner, repo, fromSha, toSha);
        if (options.format === "human") {
          console.log(chalk.green("✅ Used GraphQL API"));
        }
      } catch (error) {
        if (options.format === "human") {
          console.log(chalk.yellow("⚠️  GraphQL failed, falling back to REST API..."));
        }
        // Fallback to REST API with file information
        const response = await octokit.rest.repos.compareCommits({
          owner,
          repo,
          base: fromSha,
          head: toSha,
        });

        // Transform REST API response to match GraphQL structure with file info
        commits = response.data.commits.map((commit) => ({
          sha: commit.sha,
          commit: {
            message: commit.message,
            author: {
              name: commit.commit.author.name,
              date: commit.commit.author.date,
            },
          },
          files: [], // Will be populated during filtering if needed
          changedFilesCount: 0,
        }));
      }

      // Filter commits by directory if specified
      if (options.targetDir || options.excludeDir) {
        if (options.format === "human") {
          console.log(chalk.blue("🔍 Filtering commits by directory..."));
        }
        commits = await filterCommitsByDirectory(commits, owner, repo, options.targetDir, options.excludeDir);
      }

      // Process commits to extract semver and Jira information
      const processedCommits = processCommits(commits);

      // Output results
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      if (options.format === "json") {
        outputCommitsJson(processedCommits, elapsedTime);
      } else {
        displayCommitsHuman(processedCommits, from, to);
        console.log(chalk.gray(`\n⏱️  Total elapsed time: ${formatElapsedTime(elapsedTime)}`));
      }
    } catch (error) {
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      if (options.format === "json") {
        console.error(
          JSON.stringify(
            {
              error: error.message,
              elapsedTime: formatElapsedTime(elapsedTime),
            },
            null,
            2
          )
        );
      } else {
        console.error(chalk.red("❌ Error:"), error.message);

        if (error.message.includes("API rate limit exceeded")) {
          console.log(chalk.yellow("\n💡 Tip: Set a GitHub personal access token to increase rate limits:"));
          console.log(chalk.gray("   export GITHUB_TOKEN=your_token_here"));
          console.log(chalk.gray("   or use the --token option"));
        }

        console.log(chalk.gray(`\n⏱️  Total elapsed time: ${formatElapsedTime(elapsedTime)}`));
      }

      process.exit(1);
    }
  });

program.parse();
