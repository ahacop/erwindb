use once_cell::sync::Lazy;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use syntect::easy::HighlightLines;
use syntect::highlighting::{Style as SyntectStyle, ThemeSet};
use syntect::parsing::SyntaxSet;

static SYNTAX_SET: Lazy<SyntaxSet> = Lazy::new(SyntaxSet::load_defaults_newlines);
static THEME_SET: Lazy<ThemeSet> = Lazy::new(ThemeSet::load_defaults);

pub fn highlight_code(code: &str, lang: Option<&str>) -> Vec<Line<'static>> {
    let syntax = lang
        .and_then(|l| SYNTAX_SET.find_syntax_by_token(l))
        .or_else(|| SYNTAX_SET.find_syntax_by_token("sql"))
        .unwrap_or_else(|| SYNTAX_SET.find_syntax_plain_text());

    let theme = &THEME_SET.themes["base16-ocean.dark"];
    let mut highlighter = HighlightLines::new(syntax, theme);

    code.lines()
        .map(|line| {
            let ranges = highlighter
                .highlight_line(line, &SYNTAX_SET)
                .unwrap_or_default();

            let spans: Vec<Span<'static>> = ranges
                .into_iter()
                .map(|(style, text)| {
                    Span::styled(text.to_string(), syntect_to_ratatui_style(style))
                })
                .collect();

            Line::from(spans)
        })
        .collect()
}

fn syntect_to_ratatui_style(style: SyntectStyle) -> Style {
    let fg = Color::Rgb(style.foreground.r, style.foreground.g, style.foreground.b);
    Style::default().fg(fg)
}

pub fn detect_language(code: &str) -> Option<&'static str> {
    let code_lower = code.to_lowercase();

    // SQL patterns
    if code_lower.contains("select ")
        || code_lower.contains("insert ")
        || code_lower.contains("update ")
        || code_lower.contains("delete ")
        || code_lower.contains("create table")
        || code_lower.contains("alter table")
        || code_lower.contains(" from ")
        || code_lower.contains(" where ")
        || code_lower.contains(" join ")
    {
        return Some("sql");
    }

    // JavaScript/TypeScript
    if code.contains("const ")
        || code.contains("let ")
        || code.contains("function ")
        || code.contains("=>")
    {
        return Some("javascript");
    }

    // Python
    if code.contains("def ")
        || code.contains("import ")
        || code.contains("class ") && code.contains(":")
    {
        return Some("python");
    }

    // Bash/Shell
    if code.starts_with("#!/") || code.contains("echo ") || code.contains("$(") {
        return Some("bash");
    }

    None
}
