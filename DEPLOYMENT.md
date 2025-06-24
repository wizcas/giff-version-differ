# Next.js Deployment Guide

## 🚀 Quick Deployment to Vercel

### Method 1: CLI Deployment (Recommended)

```bash
# 1. Build the project locally to test
pnpm run build

# 2. Deploy to Vercel
pnpm vercel-deploy

# Or use vercel CLI directly
vercel --prod
```

### Method 2: GitHub Integration

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Vercel will automatically detect it's a Next.js project and deploy

## ⚙️ Build Configuration

### Next.js Build
Next.js handles the build process automatically. The `next build` command:
- Builds the web application
- Optimizes the App Router API routes for serverless deployment
- Generates static assets and optimized bundles

### Vercel Configuration (`vercel.json`)

```json
{
  "version": 2,
  "framework": "nextjs",
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "pnpm install",
  "env": {
    "NODE_ENV": "production"
  }
}
```

**Next.js Configuration (`next.config.js`)**

```javascript
const nextConfig = {
  serverExternalPackages: ['@octokit/rest', '@octokit/graphql'],
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
}

export default nextConfig
```
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
