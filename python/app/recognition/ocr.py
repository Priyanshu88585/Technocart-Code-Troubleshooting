import os
import shutil

import pytesseract


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


def tesseract_config():
    return "--oem 3 --psm 7"


def prepare_for_ocr(preprocessed, original):
    return preprocessed


def extract_text(image, config):
    configure_tesseract()
    return pytesseract.image_to_string(image, lang="eng", config=config)
