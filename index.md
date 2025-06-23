# Git Version Differ - Vercel API

A serverless API to get commit information between two Git tags or commit hashes from GitHub repositories.

## 🌐 API Endpoint

**GET** `/api/git-diff`

### Query Parameters

- `repo` - **Required** - GitHub repository URL
- `from` - **Required** - Starting tag or commit hash  
- `to` - **Required** - Ending tag or commit hash
- `token` - Optional - GitHub personal access token
- `targetDir` - Optional - Limit commits to those that changed files in this directory
- `excludeDir` - Optional - Exclude commits that only changed files in this directory
- `restOnly` - Optional - Set to `true` or `1` to force REST API usage

## 🚀 Quick Start

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/git-version-differ)

### Local Development

```bash
# Install dependencies
pnpm install

# Start local development server (no Vercel login required)
pnpm dev

# Or use Vercel dev (requires login)
pnpm vercel-dev
```

### API Usage Examples

```bash
# Basic usage
curl "https://your-app.vercel.app/api/git-diff?repo=https://github.com/facebook/react&from=v18.0.0&to=v18.2.0"

# With directory filtering
curl "https://your-app.vercel.app/api/git-diff?repo=https://github.com/facebook/react&from=v18.0.0&to=v18.2.0&targetDir=packages/"

# Force REST API usage
curl "https://your-app.vercel.app/api/git-diff?repo=https://github.com/facebook/react&from=v18.0.0&to=v18.2.0&restOnly=true"

# Local development
curl "http://localhost:3000/api/git-diff?repo=https://github.com/octocat/Hello-World&from=v1.0&to=HEAD"
```

## 📊 Response Format

### Success Response

```json
{
  "success": true,
  "commits": [
    {
      "hash": "abc123...",
      "author": "John Doe",
      "date": "2023-10-15T10:30:00Z",
      "message": "Add new feature",
      "semverType": "feat",
      "jiraTicketId": "PROJ-123"
    }
  ],
  "totalCommits": 42,
  "elapsedTime": "1.23s",
  "apiUsed": "graphql",
  "repository": {
    "owner": "facebook",
    "repo": "react"
  },
  "fromRef": "v18.0.0",
  "toRef": "v18.2.0",
  "fromSha": "def456",
  "toSha": "ghi789"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message description",
  "elapsedTime": "0.5s"
}
```

## ⚙️ Features

- ✅ **GraphQL-first** - Uses GitHub's GraphQL API for optimal performance
- ✅ **REST fallback** - Automatically falls back to REST API when needed
- ✅ **Directory filtering** - Include/exclude commits by changed files
- ✅ **Smart parsing** - Extracts semver types and Jira ticket IDs
- ✅ **Performance timing** - Shows API response time
- ✅ **CORS enabled** - Ready for web applications
- ✅ **Rate limit handling** - Graceful error handling
- ✅ **Environment variables** - Supports GitHub tokens for higher limits

## 🛠️ CLI Tool

This project also includes a CLI tool for local usage:

```bash
# Run CLI
node cli.js https://github.com/owner/repo tag1 tag2

# JSON output
node cli.js https://github.com/owner/repo tag1 tag2 --format json

# Help
node cli.js --help
```

## 🔑 Environment Variables

Set in Vercel dashboard or `.env.local`:

```bash
GITHUB_TOKEN=your_github_personal_access_token
```

## 📁 Project Structure

```
├── api/
│   └── git-diff.js      # Vercel serverless function
├── lib/
│   └── core.js          # Core business logic
├── cli.js               # CLI tool
├── local-server.js      # Local development server
└── vercel.json          # Vercel configuration
```
