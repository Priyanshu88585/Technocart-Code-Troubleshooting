# Troubleshooting & Bug Fixes Report

This document details all the issues identified, their root causes, the fixes applied, and the test verifications completed for both the **Node.js Book Management** application and the **Python Handwriting Recognition (Scribe)** application in this repository.

---

## 1. Node.js Application (`nodejs/`)

### Bug 1: Book Update Parameter Mismatch (Critical)
- **File**: `nodejs/src/controllers/bookController.js`
- **Issue**: Updating book details via `PUT /api/books/:id` was failing validation with HTTP 400.
- **Root Cause**: `bookService.updateBook(...)` expects arguments in the order:
  `(id, title, author, isbn, category, publishedYear, price, quantity)`.
  However, `bookController.js` passed `body.price` before `body.published_year`. Because of this, the price was passed to `requiredYear()`, throwing an error (`"Published year is out of range"`).
- **Fix**: Reordered the parameters in `bookController.js` so `body.published_year` and `body.price` are passed in the correct positions:
```javascript
// Before
const book = bookService.updateBook(
  req.params.id,
  body.title,
  body.author,
  body.isbn,
  body.category,
  body.price,          // Inverted
  body.published_year, // Inverted
  body.quantity
);

// After
const book = bookService.updateBook(
  req.params.id,
  body.title,
  body.author,
  body.isbn,
  body.category,
  body.published_year,
  body.price,
  body.quantity
);
```

---

### Bug 2: Category Filter Inversion
- **File**: `nodejs/src/repositories/bookRepository.js`
- **Issue**: Selecting a category filter in the catalog returned all books *except* the selected category.
- **Root Cause**: SQL query condition was written as `category != ?` instead of `category = ?`.
- **Fix**: Changed the condition to equality matching:
```javascript
// Before
if (category) {
  conditions.push("category != ?");
  params.push(category);
}

// After
if (category) {
  conditions.push("category = ?");
  params.push(category);
}
```

---

### Bug 3: Stock Decrement Incrementing Stock
- **File**: `nodejs/src/services/stockService.js`
- **Issue**: Clicking the decrement (`-`) button in the UI increased the book stock quantity instead of reducing it.
- **Root Cause**: An erroneous conditional check checked `if (delta < 0)` and added `Math.abs(delta)` to `book.quantity`.
- **Fix**: Removed the conditional so `next = book.quantity + delta` correctly applies negative deltas:
```javascript
// Before
let next = book.quantity + delta;
if (delta < 0) {
  next = book.quantity + Math.abs(delta);
}

// After
let next = book.quantity + delta;
```

---

### Bug 4: Under-counting Available Copies on Dashboard
- **File**: `nodejs/src/repositories/statsRepository.js`
- **Issue**: The dashboard metric "Copies in stock" excluded books with exactly 1 copy.
- **Root Cause**: The SQL statement used `SUM(CASE WHEN quantity > 1 THEN quantity ELSE 0 END)` instead of `quantity > 0`.
- **Fix**: Updated condition to count all copies where `quantity > 0`:
```javascript
// Before
COALESCE(SUM(CASE WHEN quantity > 1 THEN quantity ELSE 0 END), 0) AS available_copies

// After
COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS available_copies
```

---

### Bug 5: Route Shadowing for Book Search
- **File**: `nodejs/src/routes/books.js`
- **Issue**: Calling `/api/books/search?q=...` returned `404 Not Found` with `{ "error": "Book not found" }`.
- **Root Cause**: The parameterized route `router.get("/:id", ...)` was registered before `router.get("/search", ...)`. Express matched `"search"` as the `:id` parameter and queried the database for a book with ID `"search"`.
- **Fix**: Moved `router.get("/search", ...)` before `router.get("/:id", ...)`.
```javascript
// Before
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.get("/search", controller.search);

// After
router.get("/", controller.list);
router.get("/search", controller.search);
router.get("/:id", controller.getById);
```

---

### Bug 6: Stale Search Input in Frontend
- **File**: `nodejs/frontend/js/app.js`
- **Issue**: Live search in the frontend catalog lagged behind input keystrokes.
- **Root Cause**: The input event listener read from `pendingQuery` before updating it with the latest input value.
- **Fix**: Passed `searchInput.value.trim()` directly to `loadBooks()`:
```javascript
// Before
searchInput.addEventListener("input", () => {
  const query = pendingQuery;
  pendingQuery = searchInput.value.trim();
  loadBooks(query);
});

// After
searchInput.addEventListener("input", () => {
  loadBooks(searchInput.value.trim());
});
```

---

### Bug 7: Test Coverage & Regression Prevention
- **File**: `nodejs/tests/books.test.js`
- Added comprehensive unit tests covering:
  - Category filtering (`GET /api/books?category=Science`)
  - Stock decrement (`PATCH /api/books/:id/stock` with `adjustment: -1`)
  - Dedicated search route (`GET /api/books/search?q=Dune`)
  - Book updates (`PUT /api/books/:id`)
- **Result**: **16 / 16 tests passing**.

---

## 2. Python Handwriting Recognition Application (`python/`)

### Bug 1: File Truncation on Result Read (Critical)
- **File**: `python/app/utils/files.py`
- **Issue**: Downloading recognized text files (`GET /api/results/{result_id}/download`) downloaded a completely empty (0 bytes) text file.
- **Root Cause**: `read_result()` opened files with mode `"w+"`. In Python, `"w+"` truncates existing files immediately upon opening before performing any read.
- **Fix**: Changed the file open mode to `"r"`:
```python
# Before
with path.open("w+", encoding="utf-8") as handle:
    return handle.read()

# After
with path.open("r", encoding="utf-8") as handle:
    return handle.read()
```

---

### Bug 2: Inverted Parameter Order in `prepare_for_ocr`
- **File**: `python/app/recognition/ocr.py`
- **Issue**: OCR received unprocessed images instead of preprocessed binary images.
- **Root Cause**: `pipeline.py` called `prepare_for_ocr(preprocessed, resized)`, but `ocr.py` declared `def prepare_for_ocr(original, preprocessed): return preprocessed`. Due to positional argument ordering, `original` received `preprocessed`, and `preprocessed` received `resized`, returning the raw resized image instead of the thresholded image.
- **Fix**: Synchronized signature in `ocr.py`:
```python
# Before
def prepare_for_ocr(original, preprocessed):
    return preprocessed

# After
def prepare_for_ocr(preprocessed, original):
    return preprocessed
```

---

### Bug 3: Image Aspect Ratio Distortion
- **File**: `python/app/preprocessing/image_ops.py`
- **Issue**: Non-standard image dimensions were squashed or stretched forcefully to `800x600`, deforming handwriting shapes and reducing OCR accuracy.
- **Root Cause**: `resize_image` directly resized to `(max_width, max_height)` without aspect ratio preservation.
- **Fix**: Added uniform aspect ratio scaling:
```python
# Before
def resize_image(image, max_width=800, max_height=600):
    height, width = image.shape[:2]
    if width == max_width and height == max_height:
        return image
    return cv2.resize(image, (max_width, max_height))

# After
def resize_image(image, max_width=800, max_height=600):
    height, width = image.shape[:2]
    if width <= max_width and height <= max_height:
        return image
    scale = min(max_width / width, max_height / height)
    new_width = max(1, int(width * scale))
    new_height = max(1, int(height * scale))
    return cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
```

---

### Bug 4: Cross-Platform Tesseract Executable Detection
- **File**: `python/app/recognition/ocr.py`
- **Issue**: The application only targeted Windows default executable path (`C:\Program Files\Tesseract-OCR\tesseract.exe`) and failed on macOS and Linux systems.
- **Root Cause**: No automatic fallback or PATH inspection for `tesseract`.
- **Fix**: Added detection via standard macOS Homebrew/Linux paths and `shutil.which("tesseract")`:
```python
# Before
def configure_tesseract():
    command = os.environ.get("TESSERACT_CMD")
    if command:
        pytesseract.pytesseract.tesseract_cmd = command
        return
    default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(default):
        pytesseract.pytesseract.tesseract_cmd = default

# After
def configure_tesseract():
    command = os.environ.get("TESSERACT_CMD")
    if command:
        pytesseract.pytesseract.tesseract_cmd = command
        return
    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            return
    found = shutil.which("tesseract")
    if found:
        pytesseract.pytesseract.tesseract_cmd = found
```

---

### Bug 5: Test Suite Verification
- **File**: `python/tests/test_recognize.py`
- Added `test_download_and_processed_result` verifying both text file download endpoint and processed PNG preview response.
- **Result**: **9 / 9 tests passing**.

---

## 3. Summary of Test Execution

| Project | Test Framework | Test Count | Result |
| :--- | :--- | :--- | :--- |
| **Node.js** | Jest (`npm test`) | 16 tests | **16 Passed, 0 Failed** |
| **Python** | Pytest (`pytest -v`) | 9 tests | **9 Passed, 0 Failed** |
