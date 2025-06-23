# 快速开始指南

## 问题解决：Vercel CLI 未安装

如果您遇到 `'vercel' 不是内部或外部命令` 的错误，这是因为 Vercel CLI 没有安装。

### 解决方案

我们提供了两种运行 API 服务器的方式：

## 方式 1：本地服务器（推荐，无需登录）

```bash
# 启动本地 API 服务器
pnpm local-server

# 在浏览器中测试
http://localhost:3000/git-diff?repo=https://github.com/octocat/Hello-World&from=v1.0&to=HEAD
```

## 方式 2：Vercel 开发服务器（需要登录）

```bash
# 全局安装 Vercel CLI（已完成）
pnpm add -g vercel

# 启动 Vercel 开发服务器（需要登录 GitHub）
pnpm vercel-dev
```

## CLI 使用

```bash
# 基本用法
node index.js https://github.com/owner/repo tag1 tag2

# JSON 格式输出
node index.js https://github.com/owner/repo tag1 tag2 --format json

# 强制使用 REST API
node index.js https://github.com/owner/repo tag1 tag2 --rest-only
```

## API 测试示例

```bash
# 测试基本功能
curl "http://localhost:3000/git-diff?repo=https://github.com/octocat/Hello-World&from=v1.0&to=HEAD"

# 使用目录过滤
curl "http://localhost:3000/git-diff?repo=https://github.com/facebook/react&from=v18.0.0&to=v18.2.0&targetDir=packages/"

# 强制使用 REST API
curl "http://localhost:3000/git-diff?repo=https://github.com/facebook/react&from=v18.0.0&to=v18.2.0&restOnly=true"
```

## 环境变量

为了获得更高的 GitHub API 速率限制，建议设置：

```bash
# Windows PowerShell
$env:GITHUB_TOKEN="your_github_token_here"

# Windows CMD
set GITHUB_TOKEN=your_github_token_here

# 然后运行命令
pnpm local-server
```

## 可用脚本

- `pnpm test` - 运行测试
- `pnpm cli` - 直接运行 CLI
- `pnpm local-server` - 启动本地 API 服务器（推荐）
- `pnpm vercel-dev` - 启动 Vercel 开发服务器（需要登录）
- `pnpm vercel-deploy` - 部署到 Vercel（需要登录）

## 成功标志

✅ CLI 模式：`node index.js --help` 显示帮助信息
✅ API 模式：`pnpm local-server` 启动服务器并在浏览器中访问
✅ 两种模式都支持相同的功能和选项
