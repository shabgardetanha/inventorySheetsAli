

npm install -g @google/clasp

clasp login


clasp clone "1T-RSq0ucYLUNDLMNZHuERZvSDdFKmJKUpO3tv-COOpxbsP8bPEXXc9XP"


clasp push

# 📖 راهنمای جامع فنی نسخه Enterprise 8.0

در این مستند، معماری، منطق و نحوه عملکرد کد نسخه ۸.۰ را به صورت کامل و بخش به بخش تشریح می‌کنیم.

---

## 🏗️ بخش ۱: معماری کلی سیستم

### ۱.۱ تغییر پارادایم از دو‌بعدی به سه‌بعدی

در نسخه‌های قبلی (۷.۳ و پایین‌تر)، ساختار موجودی به صورت **دو‌بعدی** بود:
```
موجودی = f(کد کالا)
```

اما در نسخه ۸.۰، ساختار به **سه‌بعدی** ارتقا یافته است:
```
موجودی = f(انبار، کد کالا، شماره بچ)
```

این تغییر در کد به صورت زیر پیاده‌سازی شده:

```javascript
// ساختار داده موجودی در نسخه ۸.۰
const inv = {
  'WH_RAW': {           // انبار مواد اولیه
    'ITEM_001': {       // کد کالا
      'BATCH-2026-01': { // شماره بچ
        qty: 100,
        catchWeight: 98.5,
        wac: 50000,
        val: 5000000,
        expiryDate: 1735689600000, // Timestamp
        name: 'شیر خام',
        unit: 'لیتر'
      },
      'BATCH-2026-02': { ... }
    }
  },
  'WH_PROD': { ... }    // انبار محصول نهایی
};
```

### ۱.۲ ثابت‌های پیکربندی (CONFIG)

```javascript
const CONFIG = {
  VERSION: "Enterprise-8.0",
  TOLERANCE: 1e-6,        // آستانه خطای محاسبات اعشاری
  ROUND_QTY: 4,           // دقت گرد کردن مقادیر
  ROUND_MONEY: 2,         // دقت گرد کردن مبالغ
  MAX_BOM_DEPTH: 50,      // حداکثر عمق بازگشتی BOM
  SHEETS: { ... },        // نام تمام شیت‌های سیستم
  TXN_ORDER: { ... },     // ترتیب پردازش تراکنش‌ها
  ITEM_TYPES: { ... }     // انواع کالا (RAW, PACKAGED, PRODUCT)
};
```

**ترتیب پردازش تراکنش‌ها (TXN_ORDER):**
این ترتیب حیاتی است زیرا در یک روز واحد، ابتدا موجودی اولیه بارگذاری می‌شود، سپس خریدها، سپس مصرف تولید، سپس تولید محصول، سپس انبارگردانی، سپس ضایعات و در نهایت فروش. این ترتیب منطبق بر استانداردهای حسابداری صنعتی است.

---

## 📅 بخش ۲: سیستم تاریخ جلالی

### ۲.۱ چرا تبدیل تاریخ ضروری است؟

Google Sheets فقط با تاریخ میلادی کار می‌کند. اما کاربر ایرانی تاریخ جلالی وارد می‌کند. بنابراین:
1. کاربر تاریخ جلالی (مثلاً `1405/03/15`) را وارد می‌کند
2. تابع `onEdit` به صورت خودکار آن را به میلادی تبدیل کرده و در ستون `date` ذخیره می‌کند
3. موتور محاسباتی با تاریخ میلادی کار می‌کند
4. در گزارش‌ها، تاریخ دوباره به جلالی تبدیل شده و نمایش داده می‌شود

### ۲.۲ الگوریتم تبدیل (gregorianToJalali)

این تابع از الگوریتم استاندارد JDF (Jalali Date Function) استفاده می‌کند:

```javascript
function gregorianToJalali(gy, gm, gd) {
  // مرحله ۱: محاسبه تعداد روزهای سپری شده از مبدأ
  // مرحله ۲: تقسیم بر دوره‌های ۱۲۰۵۳ روزه (۳۳ ساله)
  // مرحله ۳: تقسیم بر دوره‌های ۱۴۶۱ روزه (۴ ساله)
  // مرحله ۴: محاسبه سال، ماه و روز باقی‌مانده
  // مرحله ۵: تشخیص ۶ ماه اول (۳۱ روزه) یا ۶ ماه دوم (۳۰ روزه)
}
```

### ۲.۳ تابع onEdit (تبدیل خودکار)

```javascript
function onEdit(e) {
  // وقتی کاربر در ستون jalaliDate یا expiryDate چیزی تایپ می‌کند:
  if (col - 1 === jalaliColIdx || col - 1 === expiryColIdx) {
    const gregorianDate = convertJalaliToGregorian(jalaliInput);
    if (gregorianDate) {
      // تبدیل به Date object میلادی و ذخیره
      sheet.getRange(row, dateColIdx + 1).setValue(gregorianDate);
    }
  }
}
```

---

## 🏭 بخش ۳: سیستم BOM و بسته‌بندی

### ۳.۱ مفهوم BOM (Bill of Materials)

BOM یا "فرمول ساخت"، لیست مواد اولیه مورد نیاز برای تولید یک محصول است. مثلاً برای تولید ۱۰۰ عدد "ماست ۵۰۰ گرمی":
- ۵۰ لیتر شیر
- ۱۰۰ عدد ظرف پلاستیکی
- ۱۰۰ عدد درب
- ۱۰۰ عدد برچسب

### ۳.۲ تابع buildFlatBOM (بسط BOM چندسطحی)

اگر یک محصول از محصولات نیمه‌ساخته تشکیل شده باشد، BOM به صورت بازگشتی بسط داده می‌شود:

```javascript
function buildFlatBOM(recipes, itemsMap, convGraph, errorLog) {
  const resolve = (code, mult, res, path, depth) => {
    // اگر کالا ماده اولیه است (BOM ندارد)، مستقیماً اضافه شود
    if (!ings.length) { 
      res[code] = (res[code] || 0) + mult; 
      return true; 
    }
    
    // اگر کالا محصول نیمه‌ساخته است، BOM آن باز شود
    for (let ing of ings) {
      // تبدیل واحد (مثلاً کیلوگرم به گرم)
      const conv = getConversion(convGraph, ing.unit, tUnit);
      
      // اعمال ضریب بازده (yield)
      const yF = (parseNumber(ing.yield) > 0) ? (parseNumber(ing.yield)/100) : 1;
      const eQty = (parseNumber(ing.qty) * conv.factor * mult) / yF;
      
      // بازگشت بازگشتی برای بسط بیشتر
      if (!resolve(iCode, eQty, res, [...path, code], depth + 1)) return false;
    }
  };
}
```

### ۳.۳ تولید خودکار BOM بسته‌بندی

برای کالاهای بسته‌بندی شده (مثل "ماست ۵۰۰ گرمی" که از "ماست فله" + "ظرف" تشکیل شده)، سیستم به صورت خودکار BOM تولید می‌کند:

```javascript
function generatePackagingBOMInternal(itemsData, itemsMap, convGraph, errorLog) {
  // پیدا کردن کالاهایی که itemType = PACKAGED هستند
  const packagedItems = itemsData.filter(item => 
    item.itemType === 'PACKAGED' && item.parentItem && item.packageSize
  );
  
  packagedItems.forEach(pkgItem => {
    // محاسبه مقدار مورد نیاز از کالای والد
    let qtyNeeded = packageSize;
    
    // تبدیل واحد در صورت نیاز
    if (pkgUnit !== parentUnit) {
      const conv = getConversion(convGraph, pkgUnit, parentUnit);
      qtyNeeded = packageSize * conv.factor;
    }
    
    // اضافه کردن به شیت RECIPES
    newRecipes.push([menuCode, parentCode, qtyNeeded, parentUnit, 100]);
  });
}
```

---

## 📥 بخش ۴: بارگذاری و پردازش داده‌ها

### ۴.۱ تابع getSheetSafe (بارگذاری ایمن شیت‌ها)

این تابع داده‌های یک شیت را می‌خواند و به آرایه‌ای از اشیاء تبدیل می‌کند:

```javascript
function getSheetSafe(ss, name, headers, pKey) {
  // ۱. خواندن تمام مقادیر شیت
  const vals = sh.getDataRange().getValues();
  
  // ۲. نرمال‌سازی نام هدرها (حذف فاصله، خط تیره و...)
  const norm = h => String(h||'').replace(/\s+/g,'').toLowerCase();
  
  // ۳. پیدا کردن ایندکس هر ستون
  const cIdx = headers.map(h => headRow.indexOf(norm(h)));
  
  // ۴. تبدیل هر ردیف به یک شیء
  return vals.slice(1).map((r, i) => {
    const obj = { _sourceRow: i + 2, _sheetName: name };
    headers.forEach((h, j) => {
      let v = r[cIdx[j]];
      
      // استخراج کد از فرمت "نام | کد"
      if (h === 'itemCode' && typeof v === 'string') {
        const match = v.match(/\|\s*([^\|]+)$/);
        if (match) v = match[1].trim();
      }
      
      obj[h] = v;
    });
    
    // تبدیل مقادیر عددی
    ['qty', 'totalCost', 'catchWeight'].forEach(k => {
      if (obj[k] !== undefined) obj[k] = parseNumber(obj[k]);
    });
    
    return obj;
  });
}
```

### ۴.۲ تابع parseNumber (پردازش هوشمند اعداد)

این تابع اعداد فارسی/عربی، اعداد با جداکننده هزارگان و فرمت‌های مختلف را به عدد استاندارد تبدیل می‌کند:

```javascript
function parseNumber(v) {
  let str = String(v);
  
  // اگر فرمت "نام | کد" است، کد را استخراج کن
  const match = str.match(/\|\s*([^\|]+)$/);
  if (match) str = match[1].trim();
  
  // حذف جداکننده‌های هزارگان فارسی و عربی
  str = str.replace(/[٬،\s\u00A0]/g, '');
  
  // تبدیل ممیز فارسی به انگلیسی
  str = str.replace(/٫/g, '.');
  
  // حذف تمام کاراکترهای غیر عددی
  str = str.replace(/[^\d.\-]/g, '');
  
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}
```

---

## 🔧 بخش ۵: Ledger Builder (ساخت دفتر کل یکپارچه)

### ۵.۱ مفهوم Ledger

دفتر کل (Ledger) یک آرایه مرتب شده از تمام تراکنش‌های سیستم است. هر تراکنش شامل:
- `date`: تاریخ میلادی
- `type`: نوع تراکنش (PURCHASE, SALE, PRODUCTION_ADD, ...)
- `itemCode`: کد کالا
- `qty`: مقدار (به واحد پایه)
- `batchNumber`: شماره بچ
- `warehouseCode`: کد انبار
- `expiryDate`: تاریخ انقضا
- `catchWeight`: وزن متغیر

### ۵.۲ تابع buildUnifiedLedger

این تابع تمام تراکنش‌ها را از شیت‌های مختلف خوانده و در یک آرایه واحد ادغام می‌کند:

```javascript
function buildUnifiedLedger(data, cachedBOM, itemsMap, convGraph, errorLog) {
  const ledger = [];
  
  // ۱. بارگذاری موجودی اولیه
  data.OPENING.forEach(o => {
    ledger.push({ 
      date: 0, type: 'OPENING', 
      itemCode: o.itemCode, qty: o.qty, wac: o.wac, val: o.val,
      batchNumber: o.batchNumber || 'OPENING_BATCH',
      warehouseCode: o.warehouseCode || 'DEFAULT_WH',
      expiryDate: o.expiryDate
    });
  });
  
  // ۲. بارگذاری خریدها
  data.PURCHASES.forEach(p => {
    const b = validate(p, 'PURCHASE');
    b.qty = convertToBase(b, p.unit); // تبدیل به واحد پایه
    ledger.push({ ...b, totalCost: p.totalCost });
  });
  
  // ۳. بارگذاری تولید (شامل مصرف مواد و تولید محصول)
  data.PRODUCTION.forEach(pr => {
    const b = validate(pr, 'PRODUCTION_ADD');
    b.productionId = 'PROD_' + prodCounter;
    
    // ثبت تولید محصول
    ledger.push(b);
    
    // ثبت مصرف مواد اولیه بر اساس BOM
    const comps = cachedBOM[b.itemCode];
    if (comps) {
      for (let i in comps) {
        ledger.push({ 
          type: 'PRODUCTION_CONSUME', 
          itemCode: i, 
          qty: comps[i] * b.qty, // مقدار مصرفی = مقدار در BOM × تعداد تولید
          batchNumber: 'AUTO', // از بچ‌های موجود به صورت خودکار کسر شود
          warehouseCode: b.warehouseCode
        });
      }
    }
  });
  
  // ۴. مرتب‌سازی بر اساس تاریخ و نوع تراکنش
  return ledger.sort((a, b) => 
    (a.date - b.date) || 
    (CONFIG.TXN_ORDER[a.type] - CONFIG.TXN_ORDER[b.type]) || 
    (a._row - b._row)
  );
}
```

### ۵.۳ تابع convertToBase (تبدیل واحد)

این تابع مقدار یک تراکنش را به واحد پایه کالا تبدیل می‌کند:

```javascript
function convertToBase(txn, originalUnit) {
  const itemBaseUnit = itemsMap[txn.itemCode].baseUnit;
  
  // اگر واحد یکی است، نیازی به تبدیل نیست
  if (originalUnit === itemBaseUnit) return txn.qty;
  
  // جستجوی مسیر تبدیل در گراف تبدیل‌ها
  const conv = getConversion(convGraph, originalUnit, itemBaseUnit);
  
  if (conv) {
    return txn.qty * conv.factor;
  } else {
    errorLog.push(`تبدیل ${originalUnit} به ${itemBaseUnit} یافت نشد`);
    return txn.qty; // بدون تبدیل
  }
}
```

### ۵.۴ گراف تبدیل واحدها (buildConversionGraph)

این تابع یک گراف جهت‌دار از تبدیل‌های واحد می‌سازد:

```javascript
function buildConversionGraph(rows) {
  const g = {};
  rows.forEach(r => {
    const from = r.fromUnit.toLowerCase();
    const to = r.toUnit.toLowerCase();
    const factor = r.factor; // مثلاً 1 کیلوگرم = 1000 گرم
    
    if(!g[from]) g[from] = {};
    if(!g[to]) g[to] = {};
    
    g[from][to] = factor;      // کیلوگرم → گرم
    g[to][from] = 1/factor;    // گرم → کیلوگرم
  });
  return g;
}
```

### ۵.۵ الگوریتم BFS برای یافتن مسیر تبدیل

اگر تبدیل مستقیم وجود نداشته باشد، سیستم از الگوریتم BFS برای یافتن مسیر غیرمستقیم استفاده می‌کند:

```javascript
function getConversion(g, from, to) {
  if (from === to) return { factor: 1 };
  
  const q = [[from, 1]]; // صف: [واحد فعلی, ضریب تجمعی]
  const vis = new Set(); // واحدهای بازدید شده
  
  while (q.length > 0) {
    const [c, f] = q.shift();
    
    if (c === to) return { factor: f }; // مسیر یافت شد
    
    vis.add(c);
    
    for (const nb in g[c]) {
      if (!vis.has(nb)) {
        q.push([nb, f * g[c][nb]]); // ضریب تجمعی را به‌روزرسانی کن
      }
    }
  }
  
  return null; // مسیری یافت نشد
}
```

**مثال:** اگر بخواهیم "جعبه" را به "گرم" تبدیل کنیم و تبدیل مستقیم نداشته باشیم:
- جعبه → کیلوگرم (ضریب ۱۰)
- کیلوگرم → گرم (ضریب ۱۰۰۰)
- ضریب نهایی: ۱۰ × ۱۰۰۰ = ۱۰۰۰۰

---

## ⚙️ بخش ۶: موتور WAC و FEFO (قلب نسخه ۸.۰)

### ۶.۱ مفهوم WAC (Weighted Average Cost)

میانگین موزون قیمت، روشی برای محاسبه بهای تمام شده موجودی است:

```
WAC = ارزش کل موجودی / تعداد کل موجودی
```

هر بار که خرید جدیدی انجام می‌شود، WAC به‌روزرسانی می‌شود:

```javascript
if (txn.type === 'PURCHASE') {
  e.qty += txn.qty; 
  e.val += txn.totalCost;
  if (e.qty > CONFIG.TOLERANCE) {
    e.wac = e.val / e.qty; // به‌روزرسانی WAC
  }
}
```

### ۶.۲ الگوریتم FEFO (First Expired, First Out)

این الگوریتم حیاتی‌ترین بخش نسخه ۸.۰ است. وقتی کالایی فروخته می‌شود یا مصرف می‌شود، سیستم باید تصمیم بگیرد از کدام بچ کسر موجودی انجام دهد.

```javascript
function processLedgerAndAudit(ledger, itemsMap, convGraph, suspenseLog, errorLog) {
  aggregatedLedger.forEach(txn => {
    if (txn.type === 'SALE' || txn.type === 'PRODUCTION_CONSUME' || txn.type === 'WASTE') {
      let remainingQty = txn.qty;
      
      // دریافت تمام بچ‌های موجود برای این کالا در این انبار
      let batches = Object.keys(inv[wh]?.[item] || {})
        .map(b => ({ id: b, data: inv[wh][item][b] }));
      
      // اگر بچ خاصی مشخص شده باشد، فقط از همان بچ کسر شود
      if (batch && batch !== 'AUTO') {
        batches = batches.filter(b => b.id === batch);
      } else {
        // الگوریتم FEFO: مرتب‌سازی بر اساس تاریخ انقضا
        batches.sort((a, b) => {
          if (!a.data.expiryDate && !b.data.expiryDate) return 0;
          if (!a.data.expiryDate) return 1;  // بدون انقضا → آخر لیست
          if (!b.data.expiryDate) return -1;
          return a.data.expiryDate - b.data.expiryDate; // قدیمی‌تر → اول لیست
        });
      }
      
      // کسر مقدار از بچ‌ها به ترتیب
      for (let b of batches) {
        if (remainingQty <= CONFIG.TOLERANCE) break;
        
        let e = b.data;
        let consumeQty = Math.min(e.qty, remainingQty);
        let cost = consumeQty * e.wac;
        
        e.qty -= consumeQty;
        e.val -= cost;
        remainingQty -= consumeQty;
        
        // ثبت در COGS یا هزینه تولید
        if (isTargetDate) {
          if (txn.type === 'SALE') daily_cogs += cost;
          else if (txn.type === 'WASTE') daily_wasteVal += cost;
          else daily_prodCost += cost;
        }
      }
      
      // اگر موجودی کافی نبود، ثبت در حساب تعلیقی
      if (remainingQty > CONFIG.TOLERANCE) {
        checkSuspense({qty: 0}, {qty: remainingQty}, suspenseLog, txn);
      }
    }
  });
}
```

### ۶.۳ مدیریت Catch Weight (وزن متغیر)

برای کالاهایی که هم با تعداد و هم با وزن سنجیده می‌شوند (مثل پنیر، گوشت، میوه):

```javascript
// هنگام خرید: ثبت همزمان تعداد و وزن
if (txn.type === 'PURCHASE') {
  e.qty += txn.qty; 
  if(txn.catchWeight) e.catchWeight += txn.catchWeight;
  e.val += txn.totalCost;
}

// هنگام فروش: کسر تناسبی وزن
let consumeCatchWeight = 0;
if (e.catchWeight > 0 && e.qty > 0) {
  let ratio = consumeQty / e.qty;
  consumeCatchWeight = e.catchWeight * ratio;
}
e.catchWeight -= consumeCatchWeight;
```

**مثال عملی:**
- خرید: ۴۰ بسته پنیر با وزن واقعی ۱۹.۸ کیلوگرم
- فروش: ۱۰ بسته
- وزن کسر شده: (۱۰/۴۰) × ۱۹.۸ = ۴.۹۵ کیلوگرم
- وزن باقی‌مانده: ۱۹.۸ - ۴.۹۵ = ۱۴.۸۵ کیلوگرم

### ۶.۴ انبارگردانی (STOCK_ADJUST)

هنگام انبارگردانی، تفاوت بین موجودی سیستمی و موجودی واقعی محاسبه می‌شود:

```javascript
if (txn.type === 'STOCK_ADJUST') {
  const currentQty = e.qty;
  const countedQty = txn.countedQty;
  const variance = countedQty - currentQty;
  
  if (variance > CONFIG.TOLERANCE) {
    // کسری مثبت: افزایش موجودی
    e.qty += variance;
    e.val += variance * e.wac;
    if (e.qty > CONFIG.TOLERANCE) e.wac = e.val / e.qty;
  } else if (variance < -CONFIG.TOLERANCE) {
    // کسری منفی: کاهش موجودی (ثبت در حساب تعلیقی)
    const absVariance = Math.abs(variance);
    const cost = absVariance * e.wac;
    e.qty -= absVariance; 
    e.val -= cost;
    checkSuspense(e, {qty: absVariance, type: 'STOCK_SHORTAGE'}, suspenseLog, txn);
  }
}
```

---

## 📊 بخش ۷: سیستم گزارش‌گیری

### ۷.۱ گزارش موجودی سه‌بعدی

شیت `INVENTORY_FINAL` اکنون به صورت سه‌بعدی گزارش می‌دهد:

```javascript
function flushReports(ss, inv, metrics, suspenseLog, errorLog, itemsMap) {
  const rows = [];
  
  // حلقه سه‌گانه: انبار → کالا → بچ
  for (let wh in inv) {
    for (let item in inv[wh]) {
      for (let batch in inv[wh][item]) {
        let e = inv[wh][item][batch];
        
        // رد کردن بچ‌های صفر
        if (Math.abs(e.qty) < CONFIG.TOLERANCE && Math.abs(e.val) < CONFIG.TOLERANCE) continue;
        
        let expiryStr = e.expiryDate ? formatDateJalali(new Date(e.expiryDate)) : 'بدون انقضا';
        
        rows.push([
          wh,                    // انبار
          item,                  // کد کالا
          e.name,                // نام کالا
          batch,                 // شماره بچ
          expiryStr,             // تاریخ انقضا
          e.unit,                // واحد
          e.qty,                 // موجودی
          e.catchWeight,         // وزن متغیر
          e.wac,                 // میانگین موزون قیمت
          e.val                  // ارزش دفتری
        ]);
      }
    }
  }
  
  rSh.getRange(2, 1, rows.length, h.length).setValues(rows);
}
```

### ۷.۲ داشبورد روزانه

شیت `DAILY_DASHBOARD` شاخص‌های کلیدی روز را نمایش می‌دهد:

```javascript
const metrics = { 
  targetDate: formatDateJalali(new Date(maxTime)),
  purchases: daily_purchases,     // مجموع خرید روز
  estCogs: daily_cogs,            // بهای تمام شده کالای فروش رفته
  prodCost: daily_prodCost,       // هزینه تولید روز
  wasteVal: daily_wasteVal        // ارزش ضایعات روز
};
```

### ۷.۳ حساب تعلیقی (Suspense Account)

وقتی موجودی کافی نباشد (مثلاً فروش بیشتر از موجودی)، تراکنش در حساب تعلیقی ثبت می‌شود:

```javascript
function checkSuspense(entry, txn, suspenseLog, originalTxn) {
  let deficit = txn.qty;
  
  suspenseLog.push([
    jalaliDate,           // تاریخ جلالی
    originalTxn.itemCode, // کد کالا
    deficit,              // مقدار کسری
    txn.type,             // نوع عملیات (SALE, PRODUCTION_CONSUME, ...)
    'ردیف ' + sourceRow   // ردیف منبع در شیت ورودی
  ]);
}
```

---

## 🎨 بخش ۸: رابط کاربری و اعتبارسنجی

### ۸.۱ لیست کشویی (Data Validation)

تابع `setupDataValidation` لیست کشویی برای تمام ستون‌های کد کالا ایجاد می‌کند:

```javascript
function setupDataValidation() {
  // ایجاد ستون کمکی displayName در فرمت "نام | کد"
  for (let i = 2; i <= lastRow; i++) {
    const code = itemsSh.getRange(i, 1).getValue();
    const name = itemsSh.getRange(i, 2).getValue();
    itemsSh.getRange(i, displayNameCol + 1).setValue(`${name} | ${code}`);
  }
  
  // ایجاد قانون اعتبارسنجی
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(displayRange, true)
    .setAllowInvalid(false)
    .build();
  
  // اعمال روی تمام ستون‌های مرتبط
  targets.forEach(t => {
    const sh = ss.getSheetByName(t.sheet);
    const colIdx = headers.indexOf(t.col);
    sh.getRange(2, colIdx + 1, maxRows - 1, 1).setDataValidation(rule);
  });
}
```

### ۸.۲ تابع onEdit (تبدیل خودکار تاریخ)

این تابع هر بار که کاربر تاریخی را در ستون `jalaliDate` یا `expiryDate` وارد می‌کند، به صورت خودکار آن را به میلادی تبدیل می‌کند:

```javascript
function onEdit(e) {
  if (col - 1 === jalaliColIdx || col - 1 === expiryColIdx) {
    const jalaliInput = String(e.value).trim();
    const gregorianDate = convertJalaliToGregorian(jalaliInput);
    
    if (gregorianDate) {
      sheet.getRange(row, dateColIdx + 1).setValue(gregorianDate);
      sheet.getRange(row, dateColIdx + 1).setNumberFormat('yyyy/mm/dd');
    } else {
      SpreadsheetApp.getActive().toast(`فرمت تاریخ نامعتبر: ${jalaliInput}`);
    }
  }
}
```

---

## 🔄 بخش ۹: گردش کار کامل سیستم

### ۹.۱ سناریوی عملیاتی کامل

**مرحله ۱: راه‌اندازی اولیه**
```
1. اجرای setupEnvironment() → ایجاد تمام شیت‌ها
2. تعریف کالاها در ITEMS
3. تعریف واحدها و تبدیل‌ها در CONVERSIONS
4. تعریف فرمول‌های ساخت در RECIPES
5. اجرای updateBOMCache() → ساخت کش BOM
6. اجرای setupDataValidation() → ایجاد لیست‌های کشویی
```

**مرحله ۲: عملیات روزانه**
```
1. ثبت موجودی اولیه در OPENING_BALANCES (فقط یک بار)
2. ثبت خریدها در PURCHASES (با شماره بچ و تاریخ انقضا)
3. ثبت دستورات تولید در PRODUCTION
4. ثبت فروش‌ها در SALES (سیستم به صورت خودکار FEFO اعمال می‌کند)
5. ثبت ضایعات در WASTE
6. ثبت انبارگردانی در STOCK_TAKE
```

**مرحله ۳: پردازش و گزارش‌گیری**
```
1. اجرای runFinancialEngine()
2. سیستم تمام تراکنش‌ها را به ترتیب تاریخ پردازش می‌کند
3. WAC به‌روزرسانی می‌شود
4. FEFO اعمال می‌شود
5. گزارش‌ها در INVENTORY_FINAL و DAILY_DASHBOARD تولید می‌شوند
```

### ۹.۲ مثال عملی: تولید و فروش ماست

**داده‌های ورودی:**

ITEMS:
```
itemCode | itemName    | baseUnit | itemType  | packageSize | parentItem
ITEM_001 | شیر خام     | لیتر     | RAW       |             |
ITEM_002 | ماست فله    | کیلوگرم  | PRODUCT   |             |
ITEM_003 | ماست ۵۰۰ گرمی | بسته   | PACKAGED  | 500         | ITEM_002
```

CONVERSIONS:
```
fromUnit | toUnit   | factor
کیلوگرم  | گرم      | 1000
```

RECIPES:
```
menuCode | ingCode  | qty | unit    | yield
ITEM_002 | ITEM_001 | 10  | لیتر    | 95
```

PURCHASES:
```
date       | itemCode | qty | unit  | totalCost | batchNumber | expiryDate | warehouseCode
1405/03/01 | ITEM_001 | 1000| لیتر  | 5000000   | BATCH-001   | 1405/06/01 | WH_RAW
```

PRODUCTION:
```
date       | menuCode | qtyProduced | batchNumber | expiryDate | warehouseCode
1405/03/02 | ITEM_002 | 90          | PROD-001    | 1405/03/12 | WH_PROD
1405/03/02 | ITEM_003 | 180         | PROD-002    | 1405/03/12 | WH_PROD
```

SALES:
```
date       | itemCode | qty | batchNumber | warehouseCode
1405/03/03 | ITEM_003 | 50  |             | WH_PROD
```

**پردازش سیستم:**

۱. **خرید شیر:**
   - موجودی WH_RAW/ITEM_001/BATCH-001: 1000 لیتر
   - WAC: 5000 تومان/لیتر

۲. **تولید ماست فله:**
   - مصرف: 10 × 90 = 900 لیتر شیر از BATCH-001
   - موجودی شیر باقی‌مانده: 100 لیتر
   - تولید: 90 کیلوگرم ماست فله (با بازده 95%)
   - هزینه تولید: 900 × 5000 = 4,500,000 تومان
   - WAC ماست فله: 4,500,000 / 90 = 50,000 تومان/کیلوگرم

۳. **تولید ماست بسته‌بندی:**
   - BOM خودکار: ITEM_003 → ITEM_002 (500 گرم = 0.5 کیلوگرم)
   - مصرف: 0.5 × 180 = 90 کیلوگرم ماست فله
   - موجودی ماست فله باقی‌مانده: 0 کیلوگرم
   - تولید: 180 بسته ماست ۵۰۰ گرمی
   - هزینه تولید: 90 × 50,000 = 4,500,000 تومان
   - WAC ماست بسته‌بندی: 4,500,000 / 180 = 25,000 تومان/بسته

۴. **فروش 50 بسته ماست:**
   - سیستم FEFO اعمال می‌شود (فقط یک بچ وجود دارد: PROD-002)
   - کسر: 50 بسته از PROD-002
   - COGS: 50 × 25,000 = 1,250,000 تومان
   - موجودی باقی‌مانده: 130 بسته

**گزارش نهایی INVENTORY_FINAL:**
```
انبار    | کد کالا  | نام کالا       | شماره بچ | تاریخ انقضا | موجودی | وزن متغیر | WAC    | ارزش دفتری
WH_RAW   | ITEM_001 | شیر خام        | BATCH-001| 1405/06/01  | 100    | 0         | 5000   | 500000
WH_PROD  | ITEM_003 | ماست ۵۰۰ گرمی  | PROD-002 | 1405/03/12  | 130    | 0         | 25000  | 3250000
```

---

## 🛡️ بخش ۱۰: مدیریت خطا و حساب تعلیقی

### ۱۰.۱ انواع خطاهای سیستم

۱. **خطای تبدیل واحد:**
   ```
   [هشدار تبدیل] واحد 'جعبه' به 'گرم' برای ITEM_001 یافت نشد.
   ```

۲. **خطای BOM:**
   ```
   [BOM Error] تبدیل واحد 'لیتر' به 'کیلوگرم' برای ITEM_001 یافت نشد.
   ```

۳. **خطای تولید:**
   ```
   [هشدار تولید] فرمول ساخت برای ITEM_003 یافت نشد.
   ```

۴. **کسری موجودی (Suspense):**
   ```
   تاریخ: 1405/03/03
   کد کالا: ITEM_003
   کسری: 20 بسته
   نوع عملیات: SALE
   ردیف منبع: ردیف 5
   ```

### ۱۰.۲ تابع logCriticalError

اگر خطای بحرانی رخ دهد (مثلاً کش BOM خالی باشد):

```javascript
function logCriticalError(ss, e) {
  const es = getOrCreateSheet(ss, CONFIG.SHEETS.ERRORS);
  es.clear();
  es.getRange(1, 1).setValue('Critical Crash: ' + e.message);
  SpreadsheetApp.getUi().alert('❌ خطای پردازشی رخ داد. بخش ERRORS_LOG را بررسی کنید.');
}
```

---

## 🚀 بخش ۱۱: بهینه‌سازی‌ها و نکات فنی

### ۱۱.۱ بهینه‌سازی حافظه

- استفاده از `Set` برای جلوگیری از تکرار در BOM
- استفاده از `Map` به جای آرایه برای جستجوی O(1)
- حذف بچ‌های صفر از گزارش‌ها

### ۱۱.۲ مدیریت خطای گرد کردن

```javascript
const CONFIG = {
  TOLERANCE: 1e-6  // مقادیر کمتر از این آستانه، صفر در نظر گرفته می‌شوند
};

if (Math.abs(e.qty) < CONFIG.TOLERANCE) { 
  e.qty = 0; 
  e.val = 0; 
}
```

### ۱۱.۳ جلوگیری از حلقه بی‌نهایت در BOM

```javascript
const resolve = (code, mult, res, path, depth) => {
  if (depth > CONFIG.MAX_BOM_DEPTH || path.includes(code)) return false;
  // ...
};
```

### ۱۱.۴ تجمیع انبارگردانی

اگر در یک روز، چندین بار برای یک کالا انبارگردانی انجام شود، تمام مقادیر تجمیع می‌شوند:

```javascript
const stockAdjustMap = {};
ledger.forEach(txn => {
  if (txn.type === 'STOCK_ADJUST') {
    const key = txn.date + '|' + txn.warehouseCode + '|' + txn.itemCode + '|' + txn.batchNumber;
    if (!stockAdjustMap[key]) {
      stockAdjustMap[key] = { ...txn, countedQty: 0 };
    }
    stockAdjustMap[key].countedQty += txn.countedQty;
  }
});
```

---

## 📝 بخش ۱۲: خلاصه و نتیجه‌گیری

### ۱۲.۱ دستاوردهای نسخه ۸.۰

✅ **ردیابی بچ/لات:** هر محموله با شماره بچ منحصر به فرد پیگیری می‌شود  
✅ **مدیریت وزن متغیر:** ثبت همزمان تعداد و وزن واقعی  
✅ **چند انباره:** مدیریت موجودی به تفکیک انبارهای مختلف  
✅ **FEFO:** خروج خودکار بر اساس اولین انقضای نزدیک‌تر  
✅ **BOM خودکار:** تولید خودکار فرمول بسته‌بندی  
✅ **تاریخ جلالی:** پشتیبانی کامل از تقویم شمسی  
✅ **گزارش‌های سه‌بعدی:** موجودی به تفکیک انبار، کالا و بچ  

### ۱۲.۲ انطباق با استانداردهای جهانی

- **SAP MM (Materials Management):** پشتیبانی از Batch Management، Multi-Storage Location
- **SAP PP (Production Planning):** پشتیبانی از BOM، Production Orders
- **Oracle FMCG:** پشتیبانی از Catch Weight، FEFO، Expiry Date Tracking

### ۱۲.۳ کاربردهای صنعتی

- 🥛 **صنایع لبنی:** ردیابی بچ شیر، ماست، پنیر با تاریخ انقضای کوتاه
- 🍖 **صنایع گوشتی:** مدیریت وزن متغیر گوشت و مرغ
- 💊 **صنایع دارویی:** ردیابی دقیق بچ‌های دارویی با FEFO
- 🍞 **صنایع غذایی:** مدیریت محصولات با تاریخ انقضای کوتاه
- 🏭 **تولیدات صنعتی:** مدیریت چند انباره مواد اولیه و محصول

---

این مستند کامل‌ترین راهنمای فنی برای نسخه Enterprise 8.0 است. اگر سؤال خاصی درباره هر بخش دارید، بفرمایید تا توضیحات بیشتری ارائه دهم.