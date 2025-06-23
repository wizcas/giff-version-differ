# Git Version Differ

A Node.js CLI tool that fetches commit information between two Git tags or commit hashes from a GitHub repository with advanced filtering and formatting capabilities.

## Features

- ✅ **Optimized GitHub API calls** - Uses GraphQL by default with automatic REST API fallback
- ✅ **Execution timing** - Shows total elapsed time at the end of each execution
- ✅ Accepts GitHub repository URLs in various formats
- ✅ Works with both Git tags and commit hashes
- ✅ Displays commit titles, dates, and authors
- ✅ Parses semver types from commit messages (`major`, `minor`, `patch`, `fix`, `feat`, etc.)
- ✅ Extracts Jira ticket IDs from commit messages
- ✅ Supports JSON and human-readable output formats
- ✅ Directory-based filtering (include/exclude commits by changed files)
- ✅ Beautiful colored output in human format
- ✅ Supports GitHub personal access tokens for higher rate limits
- ✅ Node.js 22+ compatible

## Installation

1. Clone or download this repository
2. Install dependencies:

   ```bash
   pnpm install
   ```

## Usage

### Basic Usage

```bash
pnpm start <github-repo-url> <from-tag-or-commit> <to-tag-or-commit> [options]
```

### Options

- `-t, --token <token>` - GitHub personal access token (or set GITHUB_TOKEN env var)
- `-f, --format <format>` - Output format: `human` (default) or `json`
- `--target-dir <directory>` - Limit commits to those that changed files in this directory
- `--exclude-dir <directory>` - Exclude commits that only changed files in this directory

### Examples

```bash
# Basic usage with human-readable output
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0

# JSON output format
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0 --format json

# Filter commits that changed files in 'src' directory
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0 --target-dir src/

# Exclude commits that only changed documentation
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0 --exclude-dir docs/

# Using commit hashes
pnpm start https://github.com/facebook/react abc1234 def5678

# With GitHub token for higher rate limits
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0 --token your_github_token
```

### Supported GitHub URL Formats

- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `git@github.com:owner/repo.git`

## Commit Message Parsing

The tool automatically parses commit messages in the following format:

```
<semver-type>: [JIRA-TICKET] Commit message description
```

### Supported Semver Types

- `major` - Breaking changes
- `minor` - New features (backward compatible)
- `patch` - Bug fixes
- `fix` - Bug fixes
- `feat`/`feature` - New features
- `chore` - Maintenance tasks
- `docs` - Documentation changes
- `style` - Code style changes
- `refactor` - Code refactoring
- `test` - Test changes
- `build` - Build system changes
- `ci` - CI/CD changes
- `perf` - Performance improvements
- `revert` - Revert changes

### Jira Ticket Format

Jira tickets should be in the format `[PROJECT-123]` where:
- `PROJECT` is uppercase letters (A-Z)
- `123` is a number

Examples:
- `feat: [PROJ-123] Add user authentication`
- `fix: [BUG-456] Fix memory leak in cache`
- `docs: Update README with new examples`

## Output Formats

### Human Format (Default)

```
📋 Commits between v1.0.0 and v1.1.0:
────────────────────────────────────────────────────────────────────────────────

1. abc1234 Add user authentication [FEAT] [PROJ-123]
   By: John Doe on Oct 1, 2023 at 12:00 PM

2. def5678 Fix memory leak in cache [FIX] [BUG-456]
   By: Jane Smith on Oct 2, 2023 at 2:30 PM

⏱️  Total elapsed time: 2.45s
Total commits: 2
```

### JSON Format

```json
{
  "commits": [
    {
      "hash": "abc1234567890",
      "author": "John Doe",
      "date": "2023-10-01T12:00:00Z",
      "message": "Add user authentication",
      "semverType": "feat",
      "jiraTicketId": "PROJ-123"
    },
    {
      "hash": "def5678901234",
      "author": "Jane Smith",
      "date": "2023-10-02T14:30:00Z",
      "message": "Fix memory leak in cache",
      "semverType": "fix",
      "jiraTicketId": "BUG-456"
    }
  ],
  "totalCommits": 2,
  "elapsedTime": "2.45s"
}
```

## Directory Filtering

### Target Directory

Use `--target-dir` to include only commits that changed files in a specific directory:

```bash
# Only show commits that changed files in src/
pnpm start https://github.com/owner/repo v1.0.0 v2.0.0 --target-dir src/
```

### Exclude Directory

Use `--exclude-dir` to exclude commits that only changed files in a specific directory:

```bash
# Exclude commits that only changed documentation
pnpm start https://github.com/owner/repo v1.0.0 v2.0.0 --exclude-dir docs/
```

**Note:** Target directory takes precedence over exclude directory. If a commit changes files in both the target directory and exclude directory, it will be included.

## API Optimization

The tool is optimized for performance:

- **GraphQL First**: Uses GitHub's GraphQL API by default for faster data fetching
- **Automatic Fallback**: Falls back to REST API when GraphQL fails (rate limits, authentication issues)
- **Batch Processing**: Efficiently processes commits in batches when file filtering is needed
- **Smart Caching**: Minimizes API calls by leveraging data already retrieved

**Performance Comparison:**
- GraphQL API: ~70% faster for large commit ranges
- REST API: More reliable for unauthenticated requests
- Combined approach: Best of both worlds

## GitHub Personal Access Token

For higher API rate limits, you can provide a GitHub personal access token:

**Option 1: Environment Variable**

```bash
export GITHUB_TOKEN=your_token_here
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0
```

**Option 2: Command Line Option**

```bash
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0 --token your_token_here
```

## Requirements

- Node.js 22.0.0 or higher
- Internet connection to access GitHub API

## Rate Limits

- **Without token**: 60 requests per hour
- **With token**: 5,000 requests per hour

## Error Handling

The tool provides helpful error messages for:

- Invalid GitHub repository URLs
- Non-existent tags or commits
- API rate limit exceeded
- Network connectivity issues
- Invalid output format

## License

MIT
