/**
 * @fileoverview Google Apps Script for processing git diff via Web App.
 *
 * This script handles requests from a Web App URL embedded in Google Sheet cells.
 * It fetches row data, queries a metadata sheet, calls an external API,
 * and updates the spreadsheet with the API response.
 */

const METADATA_SHEET_NAME = "Metadata"; // Your metadata sheet name
const API_BASE_URL = "<BASE_URL>";
// Consider storing this in User Properties for security.
// <<< IMPORTANT: Replace with your actual API token.
const API_TOKEN = "<TOKEN>";
// Base URL for the repository that will be concatenated with the `Repo` metadata
// <<< IMPORTANT: Do not end with a slash. Example: "https://github.com/microsoft/vscode"
const REPO_BASE_URL = "<REPO_BASE_URL>";

/**
 * Main function to handle GET requests from the Web App URL.
 * This function is triggered when a user clicks the hyperlink in the sheet.
 *
 * @param {GoogleAppsScript.Events.DoGet} e The event object containing request parameters.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} An HTML output to close the tab or provide feedback.
 */
function doGet(e) {
  const params = e.parameter;
  console.log({ params });
  const targetRow = parseInt(params.row, 10); // Get row number from URL parameter
  const mainSheetName = params.sheet; // The sheet to process
  const dryRun = params.dry === 1 || params.dry === "1" || params.dry === "true";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName(mainSheetName);

  // Validate the sheet and target row
  if (!mainSheet) {
    return createHtmlResponse(`Error: Data sheet ${mainSheetName} not found.`);
  }
  if (isNaN(targetRow) || targetRow < 2) {
    // Assuming row 1 is headers
    return createHtmlResponse("Error: you must run this link on the row of a product service.");
  }

  // Use a LockService to prevent concurrent modifications on the same sheet.
  // This is crucial for operations that modify the sheet structure.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds for the lock

  let responseHtml = "";
  try {
    // 1. Fetch and verify the input data from the current row (Column A, B, and C)
    const rowValues = mainSheet.getRange(targetRow, 1, 1, 3).getValues()[0]; // Get A, B, C
    let serviceName = "";
    if (rowValues[0]) {
      // Ensure cell A has content
      console.log("cell0:", rowValues[0]);
      const aCellContent = String(rowValues[0]); // Convert to string explicitly
      const lines = aCellContent.split("\n");
      if (lines.length > 1) {
        serviceName = lines[1].trim(); // Get the second line and trim whitespace
      } else {
        serviceName = lines[0].trim(); // If only one line, take that one
      }
    }
    const fromVersion = rowValues[1];
    const toVersion = rowValues[2];

    const missingColumns = [];
    if (!serviceName) missingColumns.push("A (Service Name)");
    if (!fromVersion) missingColumns.push("B (From)");
    if (!toVersion) missingColumns.push("C (To)");

    if (missingColumns.length > 0) {
      const errorMessage = `Error: Missing data in row ${targetRow} for columns: ${missingColumns.join(", ")}.`;
      Logger.log(errorMessage);
      return createHtmlResponse(errorMessage);
    }

    // 2. From Metadata sheet, retrieve predefined settings: repo, targetDir, excludeSubPaths
    const metadata = getMetadataForService(serviceName);
    if (!metadata) {
      const errorMessage = `Error: No metadata found for service "${serviceName}" in the "${METADATA_SHEET_NAME}" sheet.`;
      Logger.log(errorMessage);
      return createHtmlResponse(errorMessage);
    }

    const repo = `${REPO_BASE_URL}/${metadata.repo}`; // Extend repo URL
    const targetDir = metadata.targetDir;
    const excludeSubPaths = metadata.excludeSubPaths;

    // 3. Build the API request URL and make the call
    const apiUrl = buildApiUrl({
      repo,
      from: fromVersion,
      to: toVersion,
      targetDir,
      excludeSubPaths,
      token: API_TOKEN,
    });

    Logger.log(`Calling API: ${apiUrl}`);

    let commits = [];
    if (!dryRun) {
      const apiResponse = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
      const responseCode = apiResponse.getResponseCode();
      const responseBody = apiResponse.getContentText();

      if (responseCode !== 200) {
        const errorMessage = `API Error: Status ${responseCode}, Response: ${responseBody}`;
        Logger.log(errorMessage);
        return createHtmlResponse(errorMessage);
      }

      // 4. Parse the JSON response for commit history
      const data = JSON.parse(responseBody);
      commits = data.commits;
    }

    if (!commits || !Array.isArray(commits)) {
      const errorMessage = `API Error: 'commits' field not found or not an array in API response.`;
      Logger.log(errorMessage);
      return createHtmlResponse(errorMessage);
    }

    // 5. Delete existing commits and insert the newly fetched ones
    insertCommitsIntoSheet(mainSheet, targetRow, commits);

    responseHtml = `Successfully processed row ${targetRow} and inserted ${commits.length} commits.`;
    Logger.log(responseHtml);
  } catch (error) {
    const errorMessage = `An unexpected error occurred: ${error.message}`;
    Logger.log(errorMessage);
    return createHtmlResponse(errorMessage);
  } finally {
    lock.releaseLock(); // Release the lock whether successful or not
  }

  return createHtmlResponse(responseHtml);
}

/**
 * Creates an HTML response to close the window or display a message.
 * @param {string} message The message to display.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} An HTML output.
 */
function createHtmlResponse(message) {
  return HtmlService.createHtmlOutput(
    `<script>
       alert('${message.replace(/'/g, "\\'")}'); // Escape single quotes for JS string
       google.script.host.close();
     </script>`
  );
}

/**
 * Retrieves metadata for a given service name from the Metadata sheet.
 * @param {string} serviceName The name of the service to look up.
 * @returns {Object|null} An object containing repo, targetDir, excludeSubPaths, or null if not found.
 */
function getMetadataForService(serviceName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const metadataSheet = ss.getSheetByName(METADATA_SHEET_NAME);

  if (!metadataSheet) {
    throw new Error(`Metadata sheet "${METADATA_SHEET_NAME}" not found.`);
  }

  // Assuming Metadata sheet has headers in row 1: A:ServiceName, D:repo, E:targetDir, F:excludeSubPaths
  // Find the column indices for dynamic mapping
  const headers = metadataSheet.getRange(1, 1, 1, metadataSheet.getLastColumn()).getDisplayValues()[0];
  const colMap = {};
  headers.forEach((header, index) => {
    switch (header.trim()) {
      case "Service":
        colMap.serviceName = index + 1;
        break;
      case "Repo":
        colMap.repo = index + 1;
        break;
      case "Target Directory":
        colMap.targetDir = index + 1;
        break;
      case "Exclude Sub-paths":
        colMap.excludeSubPaths = index + 1;
        break;
    }
  });

  if (!colMap.serviceName || !colMap.repo || !colMap.targetDir || !colMap.excludeSubPaths) {
    throw new Error(
      `Required metadata columns (Service, Repo, Target Dir, Exclude Sub-paths) not found in "${METADATA_SHEET_NAME}" sheet.`
    );
  }

  const dataRange = metadataSheet.getDataRange();
  const values = dataRange.getDisplayValues(); // Get all data

  // Iterate from row 2 (skip header)
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[colMap.serviceName - 1] === serviceName) {
      // Adjust index for 0-based array
      return {
        repo: row[colMap.repo - 1],
        targetDir: row[colMap.targetDir - 1],
        excludeSubPaths: row[colMap.excludeSubPaths - 1],
      };
    }
  }
  return null; // Service not found
}

/**
 * Builds the API URL with provided parameters.
 * @param {Object} params An object containing repo, from, to, targetDir, excludeSubPaths, token.
 * @returns {string} The constructed API URL.
 */
function buildApiUrl(params) {
  const queryParts = [];
  // Iterate over the properties of the params object
  // and encode each key-value pair for URL safety.
  // We explicitly list the parameters we expect to ensure clarity
  // and prevent accidental inclusion of unwanted properties.
  // Note: Using encodeURIComponent for individual parts is crucial for URL safety.
  if (params.repo) {
    queryParts.push(`repo=${encodeURIComponent(params.repo)}`);
  }
  if (params.from) {
    queryParts.push(`from=${encodeURIComponent(params.from)}`);
  }
  if (params.to) {
    queryParts.push(`to=${encodeURIComponent(params.to)}`);
  }
  if (params.targetDir) {
    queryParts.push(`targetDir=${encodeURIComponent(params.targetDir)}`);
  }
  if (params.excludeSubPaths) {
    // excludeSubPaths can be an array, if so, it needs to be joined correctly
    // If it's a string, it will be encoded directly.
    // Assuming it's a comma-separated string for simplicity based on typical API designs.
    // If your API expects multiple 'excludeSubPaths' parameters, you'd iterate here.
    queryParts.push(`excludeSubPaths=${encodeURIComponent(params.excludeSubPaths)}`);
  }
  if (params.token) {
    // Add token here as per your request
    queryParts.push(`token=${encodeURIComponent(params.token)}`);
  }
  // Join all parts with '&' and prepend with '?'
  const queryString = queryParts.join("&");
  return `${API_BASE_URL}?${queryString}`;
}

/**
 * Inserts commit data into the sheet, clearing existing rows below the target.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to modify.
 * @param {number} targetRow The row where the initial service data is.
 * @param {Array<Object>} commits An array of commit objects.
 */
function insertCommitsIntoSheet(sheet, targetRow, commits) {
  // Find the row number of the next service entry
  const lastRow = sheet.getLastRow();
  let nextServiceRow = lastRow + 1; // Default to end of sheet if no more services below

  if (lastRow - targetRow > 0) {
    // Search for the next row in column A that has data (i.e., next service entry)
    // We start searching from targetRow + 1 (the row immediately after the current service)
    const rangeToCheck = sheet.getRange(targetRow + 1, 1, lastRow - targetRow, 1);
    const valuesToCheck = rangeToCheck.getDisplayValues();

    for (let i = 0; i < valuesToCheck.length; i++) {
      if (valuesToCheck[i][0] && valuesToCheck[i][0].toString().trim() !== "") {
        nextServiceRow = targetRow + 1 + i;
        break;
      }
    }

    // Determine the number of rows to delete.
    // If nextServiceRow is the end of the sheet, delete all rows until last row + 1.
    // If it's another service entry, delete rows from targetRow + 1 up to nextServiceRow - 1.
    const rowsToDeleteCount = nextServiceRow - (targetRow + 1);

    if (rowsToDeleteCount > 0) {
      sheet.deleteRows(targetRow + 1, rowsToDeleteCount);
    }
  }

  // Prepare commit data for insertion
  const dataToInsert = commits.map((commit) => {
    // Ensure all fields are handled, providing empty string if missing
    const message = commit.message || "";
    const date = new Date(commit.date) || "";
    const author = commit.author || "";
    const jiraTicketId = commit.jiraTicketId || ""; // Assuming API returns this
    const semverType = commit.semverType || ""; // Assuming API returns this

    return ["", "", "", message, date, author, jiraTicketId, semverType]; // D,E,F,G,H columns for commits
    // A,B,C are empty for these rows
  });

  if (dataToInsert.length > 0) {
    const startRow = targetRow + 1;
    const numRows = dataToInsert.length;
    const numCols = dataToInsert[0].length; // Should be 8 (for A-H)

    // Insert new rows for commits
    sheet.insertRowsAfter(targetRow, numRows);
    // Write data to the inserted rows
    sheet.getRange(startRow, 1, numRows, numCols).setValues(dataToInsert);
  }

  SpreadsheetApp.flush(); // Apply all pending spreadsheet changes
}

/**
 * Helper function to set the API token securely.
 * Run this function ONCE from the Apps Script editor after deployment.
 */
function setApiToken() {
  const ui = SpreadsheetApp.getUi();
  const token = ui.prompt("Set API Token", "Please enter your API token for git-diff service:", ui.ButtonSet.OK_CANCEL).getResponseText();

  if (token) {
    PropertiesService.getUserProperties().setProperty("GIT_DIFF_API_TOKEN", token);
    ui.alert("API Token saved successfully.");
  } else {
    ui.alert("API Token not set.");
  }
}

/**
 * Function to retrieve the API token (for use in doGet).
 * This should be called from doGet or other functions that need the token.
 */
function getApiToken() {
  return PropertiesService.getUserProperties().getProperty("GIT_DIFF_API_TOKEN");
}

function test() {
  doGet({ parameter: { row: 2, sheet: "Sheet2", dry: 0 } });
}
