

npm install -g @google/clasp

clasp login


clasp clone "1T-RSq0ucYLUNDLMNZHuERZvSDdFKmJKUpO3tv-COOpxbsP8bPEXXc9XP"


clasp push


این فایل `README.md` به گونه‌ای طراحی شده است که هم برای **توسعه‌دهندگان انسانی** و هم برای **مدل‌های زبانی بزرگ (LLMs)** کاملاً قابل درک، ساختاریافته و غنی از کلمات کلیدی معماری نرم‌افزار باشد. این فایل به عنوان "سند مرجع" (Single Source of Truth) برای هر هوش مصنوعی یا برنامه‌نویسی که قرار است روی این پروژه کار کند، عمل می‌کند.

---

# 💎 ERP Financial & Inventory Engine (GAS-Based) - v7.2

## 📋 Executive Summary
این پروژه یک موتور محاسباتی مالی و انبارداری سازمانی (Enterprise-grade) است که بر بستر **Google Apps Script (GAS)** و **Google Sheets** پیاده‌سازی شده است. این سیستم با شبیه‌سازی منطق سیستم‌های ERP بزرگ (مانند SAP و Odoo)، قابلیت‌هایی مانند **محاسبه میانگین موزون هزینه (WAC)**، **انفجار چندلایه فرمول ساخت (Multi-level BOM Explosion)**، **برگشت به عقب تولید (Backflushing)** و **حسابداری تعلیقی (Suspense Accounting)** را در محیط محدود اسکریپت‌نویسی گوگل ارائه می‌دهد.

رابط کاربری سیستم به صورت یک **Web App** مستقل و واکنش‌گرا (Responsive) طراحی شده تا ورود داده بدون نیاز به دسترسی مستقیم به شیت‌ها و با کمترین خطای انسانی انجام شود.

---

## 🏗 System Architecture & Design Patterns

برای درک مدل‌های هوش مصنوعی از معماری این سیستم، الگوهای زیر پیاده‌سازی شده‌اند:

1. **Batch Processing Orchestrator:** به جای پردازش رویداد-محور (Event-Driven) که در GAS ناپایدار است، سیستم از الگوی Batch Processing استفاده می‌کند. تمام تراکنش‌ها در یک `Unified Ledger` جمع‌آوری، بر اساس زمان و اولویت مرتب‌سازی، و سپس در یک پاس (Pass) پردازش می‌شوند.
2. **Caching Strategy (BOM Flattening):** برای جلوگیری از محاسبات بازگشتی (Recursive) سنگین در هر بار اجرا، فرمول‌های ساخت (BOM) یک‌بار به صورت Flat (تخت) محاسبه و در شیت `BOM_CACHE` ذخیره می‌شوند. پیچیدگی زمانی پردازش تولید از $O(N^2)$ به $O(1)$ کاهش می‌یابد.
3. **Soft-Stop / Suspense Accounting:** در صورت بروز کسری موجودی (Negative Inventory)، سیستم Crash نمی‌کند (Hard-Stop). بلکه تراکنش را با استفاده از آخرین WAC معتبر پردازش کرده و کسری را در شیت `SUSPENSE_ACCOUNT` برای بررسی حسابرسی ثبت می‌کند.
4. **Cost Inheritance (Production Logic):** هزینه مواد اولیه مصرف‌شده در هر دستور تولید، از طریق یک `productionId` یکتا ردیابی شده و دقیقاً به عنوان `val` (ارزش دفتری) به کالای ساخته‌شده تزریق می‌شود.
5. **Dynamic Schema Mapping:** توابع ورودی داده، به جای اتکا به ایندکس ثابت ستون‌ها، هدرهای شیت را می‌خوانند و داده را بر اساس نام ستون نگاشت می‌کنند (مقاوم در برابر جابجایی ستون‌ها).

---

## 🔄 Execution Flow (The Ledger Logic)

موتور اصلی (`processLedgerAndAudit`) تراکنش‌ها را دقیقاً به این ترتیب اولویت‌بندی و پردازش می‌کند (`CONFIG.TXN_ORDER`):

1. `OPENING` (موجودی و ارزش اولیه دوره)
2. `PURCHASE` (افزایش موجودی + به‌روزرسانی WAC)
3. `PRODUCTION_CONSUME` (کسر مواد اولیه بر اساس BOM Cache + محاسبه هزینه مصرفی)
4. `PRODUCTION_ADD` (افزودن کالای ساخته‌شده + تزریق هزینه مصرفی محاسبه‌شده در مرحله قبل به عنوان ارزش کالا)
5. `STOCK_ADJUST` (تعدیلات انبارگردانی: مثبت یا منفی)
6. `WASTE` (کسر ضایعات بر اساس WAC جاری)
7. `SALE` (کسر کالای فروش‌رفته و محاسبه COGS بر اساس WAC جاری)

> **نکته معماری:** قرارگیری `PRODUCTION_CONSUME` قبل از `PRODUCTION_ADD` حیاتی است تا سیستم بتواند هزینه دقیق مواد را قبل از ارزش‌گذاری محصول نهایی محاسبه کند.

---

## 🗄️ Data Model (Google Sheets Schema)

سیستم از شیت‌های زیر به عنوان پایگاه داده رابطه‌ای (Relational Database) استفاده می‌کند:

### ورودی‌ها (Input Tables)
| Sheet Name | Primary Key / Core Columns | Description |
| :--- | :--- | :--- |
| `ITEMS` | `itemCode`, `itemName`, `baseUnit` | دیکشنری مرکزی تمام کالاها و مواد. |
| `RECIPES` | `menuCode`, `ingCode`, `qty`, `unit`, `yield` | فرمول ساخت (BOM). `yield` درصد ضایعات حین تولید است. |
| `CONVERSIONS` | `fromUnit`, `toUnit`, `factor` | گراف تبدیل واحدها (مثلاً کیلوگرم به گرم). |
| `PURCHASES` | `date`, `itemCode`, `qty`, `totalCost` | رسیدهای خرید. |
| `PRODUCTION`| `date`, `menuCode`, `qtyProduced` | دستورات تولید (فقط کالای نهایی و تعداد). |
| `SALES` | `date`, `itemCode`, `qty` | فاکتورهای فروش. |
| `WASTE` | `date`, `itemCode`, `qty` | ثبت ضایعات. |
| `STOCK_TAKE`| `date`, `itemCode`, `qty` | تعدیلات انبار (مثبت برای کشفیات، منفی برای کسری). |
| `OPENING_BALANCES`| `itemCode`, `qty`, `wac`, `val` | اسنپ‌شات موجودی و ارزش پایان دوره قبل. |

### خروجی‌ها و سیستمی (System & Output Tables)
| Sheet Name | Description |
| :--- | :--- |
| `BOM_CACHE` | فرمول‌های تخت‌شده (Flattened) برای سرعت پردازش. |
| `INVENTORY_FINAL` | گزارش نهایی موجودی، WAC و ارزش دفتری هر کالا. |
| `DAILY_DASHBOARD` | خلاصه مالی روز هدف (خرید، COGS، هزینه تولید، ضایعات). |
| `SUSPENSE_ACCOUNT` | لاگ تراکنش‌هایی که باعث کسری موقت موجودی شده‌اند. |
| `ERRORS_LOG` | لاگ خطاهای بحرانی، حلقه‌های بی‌نهایت BOM یا تبدیل واحد نامعتبر. |

---

## 🚀 Installation & Deployment Guide

برای راه‌اندازی سیستم توسط یک توسعه‌دهنده یا مدل AI، مراحل زیر باید به ترتیب اجرا شوند:

1. **ایجاد محیط:** یک Google Sheet جدید باز کنید و به `Extensions > Apps Script` بروید.
2. **جایگذاری کد:** تمام کدهای `.gs` (شامل `CONFIG`, `runFinancialEngine`, `doGet`, و غیره) را در فایل `Code.gs` قرار دهید.
3. **ایجاد فایل HTML:** یک فایل HTML جدید با نام دقیق `DataEntryForm` بسازید و کدهای HTML/CSS/JS ارائه‌شده را در آن قرار دهید.
4. **اجرای اولیه:** تابع `setupEnvironment()` را از نوار ابزار اجرا کنید تا تمام ۱۴ شیت با هدرهای استاندارد ایجاد شوند.
5. **ورود داده‌های پایه:** شیت‌های `ITEMS`, `CONVERSIONS`, و `RECIPES` را پر کنید.
6. **ساخت کش:** از منوی سیستم، گزینه `⚙️ به‌روزرسانی کش فرمول ساخت (BOM)` را اجرا کنید.
7. **استقرار وب‌اپ:** 
   - روی دکمه **Deploy** > **New deployment** کلیک کنید.
   - Type را **Web app** انتخاب کنید.
   - Execute as: **Me** (حیاتی برای دسترسی به شیت).
   - Who has access: **Anyone with Google account** (یا Anyone).
   - لینک تولید شده را به کاربران نهایی بدهید.

---

## ⚠️ Constraints & Edge Cases (For AI Reasoning)

اگر به عنوان یک مدل AI قرار است این کد را توسعه دهید، این محدودیت‌های ذاتی GAS را در نظر بگیرید:

1. **Execution Time Limit:** اسکریپت‌های GAS حداکثر ۶ دقیقه زمان اجرا دارند. الگوریتم `buildUnifiedLedger` و `processLedgerAndAudit` برای پردازش تا ~۵۰,۰۰۰ ردیف بهینه شده‌اند. برای حجم بالاتر، نیاز به پیاده‌سازی Chunking (تقسیم پردازش) است.
2. **No ACID Transactions:** گوگل شیت از تراکنش‌های دیتابیسی پشتیبانی نمی‌کند. اگر اسکریپت در میانه راه قطع شود، داده‌ها ممکن است نیمه‌کاره بمانند. راه‌حل فعلی: اجرای کامل فرآیند به صورت یکجا و عدم ویرایش دستی شیت‌های خروجی.
3. **Floating Point Errors:** اعداد اعشاری در جاوااسکریپت ممکن است خطاهای ریز ایجاد کنند. سیستم با استفاده از `CONFIG.TOLERANCE = 1e-6` و توابع `toFixed` این خطاها را مدیریت می‌کند. هرگز از `=== 0` برای مقایسه موجودی استفاده نکنید.
4. **Circular BOM Reference:** تابع `buildFlatBOM` دارای مکانیزم `path.includes(code)` و `MAX_BOM_DEPTH` است تا از حلقه‌های بی‌نهایت (مثلاً کالای A که جزو مواد B است و برعکس) جلوگیری کند.

---

## 🛠 Core Function Reference (API)

| Function Name | Purpose | Input / Output |
| :--- | :--- | :--- |
| `doGet(e)` | Entry point for the Web App UI. | Returns `HtmlOutput`. |
| `runFinancialEngine()` | Main orchestrator. Triggers the full ETL and WAC calculation. | Void (Updates Sheets). |
| `updateBOMCache()` | Resolves recursive BOMs into a flat structure for performance. | Void (Updates `BOM_CACHE`). |
| `processFormData(data)`| Backend handler for Web App form submissions. | `Object` -> Appends row to target sheet. |
| `getUiConfig()` | Serves form schema and existing item lists to the frontend. | Returns `JSON` config object. |

---

## 📌 Notes for AI Agents
- هنگام تغییر کد، **همیشه** `CONFIG.TXN_ORDER` را بررسی کنید تا ترتیب پردازش تراکنش‌ها به هم نریزد.
- اگر فیلد جدیدی به فرم‌ها اضافه می‌کنید، حتماً آن را در آرایه `forms` داخل تابع `getUiConfig()` و همچنین در هدرهای تابع `setupEnvironment()` اضافه کنید.
- برای دیباگ کردن، همیشه ابتدا شیت `ERRORS_LOG` و سپس `SUSPENSE_ACCOUNT` را بررسی کنید.

---
*Generated for Enterprise Architecture Documentation. Version 7.2 Stable.*