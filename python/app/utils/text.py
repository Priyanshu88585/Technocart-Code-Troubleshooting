def format_recognized_text(text):
    if text is None:
        return ""
    lines = [line.strip() for line in str(text).splitlines()]
    return " ".join(line for line in lines if line)
