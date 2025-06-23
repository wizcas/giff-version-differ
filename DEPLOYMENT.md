# Vercel Deployment Guide

## 🚀 Quick Deployment

### Method 1: CLI Deployment (Recommended)

```bash
# 1. Build the project
pnpm run build

# 2. Deploy to Vercel
pnpm vercel-deploy

# Or use vercel CLI directly
vercel --prod
```

### Method 2: GitHub Integration

1. Push your code to GitHub
2. Connect repository to Vercel dashboard
3. Vercel will automatically deploy on push

## ⚙️ Build Configuration

### Build Script
```json
{
  "scripts": {
    "build": "node -e \"console.log('✅ Build completed - Node.js serverless functions ready')\""
  }
}
```

**Why this build script?**
- Node.js serverless functions don't need compilation
- This script just confirms everything is ready
- Vercel will handle the serverless function deployment

### Vercel Configuration (`vercel.json`)

```json
{
  "version": 2,
  "functions": {
    "api/git-diff.js": {
      "runtime": "nodejs20.x",
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/git-diff",
      "destination": "/api/git-diff"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## 🔑 Environment Variables

In Vercel dashboard, add:

```
GITHUB_TOKEN=your_github_personal_access_token
```

## 📡 API Endpoints After Deployment

```
# Primary endpoint
https://your-app.vercel.app/api/git-diff?repo=<repo>&from=<from>&to=<to>

# Legacy endpoint (redirects to /api/git-diff)
https://your-app.vercel.app/git-diff?repo=<repo>&from=<from>&to=<to>
```

## ✅ Deployment Checklist

- [ ] `pnpm run build` succeeds
- [ ] `api/git-diff.js` exists and exports default function
- [ ] `vercel.json` is configured
- [ ] Dependencies are in `package.json`
- [ ] Environment variables set in Vercel dashboard
- [ ] GitHub token has appropriate permissions

## 🔧 Troubleshooting

**Q: "Build script required"**
A: ✅ Added `build` script to package.json

**Q: "Function not found"**
A: ✅ Ensure `api/git-diff.js` exports default function

**Q: "Module not found"**
A: ✅ Check that all imports use correct relative paths

**Q: "Timeout"**
A: ✅ Set `maxDuration: 30` in vercel.json

## 🎯 What Vercel Does

1. **Detects**: Node.js project with `api/` folder
2. **Builds**: Runs `pnpm run build`
3. **Deploys**: Creates serverless function from `api/git-diff.js`
4. **Serves**: Makes function available at `/api/git-diff`
