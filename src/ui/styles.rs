use ratatui::style::{Color, Modifier, Style};

pub const HEADER_BG: Color = Color::Blue;
pub const HEADER_FG: Color = Color::White;
pub const STATUS_BG: Color = Color::DarkGray;
pub const STATUS_FG: Color = Color::Black;

pub const SELECTED_BG: Color = Color::Cyan;
pub const SELECTED_FG: Color = Color::Black;

pub const ERWIN_ACCENT: Color = Color::Yellow;
pub const ERWIN_BG: Color = Color::Yellow;
pub const ERWIN_FG: Color = Color::Black;

pub const TITLE_FG: Color = Color::Yellow;
#[allow(dead_code)]
pub const LINK_FG: Color = Color::Cyan;
#[allow(dead_code)]
pub const CODE_BG: Color = Color::Rgb(40, 44, 52);

#[allow(dead_code)]
pub const POSITIVE_SCORE: Color = Color::Green;
#[allow(dead_code)]
pub const ACCEPTED_ANSWER: Color = Color::Green;
pub const COMMENT_FG: Color = Color::Gray;
pub const SEPARATOR_FG: Color = Color::DarkGray;

pub fn header_style() -> Style {
    Style::default()
        .bg(HEADER_BG)
        .fg(HEADER_FG)
        .add_modifier(Modifier::BOLD)
}

pub fn search_title_style() -> Style {
    Style::default()
        .bg(Color::Yellow)
        .fg(Color::Black)
        .add_modifier(Modifier::BOLD)
}

pub fn search_semantic_style() -> Style {
    Style::default()
        .bg(Color::Magenta)
        .fg(Color::White)
        .add_modifier(Modifier::BOLD)
}

pub fn status_style() -> Style {
    Style::default().bg(STATUS_BG).fg(STATUS_FG)
}

pub fn selected_style() -> Style {
    Style::default()
        .bg(SELECTED_BG)
        .fg(SELECTED_FG)
        .add_modifier(Modifier::BOLD)
}

pub fn erwin_header_style() -> Style {
    Style::default()
        .bg(ERWIN_BG)
        .fg(ERWIN_FG)
        .add_modifier(Modifier::BOLD)
}

pub fn erwin_accent_style() -> Style {
    Style::default().fg(ERWIN_ACCENT)
}

pub fn erwin_text_style() -> Style {
    Style::default().fg(Color::White)
}

pub fn title_style() -> Style {
    Style::default().fg(TITLE_FG).add_modifier(Modifier::BOLD)
}

#[allow(dead_code)]
pub fn link_style() -> Style {
    Style::default()
        .fg(LINK_FG)
        .add_modifier(Modifier::UNDERLINED)
}

#[allow(dead_code)]
pub fn focused_link_style() -> Style {
    Style::default()
        .bg(LINK_FG)
        .fg(Color::Black)
        .add_modifier(Modifier::BOLD)
}

pub fn answer_header_style() -> Style {
    Style::default()
        .fg(Color::Green)
        .add_modifier(Modifier::BOLD)
}

pub fn question_header_style() -> Style {
    Style::default()
        .fg(Color::Magenta)
        .add_modifier(Modifier::BOLD)
}

pub fn separator_style() -> Style {
    Style::default().fg(SEPARATOR_FG)
}

pub fn comment_style() -> Style {
    Style::default().fg(COMMENT_FG).add_modifier(Modifier::BOLD)
}

#[allow(dead_code)]
pub fn dim_style() -> Style {
    Style::default().fg(Color::DarkGray)
}
