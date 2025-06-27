/**
 * @fileoverview Google Apps Script backend for the Product-Service Dialog.
 * Handles data retrieval and dialog display.
 */

const DIFF_FORMULA = '=HYPERLINK(Settings!B1&"?row="&ROW()&"&sheet="&ENCODEURL(GetSheetName()), "🔍 Diff")';
const ADDITONAL_INFORMATION_RANGE = "A3:C9";

/**
 * Displays the HTML dialog. This function can be called from a custom menu item.
 * It now pre-loads all product and service data and passes it to the dialog.
 */
function showProductServiceDialog() {
  // 1. Get all product and service data ONCE on the server-side
  const allProductServiceData = getProductServiceData();

  // 2. Create the HTML template and pass the data to it
  // --- IMPORTANT: Changed 'dialog' to 'AddServiceDialog' ---
  const htmlTemplate = HtmlService.createTemplateFromFile("AddServiceDialog");
  htmlTemplate.loadedMetadata = JSON.stringify(allProductServiceData); // Pass the data as a template variable

  const htmlOutput = htmlTemplate.evaluate().setWidth(500).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, "Add Service Entry"); // Changed dialog title
}

/**
 * A helper function to create a custom menu in the Spreadsheet.
 * This makes it easy to open the dialog.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    // --- IMPORTANT: Changed menu name to 'Keel' ---
    .createMenu("Keel")
    // --- IMPORTANT: Changed menu item name to 'Add Service' ---
    .addItem("Add Service", "showProductServiceDialog")
    .addToUi();
}

/**
 * Retrieves all product and service data from the "Metadata" sheet.
 * Processes the data to link services to their respective products.
 *
 * @returns {Object} An object where keys are product names and values are arrays of services.
 *                   Example: { "Product A": ["Service A1", "Service A2"], "Product B": ["Service B1"] }
 */
function getProductServiceData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Corrected spelling
  const metadataSheet = ss.getSheetByName("Metadata");
  if (!metadataSheet) {
    throw new Error('Sheet "Metadata" not found. Please ensure it exists.');
  }

  const lastRow = metadataSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("Metadata sheet is empty or only has headers.");
    return {}; // Return empty object if no data
  }
  const range = metadataSheet.getRange(2, 1, lastRow - 1, 2);
  const values = range.getValues();

  const productServices = {};
  let currentProduct = null;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const product = row[0] ? String(row[0]).trim() : ""; // Column A (Product)
    const service = row[1] ? String(row[1]).trim() : ""; // Column B (Service)

    if (product) {
      currentProduct = product;
      if (!productServices[currentProduct]) {
        productServices[currentProduct] = [];
      }
    }

    if (currentProduct && service) {
      if (!productServices[currentProduct].includes(service)) {
        productServices[currentProduct].push(service);
      }
    }
  }

  for (const product in productServices) {
    productServices[product].sort();
  }

  Logger.log("Processed Product-Service Data: %s", JSON.stringify(productServices));
  return productServices;
}

/**
 * Looks up the pipeline URL for a given service from the Metadata sheet.
 * @param {string} service The service name to look up.
 * @returns {string|null} The pipeline URL if found, null otherwise.
 */
function getPipelineUrlForService(service) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const metadataSheet = ss.getSheetByName("Metadata");

  if (!metadataSheet) {
    Logger.log("Metadata sheet not found");
    return null;
  }

  const lastRow = metadataSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("Metadata sheet has no data");
    return null;
  }

  // Get headers to find the correct columns
  const headers = metadataSheet.getRange(1, 1, 1, metadataSheet.getLastColumn()).getDisplayValues()[0];
  let serviceColumn = -1;
  let pipelineUrlColumn = -1;

  // Find column indices
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim();
    if (header === "Service") {
      serviceColumn = i + 1; // Convert to 1-based index
    } else if (header === "Pipeline URL") {
      pipelineUrlColumn = i + 1; // Convert to 1-based index
    }
  }

  if (serviceColumn === -1 || pipelineUrlColumn === -1) {
    Logger.log("Required columns not found in Metadata sheet");
    return null;
  }

  // Search for the service in the data
  const dataRange = metadataSheet.getRange(2, 1, lastRow - 1, metadataSheet.getLastColumn());
  const values = dataRange.getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const currentService = row[serviceColumn - 1]; // Convert back to 0-based index

    if (currentService && currentService.trim() === service.trim()) {
      const pipelineUrl = row[pipelineUrlColumn - 1]; // Convert back to 0-based index
      return pipelineUrl && pipelineUrl.trim() !== "" ? pipelineUrl.trim() : null;
    }
  }

  Logger.log(`Service "${service}" not found in Metadata sheet`);
  return null;
}

/**
 * Copies the range Settings!A3:C8 and inserts it after the specified target row with formatting.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet The sheet to insert the copied range into.
 * @param {number} targetRow The row after which to insert the copied range.
 */
function copySettingsRange(targetSheet, targetRow) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = ss.getSheetByName("Settings");

    if (!settingsSheet) {
      Logger.log("Settings sheet not found, skipping range copy");
      return;
    }

    // Get the source range Settings!A3:C8 (6 rows x 3 columns)
    const sourceRange = settingsSheet.getRange(ADDITONAL_INFORMATION_RANGE);
    const numRows = sourceRange.getNumRows();
    const numCols = sourceRange.getNumColumns();

    // Insert rows after the target row to make space for the copied range
    targetSheet.insertRowsAfter(targetRow, numRows);

    // Get the destination range (starting from the row after targetRow)
    const destinationRange = targetSheet.getRange(targetRow + 1, 1, numRows, numCols);

    // Copy values and formatting
    sourceRange.copyTo(destinationRange, SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);

    Logger.log(`Copied Settings!${ADDITONAL_INFORMATION_RANGE} to ${targetSheet.getName()} starting at row ${targetRow + 1}`);
  } catch (error) {
    Logger.log(`Error copying Settings range: ${error.message}`);
  }
}

/**
 * Processes the selected product and service from the dialog.
 * First, checks if the product/service combination already exists in column A.
 * If it exists, highlights the row and returns a status.
 * Otherwise, finds the first row in the active sheet where A and D columns are empty,
 * and writes the combined product/service string with specific formatting
 * to column A of that row. The text is hyperlinked to the Pipeline URL from the Metadata sheet
 * if a matching service is found. If no empty row is found, appends a new row.
 *
 * @param {string} product The selected product name.
 * @param {string} service The selected service name.
 * @returns {object} An object indicating the status (success or exists) and row number.
 */
function processSelection(product, service) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();

  // The plain text content that will be displayed in the cell, including the newline.
  const formattedProductServicePlain = `${product}\n${service}`;

  // Look up the pipeline URL for the service
  const pipelineUrl = getPipelineUrlForService(service);

  // Create the RichTextValue for "Product\nService" format with styles
  let richTextBuilder = SpreadsheetApp.newRichTextValue()
    .setText(formattedProductServicePlain) // Use \n for newline
    .setTextStyle(
      0,
      product.length,
      SpreadsheetApp.newTextStyle() // Style for Product part
        .setItalic(true) // Italic
        .setFontSize(10) // Slightly smaller font size for Product
        .build()
    )
    .setTextStyle(
      product.length + 1,
      product.length + 1 + service.length,
      SpreadsheetApp.newTextStyle() // Style for Service part
        .setBold(true) // Bold
        .build()
    );

  // Add hyperlink if pipeline URL is found
  if (pipelineUrl) {
    richTextBuilder = richTextBuilder.setLinkUrl(0, formattedProductServicePlain.length, pipelineUrl);
    Logger.log(`Setting hyperlink for service "${service}" to: ${pipelineUrl}`);
  } else {
    Logger.log(`No pipeline URL found for service "${service}"`);
  }

  const richTextValue = richTextBuilder.build();
  // 1. Check if the "Product\nService" combination already exists in Column A
  const lastDataRow = activeSheet.getLastRow();
  // Check if there's data beyond header row (assuming header is row 1)
  if (lastDataRow >= 2) {
    // getDisplayValues() is crucial here as it retrieves the rendered text string,
    // which handles RichTextValue cell content by returning its plain text.
    const columnAValues = activeSheet.getRange(2, 1, lastDataRow - 1, 1).getDisplayValues();
    for (let i = 0; i < columnAValues.length; i++) {
      const currentRow = i + 2; // Actual row number in sheet (startIndex + i)
      // Compare the trimmed displayed value with our expected plain text.
      if (String(columnAValues[i][0]).trim() === formattedProductServicePlain.trim()) {
        Logger.log("Product/Service already exists in row: %s", currentRow);
        // Highlight the row
        activeSheet.getRange(currentRow, 1, 1, activeSheet.getLastColumn()).setBackground("yellow");
        SpreadsheetApp.flush(); // Ensure highlight is applied immediately
        return { status: "exists", rowNumber: currentRow }; // Indicate that it already exists
      }
    }
  }
  // 2. If not found, proceed to find an empty row or append
  const startRow = 2; // Assuming data starts from row 2 (after header)
  const lastSheetRow = activeSheet.getLastRow(); // Current last row of the sheet
  // If there are no rows beyond the header, or only header, handle gracefully
  // This case means lastSheetRow is 0 or 1.
  if (lastSheetRow < startRow) {
    Logger.log("Active sheet is empty or only has headers. Appending new row with RichTextValue.");
    // getRange(row, column) - here, it will be row 2, column 1
    const newRowIndex = activeSheet.getLastRow() + 1; // This will be 2 if only header, or 1 if empty
    activeSheet.getRange(newRowIndex, 1).setRichTextValue(richTextValue);
    activeSheet.getRange(newRowIndex, 4).setFormula(DIFF_FORMULA);

    // Copy Settings!A3:C8 and insert it after the target row
    copySettingsRange(activeSheet, newRowIndex);

    // Ensure the row extends to at least column D for future checks.
    // If the sheet's last column is less than 4 (D), expand it.
    if (activeSheet.getLastColumn() < 5) {
      // Fill from column B to D (3 columns starting from B which is col 2)
      activeSheet.getRange(newRowIndex, 2, 1, 4).setValues([["", "", ""]]);
    }
    return { status: "success", rowNumber: newRowIndex };
  }
  // If the sheet has existing rows, look for an empty row.
  // We need to check columns A and D.
  // getRange(startRow, startColumn, numRows, numColumns)
  // We want to check from 'startRow' up to 'lastSheetRow', starting from Col 1 (A)
  // and including Col 4 (D).
  const rangeToCheck = activeSheet.getRange(startRow, 1, lastSheetRow - startRow + 1, 4);
  const values = rangeToCheck.getValues(); // Raw values (for checking empty A and D)
  let foundEmptyRow = false;
  let targetRowNumber = -1;
  for (let i = 0; i < values.length; i++) {
    const rowData = values[i];
    // Check if the plain string value of column A and D are empty.
    const serviceColumnValue = String(rowData[0]).trim(); // Column A (index 0)
    const commitsColumnValue = String(rowData[3]).trim(); // Column D (index 3)
    if (serviceColumnValue === "" && commitsColumnValue === "") {
      targetRowNumber = startRow + i; // Calculate the actual row number
      Logger.log("Found empty row at: %s", targetRowNumber);
      activeSheet.getRange(targetRowNumber, 1).setRichTextValue(richTextValue);
      activeSheet.getRange(targetRowNumber, 4).setFormula(DIFF_FORMULA);

      // Copy Settings!A3:C8 and insert it after the target row
      copySettingsRange(activeSheet, targetRowNumber);

      foundEmptyRow = true;
      break; // Found one, so stop
    }
  }
  // If no empty row was found in the existing range, append a new one.
  if (!foundEmptyRow) {
    Logger.log("No empty row found in A and D columns. Appending new row with RichTextValue.");
    targetRowNumber = activeSheet.getLastRow() + 1; // Append to the very end
    activeSheet.getRange(targetRowNumber, 1).setRichTextValue(richTextValue);
    activeSheet.getRange(targetRowNumber, 4).setFormula(DIFF_FORMULA);

    // Copy Settings!A3:C8 and insert it after the target row
    copySettingsRange(activeSheet, targetRowNumber);

    // Ensure the row extends to at least column D for future checks
    if (activeSheet.getLastColumn() < 5) {
      activeSheet.getRange(targetRowNumber, 2, 1, 4).setValues([["", "", ""]]);
    }
  }
  Logger.log("User selected Product: %s, Service: %s, written to sheet with formatting.", product, service);
  return { status: "success", rowNumber: targetRowNumber }; // Indicate success
}
