use crate::highlight::highlight_code;
use ratatui::text::{Line, Span};
use regex::Regex;
use scraper::{Html, Selector};
use std::sync::LazyLock;

static PRE_SELECTOR: LazyLock<Selector> = LazyLock::new(|| Selector::parse("pre").unwrap());
static LANG_CLASS_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"lang-(\w+)").unwrap());
#[allow(dead_code)]
static SO_QUESTION_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"stackoverflow\.com/(?:questions|q)/(\d+)").unwrap());

/// Extract language hint from a <pre> tag's class attribute (e.g., "lang-sql prettyprint-override")
fn extract_lang_from_class(class: Option<&str>) -> Option<String> {
    class
        .and_then(|c| LANG_CLASS_REGEX.captures(c))
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
        .filter(|l| l != "none") // lang-none means no highlighting
}

#[derive(Debug, Clone)]
pub struct ContentLine {
    pub line: Line<'static>,
    #[allow(dead_code)]
    pub link_url: Option<String>,
    #[allow(dead_code)]
    pub link_question_id: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ParsedContent {
    pub lines: Vec<ContentLine>,
}

pub fn html_to_content(html: &str, width: usize) -> ParsedContent {
    let document = Html::parse_fragment(html);
    let mut lines = Vec::new();

    // Extract code blocks with language hints from <pre> tags
    let mut code_blocks: Vec<(String, Option<String>)> = Vec::new();
    let mut processed_html = html.to_string();

    for element in document.select(&PRE_SELECTOR) {
        let code = element.text().collect::<String>();
        let lang = extract_lang_from_class(element.value().attr("class"));
        let placeholder = format!("__CODE_BLOCK_{}__", code_blocks.len());
        code_blocks.push((code, lang));
        processed_html = processed_html.replace(&element.html(), &placeholder);
    }

    // Convert HTML to plain text
    let text = simple_html_to_text(&processed_html);

    // Process each line
    for line in text.lines() {
        // Check for code block placeholder
        if let Some(code_idx) = parse_code_placeholder(line) {
            if code_idx < code_blocks.len() {
                let (code, lang) = &code_blocks[code_idx];
                let highlighted = highlight_code(code, lang.as_deref());

                for code_line in highlighted {
                    let mut indented_spans = vec![Span::raw("    ".to_string())];
                    for span in code_line.spans {
                        indented_spans.push(Span::styled(span.content.to_string(), span.style));
                    }
                    lines.push(ContentLine {
                        line: Line::from(indented_spans),
                        link_url: None,
                        link_question_id: None,
                    });
                }
            }
        } else {
            // Regular text line - wrap to width
            let wrapped = wrap_text(line, width);
            for wrapped_line in wrapped {
                lines.push(ContentLine {
                    line: Line::from(wrapped_line),
                    link_url: None,
                    link_question_id: None,
                });
            }
        }
    }

    ParsedContent { lines }
}

fn parse_code_placeholder(line: &str) -> Option<usize> {
    if line.starts_with("__CODE_BLOCK_") && line.ends_with("__") {
        let inner = &line[13..line.len() - 2];
        inner.parse().ok()
    } else {
        None
    }
}

fn simple_html_to_text(html: &str) -> String {
    // Simple HTML to text conversion
    let mut text = html.to_string();

    // Replace common block elements with newlines
    text = Regex::new(r"<br\s*/?>")
        .unwrap()
        .replace_all(&text, "\n")
        .to_string();
    text = Regex::new(r"</p>")
        .unwrap()
        .replace_all(&text, "\n\n")
        .to_string();
    text = Regex::new(r"</div>")
        .unwrap()
        .replace_all(&text, "\n")
        .to_string();
    text = Regex::new(r"</h[1-6]>")
        .unwrap()
        .replace_all(&text, "\n\n")
        .to_string();
    text = Regex::new(r"<li[^>]*>")
        .unwrap()
        .replace_all(&text, "\n  - ")
        .to_string();
    text = Regex::new(r"</li>")
        .unwrap()
        .replace_all(&text, "")
        .to_string();

    // Remove all remaining HTML tags
    text = Regex::new(r"<[^>]+>")
        .unwrap()
        .replace_all(&text, "")
        .to_string();

    // Decode HTML entities
    text = decode_html_entities(&text);

    // Normalize whitespace but preserve paragraph breaks
    let lines: Vec<&str> = text.lines().collect();
    let mut result = Vec::new();
    let mut prev_empty = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !prev_empty {
                result.push("");
                prev_empty = true;
            }
        } else {
            result.push(trimmed);
            prev_empty = false;
        }
    }

    result.join("\n")
}

fn wrap_text(text: &str, width: usize) -> Vec<String> {
    if text.is_empty() {
        return vec![String::new()];
    }

    let mut lines = Vec::new();
    let mut current_line = String::new();
    let mut current_width = 0;

    for word in text.split_whitespace() {
        let word_width = unicode_width::UnicodeWidthStr::width(word);

        if current_width + word_width + 1 > width && !current_line.is_empty() {
            lines.push(current_line);
            current_line = String::new();
            current_width = 0;
        }

        if !current_line.is_empty() {
            current_line.push(' ');
            current_width += 1;
        }

        current_line.push_str(word);
        current_width += word_width;
    }

    if !current_line.is_empty() {
        lines.push(current_line);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}

pub fn decode_html_entities(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
}

#[allow(dead_code)]
pub fn extract_so_question_id(url: &str) -> Option<i64> {
    SO_QUESTION_REGEX
        .captures(url)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

pub fn is_erwin(author_name: &str) -> bool {
    author_name.to_lowercase().contains("erwin")
}
