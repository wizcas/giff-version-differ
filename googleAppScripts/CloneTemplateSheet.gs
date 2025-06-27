/**
 * @fileoverview Google Apps Script for cloning a template sheet and clearing data rows.
 *
 * This script clones a sheet named "Template" to create a new data sheet,
 * then removes all rows except the header row (row 1).
 */

/**
 * Creates a new sheet by cloning the "Template" sheet and clearing all data rows.
 * Only keeps the header row (row 1).
 *
 * @param {string} newSheetName - The name for the new cloned sheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} The newly created sheet or null if failed
 */
function cloneTemplateSheet(newSheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const templateSheet = ss.getSheetByName("Template");

    if (!templateSheet) {
      throw new Error('Template sheet named "Template" not found.');
    }

    // Check if sheet with the new name already exists
    const existingSheet = ss.getSheetByName(newSheetName);
    if (existingSheet) {
      throw new Error(`Sheet with name "${newSheetName}" already exists.`);
    }

    // Clone the template sheet
    const newSheet = templateSheet.copyTo(ss);

    // Rename the cloned sheet
    newSheet.setName(newSheetName);

    // Ensure the cloned sheet is visible (not hidden)
    newSheet.showSheet();

    // Clear all data rows except the header row
    clearDataRows(newSheet);

    Logger.log(`Successfully created new sheet "${newSheetName}" from Template`);
    return newSheet;
  } catch (error) {
    Logger.log(`Error cloning template sheet: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`);
    return null;
  }
}

/**
 * Clears all data rows from a sheet, keeping only the header row (row 1).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to clear data rows from
 */
function clearDataRows(sheet) {
  try {
    const lastRow = sheet.getLastRow();

    // If there are only headers (row 1) or no data, nothing to delete
    if (lastRow <= 1) {
      Logger.log(`No data rows to delete in sheet "${sheet.getName()}"`);
      return;
    }

    // Calculate how many rows to delete (all rows except header)
    const rowsToDelete = lastRow - 1;

    // Delete all data rows (starting from row 2)
    sheet.deleteRows(2, rowsToDelete);

    Logger.log(`Deleted ${rowsToDelete} data rows from sheet "${sheet.getName()}"`);
  } catch (error) {
    Logger.log(`Error clearing data rows: ${error.message}`);
    throw error;
  }
}

/**
 * Interactive function to prompt user for new sheet name and clone template.
 * This can be called from a custom menu or run manually.
 */
function promptAndCloneTemplate() {
  try {
    const ui = SpreadsheetApp.getUi();

    // Prompt user for new sheet name
    const response = ui.prompt("Clone Template Sheet", "Enter a name for the new sheet:", ui.ButtonSet.OK_CANCEL);

    if (response.getSelectedButton() === ui.Button.OK) {
      const newSheetName = response.getResponseText().trim();

      if (!newSheetName) {
        ui.alert("Error", "Sheet name cannot be empty.", ui.ButtonSet.OK);
        return;
      }

      // Clone the template sheet
      const newSheet = cloneTemplateSheet(newSheetName);

      if (newSheet) {
        // Switch to the newly created sheet
        SpreadsheetApp.setActiveSheet(newSheet);
        ui.alert("Success", `New sheet "${newSheetName}" created successfully from Template.`, ui.ButtonSet.OK);
      }
    }
  } catch (error) {
    Logger.log(`Error in promptAndCloneTemplate: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`);
  }
}

/**
 * Batch function to create multiple sheets from template with auto-generated names.
 *
 * @param {string} baseName - Base name for the sheets (e.g., "Sprint")
 * @param {number} count - Number of sheets to create
 * @param {string} suffix - Suffix pattern: "number" for Sprint1, Sprint2 or "date" for Sprint_2025-01-01
 */
function createMultipleSheetsFromTemplate(baseName = "Sheet", count = 1, suffix = "number") {
  try {
    const createdSheets = [];

    for (let i = 1; i <= count; i++) {
      let sheetName;

      if (suffix === "date") {
        const today = new Date();
        const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD format
        sheetName = `${baseName}_${dateStr}_${i}`;
      } else {
        sheetName = `${baseName}${i}`;
      }

      const newSheet = cloneTemplateSheet(sheetName);
      if (newSheet) {
        createdSheets.push(sheetName);
      }
    }

    if (createdSheets.length > 0) {
      Logger.log(`Successfully created ${createdSheets.length} sheets: ${createdSheets.join(", ")}`);
      SpreadsheetApp.getUi().alert(
        "Success",
        `Created ${createdSheets.length} sheets: ${createdSheets.join(", ")}`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }

    return createdSheets;
  } catch (error) {
    Logger.log(`Error creating multiple sheets: ${error.message}`);
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`);
    return [];
  }
}

/**
 * Creates a custom menu in the spreadsheet for easy access to template cloning functions.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Template Tools")
    .addItem("Clone Template Sheet", "promptAndCloneTemplate")
    .addSeparator()
    .addItem("Create 3 Sprint Sheets", "createSprintSheets")
    .addItem("Create Deploy Sheet (Next Tuesday)", "createWeeklySheet")
    .addToUi();
}

/**
 * Helper function to create 3 sprint sheets with numbered names.
 */
function createSprintSheets() {
  createMultipleSheetsFromTemplate("Sprint", 3, "number");
}

/**
 * Helper function to create a weekly sheet with next Tuesday's date.
 */
function createWeeklySheet() {
  const today = new Date();
  const nextTuesday = getNextTuesday(today);
  const dateStr = nextTuesday.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const sheetName = `Deploy on ${dateStr}`;
  cloneTemplateSheet(sheetName);
}

/**
 * Helper function to calculate the next Tuesday from a given date.
 * @param {Date} fromDate - The date to calculate from
 * @returns {Date} The next Tuesday date
 */
function getNextTuesday(fromDate) {
  const date = new Date(fromDate);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilTuesday = (2 - dayOfWeek + 7) % 7; // 2 = Tuesday

  // If today is Tuesday, get next Tuesday (add 7 days)
  const daysToAdd = daysUntilTuesday === 0 ? 7 : daysUntilTuesday;

  date.setDate(date.getDate() + daysToAdd);
  return date;
}

/**
 * Test function to verify the script works correctly.
 */
function testCloneTemplate() {
  // Test creating a single sheet
  const testSheetName = "Test_" + new Date().getTime();
  const newSheet = cloneTemplateSheet(testSheetName);

  if (newSheet) {
    Logger.log("Test successful: Sheet created and data cleared");
    // Clean up test sheet
    SpreadsheetApp.getActiveSpreadsheet().deleteSheet(newSheet);
    Logger.log("Test cleanup completed");
  } else {
    Logger.log("Test failed: Sheet creation failed");
  }
}
