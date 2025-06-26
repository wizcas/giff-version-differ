# Google Apps Script Integration Guide

This guide shows how to integrate the Git Version Differ streaming API with Google Apps Script to avoid timeout issues while processing large repositories.

## Streaming API Endpoints

### 1. Dedicated Stream Endpoint (Recommended)

- **URL**: `/api/git-diff/stream`
- **Format**: JSON Lines (one JSON object per line)
- **Best for**: Google Apps Script, batch processing

### 2. Regular API with Streaming

- **URL**: `/api/git-diff?stream=true`
- **Format**: Server-Sent Events
- **Best for**: Web browsers, real-time UI updates

## Google Apps Script Examples

### Basic Example - Get All Commits

```javascript
function getGitCommits() {
  const baseUrl = 'https://your-app.vercel.app/api/git-diff/stream';
  const params = new URLSearchParams({
    repo: 'https://github.com/owner/repository',
    from: 'v1.0.0',
    to: 'v2.0.0',
    token: 'your-github-token', // Optional, for private repos
  });

  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/x-ndjson'
      }
    });

    const lines = response.getContentText().split('\\n');
    let allCommits = [];
    let totalCommits = 0;

    lines.forEach(line => {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);

          switch (data.type) {
            case 'start':
              Logger.log(`Started processing: ${data.repoUrl}`);
              break;

            case 'progress':
              Logger.log(`Progress: ${data.status}`);
              break;

            case 'commits':
              allCommits = allCommits.concat(data.commits);
              Logger.log(`Received ${data.commits.length} commits. Progress: ${data.progress.processed}/${data.progress.total}`);
              break;

            case 'complete':
              totalCommits = data.totalCommits;
              Logger.log(`Completed: ${totalCommits} commits processed in ${data.elapsedTime}`);
              break;

            case 'error':
              throw new Error(`API Error: ${data.error}`);
          }
        } catch (parseError) {
          Logger.log(`Failed to parse line: ${line}`);
        }
      }
    });

    Logger.log(`Final result: ${allCommits.length} commits collected`);
    return {
      commits: allCommits,
      totalCommits: totalCommits,
      success: true
    };

  } catch (error) {
    Logger.log(`Error: ${error.message}`);
    return {
      commits: [],
      totalCommits: 0,
      success: false,
      error: error.message
    };
  }
}
```

### Advanced Example - Write to Google Sheets

```javascript
function updateCommitsInSheet() {
  const sheetName = 'Git Commits';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Get or create sheet
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  // Clear existing data
  sheet.clear();

  // Set headers
  const headers = ['Hash', 'Author', 'Date', 'Message', 'Semver Type', 'Files Changed'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Get commits using streaming API
  const baseUrl = 'https://your-app.vercel.app/api/git-diff/stream';
  const params = new URLSearchParams({
    repo: 'https://github.com/owner/repository',
    from: 'v1.0.0',
    to: 'v2.0.0',
    targetDir: 'src/', // Optional: focus on specific directory
    excludeSubPaths: 'tests,docs', // Optional: exclude certain paths
  });

  const url = `${baseUrl}?${params.toString()}`;

  try {
    const response = UrlFetchApp.fetch(url);
    const lines = response.getContentText().split('\\n');
    let allCommits = [];
    let currentRow = 2; // Start after headers

    lines.forEach(line => {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);

          if (data.type === 'commits') {
            // Process commits in batches as they arrive
            const batchData = data.commits.map(commit => [
              commit.hash,
              commit.author,
              new Date(commit.date),
              commit.cleanMessage || commit.message,
              commit.semverType || 'patch',
              commit.filesChanged || 0
            ]);

            // Write batch to sheet
            if (batchData.length > 0) {
              sheet.getRange(currentRow, 1, batchData.length, headers.length).setValues(batchData);
              currentRow += batchData.length;

              // Update progress in cell A1
              sheet.getRange('A1').setNote(`Progress: ${data.progress.processed}/${data.progress.total} commits`);
            }

            allCommits = allCommits.concat(data.commits);

          } else if (data.type === 'complete') {
            // Final update
            sheet.getRange('A1').setNote(`Completed: ${data.totalCommits} commits in ${data.elapsedTime}`);
            Logger.log(`Sheet updated with ${allCommits.length} commits`);
          }

        } catch (parseError) {
          Logger.log(`Failed to parse line: ${line}`);
        }
      }
    });

    // Format the sheet
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);

    return allCommits.length;

  } catch (error) {
    Logger.log(`Error updating sheet: ${error.message}`);
    throw error;
  }
}
```

### Batch Processing Example

```javascript
function processMultipleRepositories() {
  const repositories = [
    { repo: 'https://github.com/owner/repo1', from: 'v1.0.0', to: 'v1.1.0' },
    { repo: 'https://github.com/owner/repo2', from: 'v2.0.0', to: 'v2.1.0' },
    { repo: 'https://github.com/owner/repo3', from: 'main', to: 'develop' },
  ];

  const results = [];

  repositories.forEach((config, index) => {
    Logger.log(`Processing repository ${index + 1}/${repositories.length}: ${config.repo}`);

    try {
      const result = getGitCommitsForRepo(config);
      results.push({
        ...config,
        success: true,
        commitCount: result.commits.length,
        commits: result.commits
      });

      // Add delay between requests to be respectful
      Utilities.sleep(1000);

    } catch (error) {
      Logger.log(`Failed to process ${config.repo}: ${error.message}`);
      results.push({
        ...config,
        success: false,
        error: error.message,
        commitCount: 0,
        commits: []
      });
    }
  });

  return results;
}

function getGitCommitsForRepo(config) {
  const baseUrl = 'https://your-app.vercel.app/api/git-diff/stream';
  const params = new URLSearchParams(config);
  const url = `${baseUrl}?${params.toString()}`;

  const response = UrlFetchApp.fetch(url);
  const lines = response.getContentText().split('\\n');
  let allCommits = [];

  lines.forEach(line => {
    if (line.trim()) {
      try {
        const data = JSON.parse(line);
        if (data.type === 'commits') {
          allCommits = allCommits.concat(data.commits);
        } else if (data.type === 'error') {
          throw new Error(data.error);
        }
      } catch (parseError) {
        // Skip malformed lines
      }
    }
  });

  return { commits: allCommits };
}
```

## Key Benefits

### ✅ No Timeout Issues

- Streaming responses prevent Vercel's 10-second timeout
- Process repositories with thousands of commits
- Real-time progress updates

### ✅ Memory Efficient

- Data is processed in small batches
- No need to load entire response into memory
- Suitable for Google Apps Script's execution limits

### ✅ Robust Error Handling

- Individual batch failures don't break the entire process
- Detailed error reporting
- Graceful degradation

## Best Practices

1. **Use the `/stream` endpoint** for Google Apps Script integration
2. **Add delays** between multiple API calls to avoid rate limiting
3. **Process data incrementally** rather than waiting for completion
4. **Implement proper error handling** for network issues
5. **Monitor progress** using the progress updates
6. **Set up authentication** for private repositories

## Rate Limits

- GitHub API rate limits still apply (5000 requests/hour for authenticated users)
- The streaming API makes multiple GitHub API calls internally
- For large repositories, consider processing during off-peak hours

## Support

If you encounter issues with the streaming API, check:

1. Network connectivity
2. GitHub token permissions (if using private repos)
3. Repository URL format
4. Parameter encoding

For more examples and updates, visit: <https://github.com/your-repo/git-version-differ>
