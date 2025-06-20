# Differ Requirements

The differ functionality is designed to compare two versions of a GitHub repository, specified by tags or commit hashes. It retrieves the list of commits between these two references and output with user-friendly formatting or JSON format.

## Inputs

- **GitHub Repository URL**: The URL of the GitHub repository to compare.
- **From Reference**: The starting point for the comparison, which can be a tag or
- **To Reference**: The endpoint for the comparison, which can also be a tag or commit hash.
- **GitHub Personal Access Token** (optional): For higher API rate limits or accesing private GitHub repos, you can provide a GitHub personal access token.
- **Output Format**: The format of the output, either user-friendly or JSON.
- **Target Directory**: Limits commits that has changed files to a specific directory within the repository.
- **Exclude Directory**: Excludes commits that have changed files in a specific directory within the repository **only if** the commit doesn't change anything in the **Target Directory**. In other words, **Target Directory** takes precedence over **Exclude Directory**.

## Outputs

Returns a list of comments between the specified references.

Parse the commit message if it matches this format: `Semver type: [Jira ticket ID] Commit message`. The semver type can be one of `major`, `minor`, `patch`, `fix`, `maint`, `chore`, etc. The Jira ticket ID is optional and should match this regex `[A-Z]+-\d+`.

For `human` output format, print a user-friendly list of commits with the following details:

- Commit hash
- Author
- Date
- Commit message
- Semver type (if applicable)
- Jira ticket ID (if applicable)

For `json` output format, return a JSON object with the following structure:

```json
{
  "commits": [
    {
      "hash": "abc1234",
      "author": "John Doe",
      "date": "2023-10-01T12:00:00Z",
      "message": "Commit message",
      "semverType": "minor",
      "jiraTicketId": "JIRA-123"
    },
    ...
  ],
  "totalCommits": 10
}
```
