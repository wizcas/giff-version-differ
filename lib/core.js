import { Octokit } from "@octokit/rest";

/**
 * Initialize GitHub client with optional token
 * @param {string} token - GitHub personal access token
 * @returns {object} - Object containing octokit
 */
export function initializeGitHubClients(token = null) {
  const authToken = token || process.env.GITHUB_TOKEN;

  const octokit = new Octokit({
    auth: authToken,
  });

  return { octokit };
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
 * Get commits between two references using REST API
 * @param {object} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @param {string} targetDir - Optional target directory to filter commits by path
 * @returns {Array} - Array of commit objects
 */
export async function getCommitsBetweenREST(octokit, owner, repo, baseSha, headSha, targetDir = null, onProgress = null) {
  // Safe progress callback wrapper
  const safeProgress = (message) => {
    try {
      if (onProgress) onProgress(message);
    } catch (callbackError) {
      console.warn(`[REST Progress Warning] Progress callback error: ${callbackError.message}`);
    }
  };

  // If we have a targetDir, use listCommits with path parameter for better filtering
  if (targetDir) {
    console.log(`[REST] Using listCommits with path filter: ${targetDir}`);
    safeProgress(`Fetching commits that modified path: ${targetDir}...`);

    let allCommits = [];
    let page = 1;
    const perPage = 100;
    let foundBase = false;
    let listCommitShas = new Set(); // Store all SHAs from listCommits

    console.log(`listing commits between ${baseSha} and ${headSha} affecting path ${targetDir}`);

    // Use listCommits endpoint with path parameter to get commits that affect the target directory
    while (!foundBase) {
      console.log(`[REST] Fetching page ${page} of commits with path filter...`);
      safeProgress(`Fetching commits page ${page}...`);

      const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: headSha,
        path: targetDir,
        per_page: perPage,
        page: page,
      });

      if (response.data.length === 0) {
        break; // No more commits
      }

      for (const commit of response.data) {
        listCommitShas.add(commit.sha); // Store SHA for later matching
        console.log(`\t${commit.sha} <> ${baseSha}`);
        // Check if we've reached the base commit
        if (commit.sha === baseSha) {
          foundBase = true;
          break;
        }

        allCommits.push({
          sha: commit.sha,
          commit: {
            message: commit.commit.message,
            author: {
              name: commit.commit.author.name,
              date: commit.commit.author.date,
            },
          },
          files: [], // Will be populated later if needed
          changedFilesCount: 0,
        });
      }

      if (response.data.length < perPage) {
        break; // Last page
      }

      page++;
    }

    // If baseSha not found in listCommits, try to find intersection by going back from baseSha
    if (!foundBase && listCommitShas.size > 0) {
      console.log(`[REST] baseSha ${baseSha} not found in listCommits, searching for intersection...`);
      safeProgress(`Searching for intersection from base commit...`);

      let intersectionPage = 1;
      const intersectionPerPage = 1;
      let intersectionFound = false;
      let checkedCount = 0;
      const maxChecks = 1;
      let intersectionSha = null;

      while (!intersectionFound && checkedCount < maxChecks) {
        console.log(`[REST] Fetching intersection page ${intersectionPage} from baseSha...`);

        const intersectionResponse = await octokit.rest.repos.listCommits({
          owner,
          repo,
          sha: baseSha,
          path: targetDir,
          per_page: intersectionPerPage,
          page: intersectionPage,
        });

        if (intersectionResponse.data.length === 0) {
          break; // No more commits
        }

        for (const commit of intersectionResponse.data) {
          checkedCount++;
          console.log(`\tChecking intersection: ${commit.sha} (${checkedCount}/${maxChecks})`);

          if (listCommitShas.has(commit.sha)) {
            console.log(`[REST] Found intersection at ${commit.sha}, setting foundBase = true`);
            safeProgress(`Found intersection at commit ${commit.sha.substring(0, 7)}`);
            foundBase = true;
            intersectionFound = true;
            intersectionSha = commit.sha;
            break;
          }

          if (checkedCount >= maxChecks) {
            console.log(`[REST] Reached maximum check limit (${maxChecks}), stopping intersection search`);
            break;
          }
        }

        if (intersectionResponse.data.length < intersectionPerPage) {
          break; // Last page
        }

        intersectionPage++;
      }

      // If intersection found, filter allCommits to only include commits after intersection
      if (intersectionFound && intersectionSha) {
        console.log(`[REST] Filtering commits to only include those after intersection ${intersectionSha}`);
        safeProgress(`Filtering commits after intersection...`);

        const originalCount = allCommits.length;
        let foundIntersectionInList = false;
        let filteredCommits = [];

        // Go through allCommits in order and only keep commits before the intersection
        for (const commit of allCommits) {
          if (commit.sha === intersectionSha) {
            foundIntersectionInList = true;
            console.log(`[REST] Found intersection ${intersectionSha} in allCommits, stopping collection`);
            break; // Stop when we reach the intersection, don't include it
          }
          filteredCommits.push(commit);
        }

        allCommits = filteredCommits;
        console.log(
          `[REST] Filtered commits: ${originalCount} -> ${allCommits.length} (removed ${
            originalCount - allCommits.length
          } commits after intersection)`
        );
        safeProgress(`Filtered to ${allCommits.length} commits after intersection`);
      } else if (!intersectionFound) {
        console.log(`[REST] No intersection found within ${checkedCount} commits from baseSha`);
        safeProgress(`No intersection found within ${checkedCount} commits from base`);
      }
    }

    console.log(`[REST] Found ${allCommits.length} commits affecting path ${targetDir}`);
    safeProgress(`Found ${allCommits.length} commits that modified the specified path`);
    return allCommits;
  } else {
    // Use compareCommits for full repository comparison when no targetDir is specified
    console.log(`[REST] Using compareCommits for full repository comparison`);
    safeProgress("Comparing commit ranges...");

    const response = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseSha,
      head: headSha,
    });

    safeProgress(`Found ${response.data.commits.length} commits in range`);

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
 * Note: When using REST API with path filtering, targetDir filtering may already be applied,
 * but we still need to apply excludeSubPaths filtering.
 * @param {Array} files - Array of file paths changed in the commit
 * @param {string} targetDir - Target directory to include (may already be filtered by REST API)
 * @param {string} excludeSubPaths - Comma-separated sub-paths to exclude
 * @returns {boolean} - Whether to include the commit
 */
export function shouldIncludeCommit(files, targetDir, excludeSubPaths) {
  // If no filtering criteria, include all commits
  if (!targetDir && !excludeSubPaths) {
    return true;
  }

  // Check if commit has changes in target directory (if targetDir is specified)
  const hasTargetChanges = targetDir ? files.some((file) => file.startsWith(targetDir)) : true;

  if (!hasTargetChanges) {
    return false;
  }

  // Apply exclude sub-paths filtering if specified
  if (excludeSubPaths) {
    const excludePatterns = excludeSubPaths
      .split(",")
      .map((path) => path.trim())
      .filter((path) => path);

    if (excludePatterns.length === 0) {
      return hasTargetChanges;
    }

    // If we have a targetDir, only check files within that directory
    const filesToCheck = targetDir ? files.filter((file) => file.startsWith(targetDir)) : files;

    if (filesToCheck.length === 0) {
      return false;
    }

    // Check if ALL relevant files are excluded
    const allExcluded = filesToCheck.every((file) => {
      // Get the relative path from targetDir (if specified) or from root
      const relativePath = targetDir ? file.substring(targetDir.length) : file;
      const cleanRelativePath = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;

      return excludePatterns.some((pattern) => {
        // Skip invalid patterns
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

    // If we don't have files info, fetch it
    if (files.length === 0) {
      try {
        files = await getFilesChangedInCommit(octokit, owner, repo, commit.sha);
        commit.files = files;
      } catch (error) {
        console.error(`[Core Error] Could not get files for commit ${commit.sha}: ${error.message}`);
        // If targetDir is specified and we can't get files, skip the commit
        if (targetDir) {
          continue;
        }
        files = [];
      }
    }

    // If we have excludeSubPaths, we need to check even if targetDir filtering was already done by REST API
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
 * @returns {object} - Result object with commits and metadata
 */
export async function getCommitsBetween(options) {
  const startTime = Date.now();

  try {
    const { octokit } = initializeGitHubClients(options.token);

    // Parse GitHub URL
    const { owner, repo } = parseGitHubUrl(options.repoUrl);

    // Handle partial version inputs and generate warnings
    let finalFrom = options.from;
    let finalTo = options.to;
    let warningMessage = "";

    if (!options.from && !options.to) {
      // No versions specified - return latest commit only
      finalFrom = "HEAD~1";
      finalTo = "HEAD";
      warningMessage = "⚠️ No version specified, returning only the latest commit";
    } else if (!options.from && options.to) {
      // Only 'to' specified - return latest commit only
      finalFrom = "HEAD~1";
      finalTo = "HEAD";
      warningMessage = "⚠️ No starting version specified, returning only the latest commit";
    } else if (options.from && !options.to) {
      // Only 'from' specified - return from 'from' to HEAD
      finalFrom = options.from;
      finalTo = "HEAD";
      warningMessage = "⚠️ No target version specified, including all commits from the starting version";
    }
    // If both versions are specified, use them as-is

    // Get commit SHAs for the references
    const fromSha = await getCommitSha(octokit, owner, repo, finalFrom);
    const toSha = await getCommitSha(octokit, owner, repo, finalTo);

    // Check if from and to versions are the same
    if (fromSha === toSha) {
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      return {
        success: true,
        commits: [],
        totalCommits: 0,
        elapsedTime: formatElapsedTime(elapsedTime),
        apiUsed: "rest",
        repository: { owner, repo },
        fromRef: finalFrom,
        toRef: finalTo,
        fromSha: fromSha.substring(0, 7),
        toSha: toSha.substring(0, 7),
        warning: "⚠️ Starting and ending versions are the same, no changes can be detected",
      };
    }

    // Get commits using REST API
    let commits = await getCommitsBetweenREST(octokit, owner, repo, fromSha, toSha, options.targetDir);

    // For latest commit only cases, limit to 1 commit
    if ((!options.from && !options.to) || (!options.from && options.to)) {
      commits = commits.slice(0, 1);
    }

    // Filter commits by directory if specified
    if (options.targetDir || options.excludeSubPaths) {
      commits = await filterCommitsByDirectory(octokit, commits, owner, repo, options.targetDir, options.excludeSubPaths);
    }

    // Process commits to extract semver and Jira information
    const processedCommits = processCommits(commits);

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    const result = {
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
      apiUsed: "rest",
      repository: { owner, repo },
      fromRef: finalFrom,
      toRef: finalTo,
      fromSha: fromSha.substring(0, 7),
      toSha: toSha.substring(0, 7),
    };

    // Add warning if present
    if (warningMessage) {
      result.warning = warningMessage;
    }

    return result;
  } catch (error) {
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    console.error(
      `[Core Error] ${options.repoUrl} ${options.from || "undefined"}..${options.to || "undefined"} - ${error.message}`,
      error.stack
    );

    // Try to extract owner/repo for error response, but handle parsing errors gracefully
    let repository = null;
    try {
      const { owner, repo } = parseGitHubUrl(options.repoUrl);
      repository = { owner, repo };
    } catch (parseError) {
      console.warn(`[Core Warning] Failed to parse repo URL for error response: ${parseError.message}`);
    }

    return {
      success: false,
      error: error.message,
      elapsedTime: formatElapsedTime(elapsedTime),
      repository,
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

  // Safe progress callback wrapper
  const safeProgress = (message) => {
    try {
      onProgress(message);
    } catch (callbackError) {
      console.warn(`[Stream Warning] Progress callback error: ${callbackError.message}`);
    }
  };

  try {
    safeProgress("Initializing GitHub clients...");
    const { octokit } = initializeGitHubClients(options.token);
    const { owner, repo } = parseGitHubUrl(options.repoUrl);

    // Handle partial version inputs and generate warnings
    let finalFrom = options.from;
    let finalTo = options.to;
    let warningMessage = "";

    if (!options.from && !options.to) {
      // No versions specified - return latest commit only
      finalFrom = "HEAD~1";
      finalTo = "HEAD";
      warningMessage = "⚠️ No version specified, returning only the latest commit";
      safeProgress(warningMessage);
    } else if (!options.from && options.to) {
      // Only 'to' specified - return latest commit only
      finalFrom = "HEAD~1";
      finalTo = "HEAD";
      warningMessage = "⚠️ No starting version specified, returning only the latest commit";
      safeProgress(warningMessage);
    } else if (options.from && !options.to) {
      // Only 'from' specified - return from 'from' to HEAD
      finalFrom = options.from;
      finalTo = "HEAD";
      warningMessage = "⚠️ No target version specified, including all commits from the starting version";
      safeProgress(warningMessage);
    }
    // If both versions are specified, use them as-is

    safeProgress("Fetching commit SHAs...");
    const fromSha = await getCommitSha(octokit, owner, repo, finalFrom);
    const toSha = await getCommitSha(octokit, owner, repo, finalTo);

    // Check if from and to versions are the same
    if (fromSha === toSha) {
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      const warningMsg = "⚠️ Starting and ending versions are the same, no changes can be detected";
      safeProgress(warningMsg);
      return {
        success: true,
        totalCommits: 0,
        summary: { total: 0, processed: 0 },
        elapsedTime: formatElapsedTime(elapsedTime),
        repository: { owner, repo },
        fromRef: finalFrom,
        toRef: finalTo,
        fromSha: fromSha.substring(0, 7),
        toSha: toSha.substring(0, 7),
        warning: warningMsg,
      };
    }

    safeProgress(`Resolving commits: ${finalFrom} → ${fromSha.substring(0, 7)}, ${finalTo} → ${toSha.substring(0, 7)}`);
    safeProgress("Determining commit list...");
    let fetchStats = { totalChecked: 0, requestCount: 0, elapsedTime: 0 };

    safeProgress("Fetching commits using REST API...");
    const fetchStartTime = Date.now();
    let commits = await getCommitsBetweenREST(octokit, owner, repo, fromSha, toSha, options.targetDir, safeProgress);
    fetchStats.elapsedTime = Date.now() - fetchStartTime;
    apiUsed = "REST";
    safeProgress(`REST fetch completed in ${formatElapsedTime(fetchStats.elapsedTime)}`);

    // For latest commit only cases, limit to 1 commit
    if ((!options.from && !options.to) || (!options.from && options.to)) {
      commits = commits.slice(0, 1);
      safeProgress(`Limited to latest commit only (${commits.length} commit)`);
    }

    if (commits.length === 0) {
      safeProgress("No commits found in range");
      const result = {
        success: true,
        totalCommits: 0,
        summary: { total: 0, processed: 0 },
      };
      if (warningMessage) {
        result.warning = warningMessage;
      }
      return result;
    }

    safeProgress(`Found ${commits.length} commits. Starting processing...`);

    const BATCH_SIZE = 10; // Process commits in batches
    let processedCommits = [];
    let processedCount = 0;

    // Process commits in batches
    for (let i = 0; i < commits.length; i += BATCH_SIZE) {
      const batch = commits.slice(i, i + BATCH_SIZE);
      const batchResults = [];

      safeProgress(`Processing commits ${i + 1}-${Math.min(i + BATCH_SIZE, commits.length)} of ${commits.length}...`);

      for (const commit of batch) {
        try {
          // For GraphQL commits, we need to get the SHA properly
          const commitSha = commit.oid || commit.sha;

          // Get files changed in this commit if not already available
          let files = [];
          if (!commit.files || commit.files.length === 0) {
            files = await getFilesChangedInCommit(octokit, owner, repo, commitSha);
          } else {
            files = commit.files;
          }

          // Apply filtering logic
          if (options.targetDir || options.excludeSubPaths) {
            if (!shouldIncludeCommit(files, options.targetDir, options.excludeSubPaths)) {
              continue; // Skip commits that don't match criteria
            }
          }

          // Parse commit message for semver and Jira info
          const message = commit.message || commit.commit?.message || "";
          const { semverType, jiraTicketId, cleanMessage } = parseCommitMessage(message);

          // Process commit
          const processedCommit = {
            hash: commitSha.substring(0, 7),
            fullHash: commitSha,
            author: commit.author?.name || commit.commit?.author?.name || "Unknown",
            date: commit.author?.date || commit.commit?.author?.date || new Date().toISOString(),
            message: message,
            cleanMessage: cleanMessage,
            semverType: semverType,
            jiraTicketId: jiraTicketId,
            filesChanged: files.length,
            files: files.map((file) => {
              if (typeof file === "string") {
                return { filename: file, status: "modified" };
              }
              return {
                filename: file.filename || file,
                status: file.status || "modified",
                additions: file.additions || 0,
                deletions: file.deletions || 0,
              };
            }),
          };

          batchResults.push(processedCommit);
          processedCommits.push(processedCommit);
          processedCount++;
        } catch (error) {
          console.warn(`[Stream Warning] Failed to process commit ${commit.oid || commit.sha}: ${error.message}`);
        }
      }

      // Send batch to callback
      if (batchResults.length > 0) {
        try {
          onCommitBatch(batchResults, {
            processed: processedCount,
            total: commits.length,
          });
        } catch (callbackError) {
          console.warn(`[Stream Warning] Callback error: ${callbackError.message}`);
          // Don't throw, just continue processing
        }
      }

      // Add small delay to prevent rate limiting
      if (i + BATCH_SIZE < commits.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    try {
      safeProgress("Processing complete. Generating summary...");
    } catch (callbackError) {
      console.warn(`[Stream Warning] Progress callback error: ${callbackError.message}`);
    }

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    const result = {
      success: true,
      totalCommits: processedCommits.length,
      summary: {
        total: commits.length,
        processed: processedCommits.length,
        skipped: commits.length - processedCommits.length,
      },
      fetchStats: {
        totalChecked: fetchStats.totalChecked,
        requestCount: fetchStats.requestCount,
        fetchTime: formatElapsedTime(fetchStats.elapsedTime),
      },
      elapsedTime: formatElapsedTime(elapsedTime),
      apiUsed,
      repository: { owner, repo },
      fromRef: finalFrom,
      toRef: finalTo,
      fromSha: fromSha.substring(0, 7),
      toSha: toSha.substring(0, 7),
    };

    // Add warning if present
    if (warningMessage) {
      result.warning = warningMessage;
    }

    return result;
  } catch (error) {
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    console.error(
      `[Stream Error] ${options.repoUrl} ${options.from || "undefined"}..${options.to || "undefined"} - ${error.message}`,
      error.stack
    );

    // Try to extract owner/repo for error response, but handle parsing errors gracefully
    let repository = null;
    try {
      const { owner, repo } = parseGitHubUrl(options.repoUrl);
      repository = { owner, repo };
    } catch (parseError) {
      console.warn(`[Stream Warning] Failed to parse repo URL for error response: ${parseError.message}`);
    }

    return {
      success: false,
      error: error.message,
      elapsedTime: formatElapsedTime(elapsedTime),
      repository,
    };
  }
}
