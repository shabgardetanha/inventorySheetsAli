/**
 * 📄 فایل: ImportSalesData.gs
 * 📝 توضیحات: اسکریپت خالص ETL برای استخراج، تبدیل و بارگذاری داده‌ها.
 * ⚠️ توجه: مدیریت اعتبارسنجی (Data Validation) به اسکریپت اصلی واگذار شده است.
 * 🆕 تغییرات: اضافه شدن مکانیزم نرمال‌سازی خودکار تاریخ جلالی به فرمت 14xx/xx/xx
 */

const IMPORT_SALES_CONFIG = {
  SOURCE_SHEET: 'import_items',
  TARGET_SHEET: 'SALES', // در صورت نیاز به 'SALES' تغییر دهید
  
  COL_DATE: 'تاريخ',
  COL_ITEM_CODE: 'کد کالا',
  COL_ITEM_NAME: 'نام کالا',
  COL_QTY: 'تعداد',
  COL_UNIT: 'نام واحد',
  COL_PRICE: 'قيمت',
  COL_WAREHOUSE: 'کد انبار',
  COL_RECEIPT_ID: 'شماره فاکتور', // ⚠️ حیاتی: نام دقیق هدر ستون شماره فیش در شیت import_items
  
  // 🎯 کد ثابت و یکپارچه برای تمام اقلام تجمیعی قلیان
  HOOKAH_UNIFIED_CODE: 'قلیان', // می‌توانید به کد دلخواه مثل 'H-HK-UNIFIED' یا '9999' تغییر دهید
  
  // 🪩 لیست کدهای اقلام پایه قلیان
  HOOKAH_BASE_CODES: new Set([
    '1801', '1802', '1803', '1804', '1805', '1810', '1813', '1814', '1815', '1816',
    '1818', '1819', '1820', '1822', '1905', '1906', '1973', '1974', '1995', '2006',
    '2009', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'
  ]),
  
  // 🔋 لیست کدهای اقلام شارژ
  HOOKAH_CHARGE_CODES: new Set(['1823', '1864', '1975'])
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
  const idxReceipt = getColIdx(IMPORT_SALES_CONFIG.COL_RECEIPT_ID); 

  if (idxDate === -1 || idxCode === -1 || idxQty === -1) {
    ui.alert('❌ خطا: ستون‌های ضروری (تاريخ، کد کالا، تعداد) یافت نشدند.');
    return;
  }
  
  // 1. شناسایی و ثبت خودکار واحدهای جدید در سیستم
  const sourceUnits = new Set();
  rows.forEach(row => {
    if (idxUnit !== -1 && row[idxUnit]) {
      sourceUnits.add(normalizeText(row[idxUnit]));
    }
  });
  syncUnitsToSystem(ss, Array.from(sourceUnits));
  
  // 2. افزودن خودکار کالاهای جدید به شیت ITEMS
  addNewItemsToItemsSheet(ss, rows, idxCode, idxName, idxUnit);
  
  // 🪩 2.5. اعمال منطق تجمیع کامل قلیان و شارژها
  const processedRows = applyHookahChargeLogic(rows, idxReceipt, idxCode, idxName, idxQty);
  
  // 3. پردازش داده‌ها (استفاده از processedRows)
  const outputRows = [];
  let skippedCount = 0;
  
  processedRows.forEach((row) => { 
    let jalaliDateRaw = row[idxDate];
    const itemCode   = row[idxCode];
    const qty        = row[idxQty];
    
    if (!jalaliDateRaw || !itemCode || !qty) {
      skippedCount++;
      return;
    }
    
    // 🛡️ نرمال‌سازی تاریخ به فرمت استاندارد yyyy/mm/dd (مثل 1405/02/01)
    const jalaliDate = normalizeJalaliDateString(jalaliDateRaw);
    if (!jalaliDate) {
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
  
  targetSheet.getRange(startRow, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
  targetSheet.getRange(startRow, 1, outputRows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 5. فراخوانی تابع اعتبارسنجی از فایل اصلی
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
// 🛡️ توابع کمکی نرمال‌سازی تاریخ
// =================================================================

/**
 * 🛡️ تابع نرمال‌سازی تاریخ جلالی به فرمت استاندارد yyyy/mm/dd
 * مثال: تبدیل "1405/2/1" یا "1405-2-1" به "1405/02/01"
 */
function normalizeJalaliDateString(dateStr) {
  if (!dateStr) return null;
  
  // اگر آبجکت تاریخ (Date) مستقیماً از گوگل شیت خوانده شده بود
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return formatDateJalali(dateStr, 'yyyy/mm/dd');
  }
  
  // اگر عدد (تایم‌استمپ) بود
  if (typeof dateStr === 'number') {
    return formatDateJalali(new Date(dateStr), 'yyyy/mm/dd');
  }

  // اگر رشته متنی بود (مثل "1405/2/1" یا "1405/02/01")
  let str = String(dateStr).trim()
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  
  const parts = str.split(/[\/\-\.،,\s]+/).map(p => parseInt(p, 10));
  if (parts.length < 3 || parts.some(isNaN)) return null;
  
  const [jy, jm, jd] = parts;
  // اعتبارسنجی بازه‌های مجاز
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

// =================================================================
// توابع کمکی (فقط مربوط به داده، بدون اعتبارسنجی)
// =================================================================

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
    const unit = idxUnit !== -1 ? normalizeText(row[idxUnit]) : 'عدد';
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

/**
 * 🆕 فقط افزودن کالاهای جدید به ITEMS (بدون انتقال فروش)
 */
function syncNewItemsOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  const sourceSheet = ss.getSheetByName(IMPORT_SALES_CONFIG.SOURCE_SHEET);
  if (!sourceSheet) {
    ui.alert(`❌ خطا: شیت منبع '${IMPORT_SALES_CONFIG.SOURCE_SHEET}' یافت نشد.`);
    return;
  }
  
  const itemsSheet = ss.getSheetByName('ITEMS');
  if (!itemsSheet) {
    ui.alert(`❌ خطا: شیت مقصد 'ITEMS' یافت نشد.`);
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
  const idxCode = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_CODE);
  const idxName = getColIdx(IMPORT_SALES_CONFIG.COL_ITEM_NAME);
  const idxUnit = getColIdx(IMPORT_SALES_CONFIG.COL_UNIT);
  
  if (idxCode === -1) {
    ui.alert('❌ خطا: ستون "کد کالا" در شیت منبع یافت نشد.');
    return;
  }

  const sourceUnits = new Set();
  rows.forEach(row => {
    if (idxUnit !== -1 && row[idxUnit]) {
      sourceUnits.add(normalizeText(row[idxUnit])); 
    }
  });
  
  syncUnitsToSystem(ss, Array.from(sourceUnits));
  
  const existingItems = getExistingItemCodes(itemsSheet);
  const newItemsMap = new Map();
  
  rows.forEach(row => {
    const code = row[idxCode];
    if (!code) return;
    const codeStr = String(code).trim();
    if (existingItems.has(codeStr) || newItemsMap.has(codeStr)) return;
    
    const name = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    const unit = idxUnit !== -1 ? normalizeText(row[idxUnit]) : 'عدد'; 
    
    newItemsMap.set(codeStr, { name: name || `کالای ${codeStr}`, unit: unit || 'عدد' });
  });
  
  if (newItemsMap.size === 0) {
    ui.alert('✅ هیچ کالای جدیدی برای افزودن به ITEMS یافت نشد.');
    return;
  }
  
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
  
  try {
    itemsSheet.getDataRange().clearDataValidations();
    SpreadsheetApp.flush(); 
  } catch (e) {
    console.error("هشدار در پاک‌سازی اعتبارسنجی ITEMS: " + e.message);
  }
  
  itemsSheet.getRange(startRow, 1, newRows.length, 8).setValues(newRows).setBackground('#fff2cc');
  updateDisplayNameColumn(itemsSheet, startRow, newRows.length);
  
  try {
    setupDataValidation(); 
  } catch (e) {
    console.warn("خطا در به‌روزرسانی اعتبارسنجی: " + e.message);
  }
  
  ui.alert(`✅ عملیات با موفقیت انجام شد!\n\n` +
           `🆕 تعداد ${newRows.length} کالای جدید به ITEMS اضافه شد.\n` +
           `📏 واحدهای جدید به سیستم و لیست‌های کشویی اضافه شدند.\n\n` +
           `💡 تمام حروف عربی/فارسی و فاصله‌ها به صورت خودکار استاندارد شدند.`);
}

// =================================================================
// توابع کمکی به‌روزرسانی شده
// =================================================================

/**
 * 📏 افزودن واحدهای جدید به شیت CONVERSIONS (با پشتیبانی از استانداردسازی)
 */
function syncUnitsToSystem(ss, newUnits) {
  const convSheet = ss.getSheetByName('CONVERSIONS');
  if (!convSheet) {
    const sh = ss.insertSheet('CONVERSIONS');
    sh.getRange(1, 1, 1, 3).setValues([['fromUnit', 'toUnit', 'factor']]).setFontWeight('bold').setBackground('#efefef');
  }
  
  const data = convSheet.getDataRange().getValues();
  const existingUnits = new Set();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingUnits.add(normalizeText(data[i][0]));
    if (data[i][1]) existingUnits.add(normalizeText(data[i][1]));
  }
  
  const toAdd = [];
  newUnits.forEach(u => {
    const normalizedUnit = normalizeText(u); 
    if (normalizedUnit && !existingUnits.has(normalizedUnit)) {
      toAdd.push([normalizedUnit, normalizedUnit, 1]); 
      existingUnits.add(normalizedUnit);
    }
  });
  
  if (toAdd.length > 0) {
    const lastRow = convSheet.getLastRow();
    const startRow = lastRow === 0 ? 2 : lastRow + 1;
    convSheet.getRange(startRow, 1, toAdd.length, 3).setValues(toAdd);
  }
}

/**
 * 🪩 منطق استاندارد تجمیع اقلام قلیان (نسخه Enterprise)
 * تمام ردیف‌های قلیان/شارژ حذف شده و یک ردیف جدید با کد ثابت (HOOKAH_UNIFIED_CODE) ایجاد می‌شود.
 */
function applyHookahChargeLogic(rows, idxReceipt, idxCode, idxName, idxQty) {
  if (idxReceipt === -1) {
    console.warn("⚠️ ستون 'شماره فیش' یافت نشد. منطق تجمیع قلیان نادیده گرفته شد.");
    return rows;
  }

  // گروه‌بندی ردیف‌ها بر اساس شماره فیش
  const receiptsMap = new Map();
  rows.forEach((row, index) => {
    const receiptId = String(row[idxReceipt] || '').trim();
    if (!receiptId) return;
    if (!receiptsMap.has(receiptId)) receiptsMap.set(receiptId, []);
    receiptsMap.get(receiptId).push({ index, row });
  });

  const rowsToSkip = new Set(); 
  const newUnifiedRows = []; // ردیف‌های تجمیعی جدید که باید اضافه شوند

  receiptsMap.forEach((itemsInReceipt) => {
    let totalHookahQty = 0;
    const hookahRowIndices = [];
    let representativeRow = null; // الگویی برای کپی اطلاعات (تاریخ، انبار، فیش و...)

    // بررسی تمام آیتم‌های داخل یک فیش
    itemsInReceipt.forEach(item => {
      const itemCode = String(item.row[idxCode] || '').trim();
      const qty = parseNumber(item.row[idxQty]);

      // 🔥 تشخیص یکپارچه: کد پایه یا شارژ قلیان
      if (IMPORT_SALES_CONFIG.HOOKAH_BASE_CODES.has(itemCode) || 
          IMPORT_SALES_CONFIG.HOOKAH_CHARGE_CODES.has(itemCode)) {
        
        hookahRowIndices.push(item.index);
        totalHookahQty += qty;

        // اولین ردیف قلیان فقط به عنوان الگو برای کپی سایر ستون‌ها (تاریخ، انبار و...)
        if (!representativeRow) {
          representativeRow = item.row;
        }
      }
    });

    // اگر در این فیش حداقل یک آیتم قلیان یا شارژ وجود داشت
    if (representativeRow && totalHookahQty > 0) {
      // 🆕 ساخت یک ردیف کاملاً جدید با کد ثابت
      const unifiedRow = [...representativeRow]; // کپی از ردیف اصلی
      unifiedRow[idxCode] = IMPORT_SALEًS_CONFIG.HOOKAH_UNIFIED_CODE; // کد ثابت
      if (idxName !== -1) {
        unifiedRow[idxName] = 'قلیان (تجمیعی)'; // نام ثابت
      }
      unifiedRow[idxQty] = totalHookahQty; // مقدار جمع کل
      
      newUnifiedRows.push(unifiedRow);
      
      // ✂️ علامت‌گذاری تمام ردیف‌های اصلی قلیان/شارژ برای حذف
      hookahRowIndices.forEach(idx => rowsToSkip.add(idx));
    }
  });

  // 🔄 فیلتر کردن ردیف‌های حذف شده + اضافه کردن ردیف‌های تجمیعی جدید
  const filteredRows = rows.filter((row, index) => !rowsToSkip.has(index));
  return [...filteredRows, ...newUnifiedRows];
}