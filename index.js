#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { getCommitsBetween } from "./lib/core.js";

/**
 * Display commits in human-readable format
 * @param {Array} commits - Array of processed commit objects
 * @param {string} fromRef - Starting reference (tag or commit)
 * @param {string} toRef - Ending reference (tag or commit)
 */
function displayCommitsHuman(commits, fromRef, toRef) {
  console.log(chalk.blue.bold(`\n📋 Commits between ${fromRef} and ${toRef}:`));
  console.log(chalk.gray("─".repeat(80)));

  if (commits.length === 0) {
    console.log(chalk.yellow("No commits found between the specified references."));
    return;
  }

  commits.forEach((commit, index) => {
    const date = new Date(commit.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const shortHash = commit.hash.substring(0, 7);
    let messageDisplay = `${chalk.green(index + 1 + ".")} ${chalk.cyan(shortHash)} ${chalk.white(commit.message)}`;

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

  console.log(chalk.blue.bold(`Total commits: ${commits.length}`));
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
 * Output commits in JSON format
 * @param {object} result - Result object from getCommitsBetween
 */
function outputCommitsJson(result) {
  console.log(JSON.stringify(result, null, 2));
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
  .option("--rest-only", "Force use of REST API only (bypass GraphQL)")
  .action(async (repoUrl, from, to, options) => {
    try {
      // Validate output format
      if (!["human", "json"].includes(options.format)) {
        throw new Error('Invalid output format. Use "human" or "json".');
      }

      if (options.format === "human") {
        console.log(chalk.blue("🔍 Analyzing repository..."));
      }

      // Prepare options for the core function
      const coreOptions = {
        repoUrl,
        from,
        to,
        token: options.token,
        targetDir: options.targetDir,
        excludeDir: options.excludeDir,
        restOnly: options.restOnly,
      };

      if (options.format === "human") {
        console.log(chalk.blue("📍 Resolving references..."));
      }

      // Get commits using the core function
      const result = await getCommitsBetween(coreOptions);

      if (result.success) {
        if (options.format === "human") {
          console.log(chalk.gray(`Repository: ${result.repository.owner}/${result.repository.repo}`));
          console.log(chalk.gray(`From: ${result.fromRef} (${result.fromSha})`));
          console.log(chalk.gray(`To: ${result.toRef} (${result.toSha})`));

          const apiMessage =
            result.apiUsed === "graphql"
              ? "✅ Used GraphQL API"
              : result.apiUsed === "rest"
              ? "✅ Used REST API"
              : "✅ Used REST API (fallback)";
          console.log(chalk.green(apiMessage));

          if (coreOptions.targetDir || coreOptions.excludeDir) {
            console.log(chalk.blue("🔍 Applied directory filtering"));
          }

          displayCommitsHuman(result.commits, from, to);
          console.log(chalk.gray(`\n⏱️  Total elapsed time: ${result.elapsedTime}`));
        } else {
          outputCommitsJson(result);
        }
      } else {
        if (options.format === "json") {
          console.error(JSON.stringify(result, null, 2));
        } else {
          console.error(chalk.red("❌ Error:"), result.error);

          if (result.error.includes("API rate limit exceeded")) {
            console.log(chalk.yellow("\n💡 Tip: Set a GitHub personal access token to increase rate limits:"));
            console.log(chalk.gray("   export GITHUB_TOKEN=your_token_here"));
            console.log(chalk.gray("   or use the --token option"));
          }

          console.log(chalk.gray(`\n⏱️  Total elapsed time: ${result.elapsedTime}`));
        }

        process.exit(1);
      }
    } catch (error) {
      if (options.format === "json") {
        console.error(
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
      } else {
        console.error(chalk.red("❌ Error:"), error.message);
      }

      process.exit(1);
    }
  });

program.parse();
