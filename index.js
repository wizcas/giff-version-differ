#!/usr/bin/env node

import { program } from "commander";
import { Octokit } from "@octokit/rest";
import chalk from "chalk";

// Initialize Octokit (GitHub API client)
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN, // Optional: for higher rate limits
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
      throw new Error(`Could not find tag or commit: ${tagOrCommit}`);
    }
  }
}

/**
 * Get commits between two commit SHAs
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} baseSha - Base commit SHA (older)
 * @param {string} headSha - Head commit SHA (newer)
 * @returns {Array} - Array of commit objects
 */
async function getCommitsBetween(owner, repo, baseSha, headSha) {
  try {
    const response = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseSha,
      head: headSha,
    });

    return response.data.commits;
  } catch (error) {
    throw new Error(`Error comparing commits: ${error.message}`);
  }
}

/**
 * Format and display commit information
 * @param {Array} commits - Array of commit objects
 * @param {string} fromRef - Starting reference (tag or commit)
 * @param {string} toRef - Ending reference (tag or commit)
 */
function displayCommits(commits, fromRef, toRef) {
  console.log(chalk.blue.bold(`\n📋 Commits between ${fromRef} and ${toRef}:`));
  console.log(chalk.gray("─".repeat(80)));

  if (commits.length === 0) {
    console.log(chalk.yellow("No commits found between the specified references."));
    return;
  }

  commits.forEach((commit, index) => {
    const date = new Date(commit.commit.author.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const author = commit.commit.author.name;
    const message = commit.commit.message.split("\n")[0]; // Get first line only
    const sha = commit.sha.substring(0, 7);

    console.log(`${chalk.green(index + 1 + ".")} ${chalk.cyan(sha)} ${chalk.white(message)}`);
    console.log(`   ${chalk.gray("By:")} ${chalk.yellow(author)} ${chalk.gray("on")} ${chalk.magenta(date)}`);
    console.log("");
  });

  console.log(chalk.blue.bold(`Total commits: ${commits.length}`));
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
  .action(async (repoUrl, from, to, options) => {
    try {
      // Set GitHub token if provided via option
      if (options.token) {
        octokit.auth = options.token;
      }

      console.log(chalk.blue("🔍 Analyzing repository..."));

      // Parse GitHub URL
      const { owner, repo } = parseGitHubUrl(repoUrl);
      console.log(chalk.gray(`Repository: ${owner}/${repo}`));

      // Get commit SHAs for the references
      console.log(chalk.blue("📍 Resolving references..."));
      const fromSha = await getCommitSha(owner, repo, from);
      const toSha = await getCommitSha(owner, repo, to);

      console.log(chalk.gray(`From: ${from} (${fromSha.substring(0, 7)})`));
      console.log(chalk.gray(`To: ${to} (${toSha.substring(0, 7)})`));

      // Get commits between the references
      console.log(chalk.blue("📊 Fetching commits..."));
      const commits = await getCommitsBetween(owner, repo, fromSha, toSha);

      // Display the results
      displayCommits(commits, from, to);
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);

      if (error.message.includes("API rate limit exceeded")) {
        console.log(chalk.yellow("\n💡 Tip: Set a GitHub personal access token to increase rate limits:"));
        console.log(chalk.gray("   export GITHUB_TOKEN=your_token_here"));
        console.log(chalk.gray("   or use the --token option"));
      }

      process.exit(1);
    }
  });

program.parse();
