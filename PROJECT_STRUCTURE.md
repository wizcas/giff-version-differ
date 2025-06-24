# Project Structure

This Next.js application follows the App Router pattern with both a web interface and API functionality.

## Directory Structure

```
git-version-differ/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   └── git-diff/            
│   │       └── route.js          # Main API endpoint
│   ├── globals.css               # Global styles with Tailwind
│   ├── layout.js                 # Root layout
│   └── page.js                   # Home page with form interface
├── lib/                          # Shared library code
│   └── core.js                   # Core GitHub API logic
├── cli.js                        # Command-line interface
├── next.config.js                # Next.js configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── postcss.config.js             # PostCSS configuration
├── vercel.json                   # Vercel deployment config
├── package.json                  # Dependencies and scripts
└── README.md                     # Documentation
```

## Key Components

### Next.js App Router (`app/`)

- **`app/page.js`** - Web interface with form for testing the API
- **`app/layout.js`** - Root layout with metadata and global styles
- **`app/globals.css`** - Global styles including Tailwind CSS
- **`app/api/git-diff/route.js`** - Main API endpoint using Next.js App Router

### 🖥️ **Secondary Purpose: CLI Tool**

- **Entry point**: `node cli.js`
- **Purpose**: Local command-line usage
- **Same functionality**: Uses shared core logic

### 🚀 **Quick Start**

```bash
# 1. Development (API)
pnpm dev                    # → http://localhost:3001/api/git-diff

# 2. CLI usage
node cli.js <repo> <from> <to>

# 3. Deploy to Vercel
pnpm vercel-deploy
```

### ✅ **What's Working**

- ✅ **API endpoint**: `/api/git-diff` at port 3001
- ✅ **CLI tool**: `node cli.js --help`
- ✅ **Core logic**: Shared between API and CLI
- ✅ **Local development**: `pnpm dev`
- ✅ **Vercel ready**: `vercel.json` configured
- ✅ **CORS enabled**: Ready for web apps
- ✅ **Environment variables**: GitHub token support

### 📝 **Answers to Original Question**

**Q: Is cli.js and index.js still in use?**

**A:** 
- `cli.js` - ✅ **YES** - This is the CLI tool
- `index.js` - ✅ **YES** - This shows project info and quick start guide

**Previous index.js was the CLI, now it's been split:**
- `index.js` → Project info and navigation
- `cli.js` → Actual CLI implementation  
- `api/git-diff.js` → Main Vercel serverless function

Both are actively used but serve different purposes in the new Vercel API-focused architecture.
