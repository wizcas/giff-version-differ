function GetSheetName() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();
}

/**
 * A helper function to create a custom menu in the Spreadsheet.
 * This makes it easy to open the dialog.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Keel")
    .addItem("Add Weekly Deployment", "createWeeklySheet")
    .addItem("Add Service", "showProductServiceDialog")
    .addToUi();
}
