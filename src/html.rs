use crate::highlight::highlight_code;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use regex::Regex;
use scraper::{Html, Selector};
use std::sync::LazyLock;

static PRE_SELECTOR: LazyLock<Selector> = LazyLock::new(|| Selector::parse("pre").unwrap());
static A_SELECTOR: LazyLock<Selector> = LazyLock::new(|| Selector::parse("a").unwrap());
static LANG_CLASS_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"lang-(\w+)").unwrap());
static SO_QUESTION_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"stackoverflow\.com/(?:questions|q)/(\d+)").unwrap());
static LINK_REF_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\[(\d+)\]").unwrap());

/// Extract language hint from a <pre> tag's class attribute (e.g., "lang-sql prettyprint-override")
fn extract_lang_from_class(class: Option<&str>) -> Option<String> {
    class
        .and_then(|c| LANG_CLASS_REGEX.captures(c))
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
        .filter(|l| l != "none") // lang-none means no highlighting
}

#[derive(Debug, Clone)]
pub struct Link {
    pub url: String,
    pub line_index: usize,
    pub link_num: usize, // The [n] reference number
    pub question_id: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ContentLine {
    pub line: Line<'static>,
}

#[derive(Debug, Clone)]
pub struct ParsedContent {
    pub lines: Vec<ContentLine>,
    pub links: Vec<Link>,
}

pub fn html_to_content(html: &str, width: usize) -> ParsedContent {
    let document = Html::parse_fragment(html);
    let mut lines = Vec::new();
    let mut all_links: Vec<Link> = Vec::new();

    // Extract links from <a> tags and build a mapping
    let mut link_map: Vec<(String, String)> = Vec::new(); // (text, url)
    let mut processed_html = html.to_string();

    for element in document.select(&A_SELECTOR) {
        if let Some(href) = element.value().attr("href") {
            let text = element.text().collect::<String>();
            if !text.is_empty() && !href.is_empty() {
                let link_idx = link_map.len() + 1;
                link_map.push((text.clone(), href.to_string()));
                // Replace <a> tag with [text][n] format
                let replacement = format!("[{}][{}]", text, link_idx);
                processed_html = processed_html.replace(&element.html(), &replacement);
            }
        }
    }

    // Extract code blocks with language hints from <pre> tags
    let mut code_blocks: Vec<(String, Option<String>)> = Vec::new();
    let code_doc = Html::parse_fragment(&processed_html);

    for element in code_doc.select(&PRE_SELECTOR) {
        let code = element.text().collect::<String>();
        let lang = extract_lang_from_class(element.value().attr("class"));
        let placeholder = format!("__CODE_BLOCK_{}__", code_blocks.len());
        code_blocks.push((code, lang));
        processed_html = processed_html.replace(&element.html(), &placeholder);
    }

    // Convert HTML to plain text using html2text
    let text = html2text::from_read(processed_html.as_bytes(), width).unwrap_or_default();

    // Process each line, tracking where inline link references appear
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
                    });
                }
            }
        } else {
            // Check if this line contains link references and track them
            let line_index = lines.len();
            for cap in LINK_REF_REGEX.captures_iter(line) {
                if let Some(num_match) = cap.get(2) {
                    if let Ok(link_num) = num_match.as_str().parse::<usize>() {
                        if link_num > 0 && link_num <= link_map.len() {
                            let (_, url) = &link_map[link_num - 1];
                            all_links.push(Link {
                                url: url.clone(),
                                line_index,
                                link_num,
                                question_id: extract_so_question_id(url),
                            });
                        }
                    }
                }
            }

            // Parse line for link references and style them
            let styled_line = style_link_references(line, &link_map);
            lines.push(ContentLine { line: styled_line });
        }
    }

    ParsedContent {
        lines,
        links: all_links,
    }
}

fn style_link_references(line: &str, link_map: &[(String, String)]) -> Line<'static> {
    let mut spans: Vec<Span<'static>> = Vec::new();
    let mut last_end = 0;

    for cap in LINK_REF_REGEX.captures_iter(line) {
        let full_match = cap.get(0).unwrap();
        let text = cap.get(1).unwrap().as_str();
        let num = cap.get(2).unwrap().as_str();

        // Add text before the match
        if full_match.start() > last_end {
            spans.push(Span::raw(line[last_end..full_match.start()].to_string()));
        }

        // Check if this is a valid link number
        if let Ok(idx) = num.parse::<usize>() {
            if idx > 0 && idx <= link_map.len() {
                // Style the link text
                spans.push(Span::styled(
                    format!("[{}]", text),
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::UNDERLINED),
                ));
                // Style the reference number
                spans.push(Span::styled(
                    format!("[{}]", num),
                    Style::default().fg(Color::DarkGray),
                ));
            } else {
                spans.push(Span::raw(full_match.as_str().to_string()));
            }
        } else {
            spans.push(Span::raw(full_match.as_str().to_string()));
        }

        last_end = full_match.end();
    }

    // Add remaining text
    if last_end < line.len() {
        spans.push(Span::raw(line[last_end..].to_string()));
    }

    if spans.is_empty() {
        Line::from(line.to_string())
    } else {
        Line::from(spans)
    }
}

fn parse_code_placeholder(line: &str) -> Option<usize> {
    if line.starts_with("__CODE_BLOCK_") && line.ends_with("__") {
        let inner = &line[13..line.len() - 2];
        inner.parse().ok()
    } else {
        None
    }
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

/// Strip HTML tags from text (for comments and other inline content)
pub fn strip_html_tags(html: &str) -> String {
    // Use html2text with a large width to avoid wrapping
    html2text::from_read(html.as_bytes(), 10000)
        .unwrap_or_default()
        .lines()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn extract_so_question_id(url: &str) -> Option<i64> {
    SO_QUESTION_REGEX
        .captures(url)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

pub fn is_erwin(author_name: &str) -> bool {
    author_name.to_lowercase().contains("erwin")
}
