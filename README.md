# Git Version Differ

A Node.js CLI tool that fetches commit information between two Git tags or commit hashes from a GitHub repository.

## Features

- ✅ Accepts GitHub repository URLs in various formats
- ✅ Works with both Git tags and commit hashes
- ✅ Displays commit titles, dates, and authors
- ✅ Beautiful colored output
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
pnpm start <github-repo-url> <from-tag-or-commit> <to-tag-or-commit>
```

### Examples

```bash
# Using tags
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0

# Using commit hashes
pnpm start https://github.com/facebook/react abc1234 def5678

# Mix of tag and commit hash
pnpm start https://github.com/facebook/react v18.0.0 abc1234

# With GitHub token for higher rate limits
pnpm start https://github.com/facebook/react v18.0.0 v18.2.0 --token your_github_token
```

### Supported GitHub URL Formats

- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `git@github.com:owner/repo.git`

### GitHub Personal Access Token

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

## Output

The tool displays:
- 📋 List of commits between the specified references
- 🔢 Sequential numbering of commits
- 🏷️ Short commit SHA (7 characters)
- 📝 Commit message (first line)
- 👤 Author name
- 📅 Commit date and time
- 📊 Total number of commits

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

## License

MIT
