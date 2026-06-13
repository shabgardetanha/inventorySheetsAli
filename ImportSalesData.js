/**
 * 📄 فایل: ImportSalesData.gs
 * 📝 توضیحات: اسکریپت خالص ETL برای استخراج، تبدیل و بارگذاری داده‌ها.
 * ⚠️ توجه: مدیریت اعتبارسنجی (Data Validation) به اسکریپت اصلی واگذار شده است.
 */

const IMPORT_SALES_CONFIG = {
  SOURCE_SHEET: 'import_items',
  TARGET_SHEET: 'PURCHASES', // در صورت نیاز به 'SALES' تغییر دهید
  
  COL_DATE: 'تاريخ',
  COL_ITEM_CODE: 'کد کالا',
  COL_ITEM_NAME: 'نام کالا',
  COL_QTY: 'تعداد',
  COL_UNIT: 'نام واحد',
  COL_PRICE: 'قيمت',
  COL_WAREHOUSE: 'کد انبار'
};

function importSalesDataToTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  const sourceSheet = ss.getSheetByName(IMPORT_SALES_CONFIG.SOURCE_SHEET);
  if (!sourceSheet) {
    ui.alert(`❌ خطا: شیت منبع '${IMPORT_SALES_CONFIG.SOURCE_SHEET}' یافت نشد.`);
    return;
  }
  
  const targetSheet = ss.getSheetByName(IMPORT_SALES_CONFIG.TARGET_SHEET);
  if (!targetSheet) {
    ui.alert(`❌ خطا: شیت مقصد '${IMPORT_SALES_CONFIG.TARGET_SHEET}' یافت نشد.`);
    return;
  }
  
  const rawData = sourceSheet.getDataRange().getValues();
  if (rawData.length < 2) {
    ui.alert('⚠️ شیت منبع خالی است یا فقط شامل هدر می‌باشد.');
    return;
  }
  
  const headers = rawData[0];
  const rows = rawData.slice(1);
  
  const getColIdx = (name) => headers.indexOf(name);
  const idxDate  = getColIdx(IMPORT_SALES_CONFIG.COL_DATE);
  const idxCode  = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_CODE);
  const idxName  = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_NAME);
  const idxQty   = getColIdx(IMPORT_SALES_CONFIG.COL_QTY);
  const idxUnit  = getColIdx(IMPORT_SALES_CONFIG.COL_UNIT);
  const idxPrice = getColIdx(IMPORT_SALES_CONFIG.COL_PRICE);
  const idxWh    = getColIdx(IMPORT_SALES_CONFIG.COL_WAREHOUSE);
  
  if (idxDate === -1 || idxCode === -1 || idxQty === -1) {
    ui.alert('❌ خطا: ستون‌های ضروری (تاريخ، کد کالا، تعداد) یافت نشدند.');
    return;
  }
  
  // 1. شناسایی و ثبت خودکار واحدهای جدید در سیستم (بدون دستکاری اعتبارسنجی)
  const sourceUnits = new Set();
  rows.forEach(row => {
    if (idxUnit !== -1 && row[idxUnit]) {
      sourceUnits.add(String(row[idxUnit]).trim());
    }
  });
  syncUnitsToSystem(ss, Array.from(sourceUnits));
  
  // 2. افزودن خودکار کالاهای جدید به شیت ITEMS
  addNewItemsToItemsSheet(ss, rows, idxCode, idxName, idxUnit);
  
  // 3. پردازش و تبدیل داده‌ها
  const outputRows = [];
  let skippedCount = 0;
  
  rows.forEach((row) => {
    const jalaliDate = row[idxDate];
    const itemCode   = row[idxCode];
    const qty        = row[idxQty];
    
    if (!jalaliDate || !itemCode || !qty) {
      skippedCount++;
      return;
    }
    
    const gregorianDate = convertJalaliToGregorian(jalaliDate);
    if (!gregorianDate) {
      skippedCount++;
      return;
    }
    
    const unitName   = idxUnit  !== -1 ? String(row[idxUnit] || '').trim() : 'عدد';
    const totalCost  = idxPrice !== -1 ? parseNumber(row[idxPrice]) : 0;
    const warehouse  = idxWh    !== -1 ? (String(row[idxWh] || '').trim() || 'DEFAULT_WH') : 'DEFAULT_WH';
    
    if (IMPORT_SALES_CONFIG.TARGET_SHEET === 'SALES') {
      outputRows.push([gregorianDate, jalaliDate, itemCode, parseNumber(qty), 'AUTO', warehouse, 0]);
    } else {
      outputRows.push([gregorianDate, jalaliDate, itemCode, parseNumber(qty), unitName, totalCost, 'AUTO', '', warehouse, 0]);
    }
  });
  
  if (outputRows.length === 0) {
    ui.alert('⚠️ هیچ ردیف معتبری برای انتقال یافت نشد.');
    return;
  }
  
  // 4. آماده‌سازی و نوشتن داده‌ها در شیت مقصد
  const targetLastRow = targetSheet.getLastRow();
  let startRow = 2;
  
  if (targetLastRow === 0) {
    const h = IMPORT_SALES_CONFIG.TARGET_SHEET === 'SALES' ? 
      ['date', 'jalaliDate', 'itemCode', 'qty', 'batchNumber', 'warehouseCode', 'catchWeight'] :
      ['date', 'jalaliDate', 'itemCode', 'qty', 'unit', 'totalCost', 'batchNumber', 'expiryDate', 'warehouseCode', 'catchWeight'];
    targetSheet.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#efefef');
    targetSheet.setFrozenRows(1);
  } else {
    startRow = targetLastRow + 1;
  }
  
  // نوشتن خالص داده‌ها (بدون هیچگونه دستکاری Data Validation)
  targetSheet.getRange(startRow, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
  targetSheet.getRange(startRow, 1, outputRows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 5. فراخوانی تابع اعتبارسنجی از فایل اصلی برای به‌روزرسانی قوانین
  try {
    setupDataValidation(); 
  } catch (e) {
    console.warn("خطا در به‌روزرسانی اعتبارسنجی: " + e.message);
  }
  
  ui.alert(`✅ عملیات با موفقیت انجام شد!\n\n` +
           `📊 تعداد ${outputRows.length} ردیف منتقل شد.\n` +
           `⚠️ ${skippedCount} ردیف نادیده گرفته شد.\n\n` +
           `💡 کالاهای جدید و واحدهای جدید به سیستم اضافه و قوانین اعتبارسنجی به‌روز شدند.`);
}

// =================================================================
// توابع کمکی (فقط مربوط به داده، بدون اعتبارسنجی)
// =================================================================
function syncUnitsToSystem(ss, newUnits) {
  const convSheet = ss.getSheetByName('CONVERSIONS');
  if (!convSheet) {
    const sh = ss.insertSheet('CONVERSIONS');
    sh.getRange(1, 1, 1, 3).setValues([['fromUnit', 'toUnit', 'factor']]).setFontWeight('bold').setBackground('#efefef');
  }
  
  const data = convSheet.getDataRange().getValues();
  const existingUnits = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingUnits.add(String(data[i][0]).trim().toLowerCase());
    if (data[i][1]) existingUnits.add(String(data[i][1]).trim().toLowerCase());
  }
  
  const toAdd = [];
  newUnits.forEach(u => {
    const uStr = String(u).trim().toLowerCase();
    if (uStr && !existingUnits.has(uStr)) {
      toAdd.push([u, u, 1]); 
      existingUnits.add(uStr);
    }
  });
  
  if (toAdd.length > 0) {
    const lastRow = convSheet.getLastRow();
    const startRow = lastRow === 0 ? 2 : lastRow + 1;
    convSheet.getRange(startRow, 1, toAdd.length, 3).setValues(toAdd);
  }
}

function addNewItemsToItemsSheet(ss, sourceRows, idxCode, idxName, idxUnit) {
  const itemsSheet = ss.getSheetByName('ITEMS');
  if (!itemsSheet) {
    const sh = ss.insertSheet('ITEMS');
    sh.getRange(1, 1, 1, 8).setValues([['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit']]).setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
  }
  
  const existingItems = getExistingItemCodes(itemsSheet);
  const newItemsMap = new Map();
  
  sourceRows.forEach(row => {
    const code = row[idxCode];
    if (!code) return;
    const codeStr = String(code).trim();
    if (existingItems.has(codeStr) || newItemsMap.has(codeStr)) return;
    
    const name = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    const unit = idxUnit !== -1 ? String(row[idxUnit] || '').trim() : 'عدد';
    newItemsMap.set(codeStr, { name: name || `کالای ${codeStr}`, unit: unit || 'عدد' });
  });
  
  if (newItemsMap.size === 0) return;
  
  const newRows = [];
  newItemsMap.forEach((data, code) => {
    newRows.push([code, data.name, data.unit, 'PRODUCT', 0, '', 'FALSE', '']);
  });
  
  const lastRow = itemsSheet.getLastRow();
  const startRow = lastRow === 0 ? 2 : lastRow + 1;
  
  if (lastRow === 0) {
    itemsSheet.getRange(1, 1, 1, 8).setValues([['itemCode', 'itemName', 'baseUnit', 'itemType', 'packageSize', 'parentItem', 'isCatchWeight', 'secondaryUnit']]).setFontWeight('bold').setBackground('#efefef');
    itemsSheet.setFrozenRows(1);
  }
  
  itemsSheet.getRange(startRow, 1, newRows.length, 8).setValues(newRows).setBackground('#fff2cc');
  updateDisplayNameColumn(itemsSheet, startRow, newRows.length);
}

function getExistingItemCodes(itemsSheet) {
  const existing = new Set();
  const lastRow = itemsSheet.getLastRow();
  if (lastRow < 2) return existing;
  const lastCol = itemsSheet.getLastColumn() || 1;
  const headers = itemsSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const codeColIdx = headers.indexOf('itemCode');
  if (codeColIdx === -1) return existing;
  
  const codes = itemsSheet.getRange(2, codeColIdx + 1, lastRow - 1, 1).getValues();
  codes.forEach(row => {
    if (row[0] !== '' && row[0] !== null) existing.add(String(row[0]).trim());
  });
  return existing;
}

function updateDisplayNameColumn(itemsSheet, startRow, count) {
  const lastCol = itemsSheet.getLastColumn() || 1;
  const headers = itemsSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let displayNameColIdx = headers.indexOf('displayName');
  if (displayNameColIdx === -1) {
    displayNameColIdx = lastCol;
    itemsSheet.getRange(1, displayNameColIdx + 1).setValue('displayName').setFontWeight('bold');
  }
  for (let i = 0; i < count; i++) {
    const rowIdx = startRow + i;
    const code = itemsSheet.getRange(rowIdx, 1).getValue();
    const name = itemsSheet.getRange(rowIdx, 2).getValue();
    if (code && name) itemsSheet.getRange(rowIdx, displayNameColIdx + 1).setValue(`${name} | ${code}`);
  }
}