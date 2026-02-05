use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};
use unicode_width::UnicodeWidthStr;

use super::styles;
use crate::app::App;
use crate::html::Link;

/// Minimum terminal width required for dual-pane (side-by-side) mode
pub const DUAL_PANE_MIN_WIDTH: u16 = 160;

pub fn draw_show(frame: &mut Frame, app: &mut App) {
    let size = frame.area();
    let can_split = size.width >= DUAL_PANE_MIN_WIDTH;

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // Header
            Constraint::Min(1),    // Content
            Constraint::Length(1), // Status bar
        ])
        .split(size);

    // Split position for dual-pane mode (simple half of screen width)
    let split_pos = size.width / 2;

    draw_header(frame, app, chunks[0], can_split, split_pos);
    draw_content(frame, app, chunks[1], can_split, split_pos);
    draw_status_bar(frame, app, chunks[2], can_split);
}

fn draw_header(frame: &mut Frame, app: &App, area: Rect, can_split: bool, split_pos: u16) {
    let attribution = "SO \u{00b7} CC BY-SA";

    if app.erwin_pane_visible && can_split {
        // Split header into two areas using Layout (matches content split)
        let header_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Length(split_pos),
                Constraint::Length(1),
                Constraint::Min(1),
            ])
            .split(area);

        let erwin_count = app.erwin_answer_count();

        let left_title = format!(" Question #{} ", app.current_question_id);
        let right_title = format!(
            "\u{25c6} Erwin's Answer {}/{} ",
            app.erwin_answer_index + 1,
            erwin_count
        );

        let left_style = if app.left_pane_focused {
            Style::default()
                .bg(Color::Cyan)
                .fg(Color::Black)
                .add_modifier(Modifier::BOLD)
        } else {
            styles::header_style()
        };

        let right_style = if !app.left_pane_focused {
            Style::default()
                .bg(Color::Yellow)
                .fg(Color::Black)
                .add_modifier(Modifier::BOLD)
        } else {
            styles::header_style()
        };

        // Render left header with background filling entire area
        let left_header = Paragraph::new(Line::from(left_title)).style(left_style);
        frame.render_widget(left_header, header_chunks[0]);

        // Render half-block transition character
        // ▐ (right half block): left half shows bg color, right half shows fg color
        let transition_style = Style::default()
            .fg(right_style.bg.unwrap_or(Color::Yellow))
            .bg(left_style.bg.unwrap_or(Color::Cyan));
        let transition = Paragraph::new(Line::from("\u{2590}")).style(transition_style);
        frame.render_widget(transition, header_chunks[1]);

        // Render right header with attribution at end
        let right_width = header_chunks[2].width as usize;
        let right_padding = right_width
            .saturating_sub(right_title.width())
            .saturating_sub(attribution.width());
        let right_header = Paragraph::new(Line::from(format!(
            "{}{}{}",
            right_title,
            " ".repeat(right_padding),
            attribution
        )))
        .style(right_style);
        frame.render_widget(right_header, header_chunks[2]);
    } else {
        let title = format!(" Question #{} ", app.current_question_id);
        let padding = (area.width as usize)
            .saturating_sub(title.width())
            .saturating_sub(attribution.width());

        let header = Paragraph::new(Line::from(format!(
            "{}{}{}",
            title,
            " ".repeat(padding),
            attribution
        )))
        .style(styles::header_style());

        frame.render_widget(header, area);
    }
}

fn draw_content(frame: &mut Frame, app: &mut App, area: Rect, can_split: bool, split_pos: u16) {
    if app.erwin_pane_visible && can_split {
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(split_pos), Constraint::Min(1)])
            .split(area);

        draw_question_pane(frame, app, chunks[0]);
        draw_erwin_pane(frame, app, chunks[1]);
    } else {
        draw_question_pane(frame, app, area);
    }
}

/// Build visible lines with link highlighting applied
fn build_visible_lines_with_highlights(
    lines: &[Line<'static>],
    scroll_offset: usize,
    visible_rows: usize,
    focused_link: Option<&Link>,
    hovered_link: Option<&Link>,
) -> Vec<Line<'static>> {
    let focused = focused_link.map(|link| (link.line_index, link.link_num));
    let hovered = hovered_link.map(|link| (link.line_index, link.link_num));

    lines
        .iter()
        .enumerate()
        .skip(scroll_offset)
        .take(visible_rows)
        .map(|(idx, line)| {
            // Focused takes priority over hovered
            if let Some((line_idx, link_num)) = focused {
                if idx == line_idx {
                    return highlight_link_in_line(line, link_num);
                }
            }
            if let Some((line_idx, link_num)) = hovered {
                if idx == line_idx {
                    return highlight_link_in_line(line, link_num);
                }
            }
            line.clone()
        })
        .collect()
}

fn draw_question_pane(frame: &mut Frame, app: &mut App, area: Rect) {
    let visible_rows = area.height as usize;
    let lines = &app.rendered_content;

    // Clamp scroll offset
    let max_scroll = lines.len().saturating_sub(visible_rows);
    app.scroll_offset = app.scroll_offset.min(max_scroll);

    // Get focused link info if in left pane
    let focused_link = if app.left_pane_focused || !app.erwin_pane_visible {
        app.focused_link_index
            .and_then(|idx| app.content_links.get(idx))
    } else {
        None
    };

    let hovered_link = app
        .hovered_link_index
        .and_then(|idx| app.content_links.get(idx));

    let visible_lines = build_visible_lines_with_highlights(
        lines,
        app.scroll_offset,
        visible_rows,
        focused_link,
        hovered_link,
    );

    let content = Paragraph::new(visible_lines)
        .block(
            Block::default()
                .borders(Borders::NONE)
                .padding(ratatui::widgets::Padding::left(1)),
        )
        .wrap(Wrap { trim: false });

    frame.render_widget(content, area);
}

fn draw_erwin_pane(frame: &mut Frame, app: &mut App, area: Rect) {
    let visible_rows = area.height as usize;
    let lines = &app.rendered_erwin_content;

    // Clamp scroll offset
    let max_scroll = lines.len().saturating_sub(visible_rows);
    app.erwin_scroll_offset = app.erwin_scroll_offset.min(max_scroll);

    // Get focused link info if in erwin pane
    let focused_link = if !app.left_pane_focused && app.erwin_pane_visible {
        app.focused_link_index
            .and_then(|idx| app.erwin_links.get(idx))
    } else {
        None
    };

    let hovered_link = app
        .hovered_erwin_link_index
        .and_then(|idx| app.erwin_links.get(idx));

    let visible_lines = build_visible_lines_with_highlights(
        lines,
        app.erwin_scroll_offset,
        visible_rows,
        focused_link,
        hovered_link,
    );

    let content = Paragraph::new(visible_lines)
        .block(
            Block::default()
                .borders(Borders::LEFT)
                .border_style(Style::default().fg(Color::Yellow)),
        )
        .wrap(Wrap { trim: false });

    frame.render_widget(content, area);
}

/// Highlight the specific link reference [text][n] in a line
fn highlight_link_in_line(line: &Line, link_num: usize) -> Line<'static> {
    let link_ref = format!("[{}]", link_num);
    let mut new_spans: Vec<Span<'static>> = Vec::new();
    let mut found_link_text = false;

    for span in &line.spans {
        let content = span.content.as_ref();

        // Check if this span ends with [ and next might be link text
        if content.starts_with('[') && content.ends_with(']') && !content.contains(&link_ref) {
            // This might be the [text] part - check if styled as link (cyan)
            if span.style.fg == Some(Color::Cyan) {
                // Mark that we found link text, highlight it
                new_spans.push(Span::styled(
                    content.to_string(),
                    Style::default().bg(Color::Cyan).fg(Color::Black),
                ));
                found_link_text = true;
                continue;
            }
        }

        // Check if this is the [n] reference number
        if content == link_ref {
            new_spans.push(Span::styled(
                content.to_string(),
                Style::default().bg(Color::Cyan).fg(Color::Black),
            ));
            found_link_text = false; // Reset for next link
            continue;
        }

        // If we just found link text and this is the matching [n], highlight it
        if found_link_text && content == link_ref {
            new_spans.push(Span::styled(
                content.to_string(),
                Style::default().bg(Color::Cyan).fg(Color::Black),
            ));
            found_link_text = false;
            continue;
        }

        // Keep span as-is
        new_spans.push(Span::styled(content.to_string(), span.style));
        if !content.starts_with('[') {
            found_link_text = false;
        }
    }

    Line::from(new_spans)
}

fn draw_status_bar(frame: &mut Frame, app: &App, area: Rect, can_split: bool) {
    let erwin_count = app.erwin_answer_count();

    // If a link is focused, show link info with URL
    if let Some(link) = app.get_focused_link() {
        let link_num = app.focused_link_index.map(|i| i + 1).unwrap_or(0);
        let total = if app.erwin_pane_visible && !app.left_pane_focused {
            app.erwin_links.len()
        } else {
            app.content_links.len()
        };

        let keys = " Tab o:open Esc ";
        let link_prefix = format!("[{}/{}] ", link_num, total);
        let url = &link.url;
        let available = (area.width as usize).saturating_sub(keys.len() + link_prefix.len() + 1);
        let truncated_url = if url.len() > available {
            format!("{}...", &url[..available.saturating_sub(3).min(url.len())])
        } else {
            url.clone()
        };
        let padding_len = (area.width as usize)
            .saturating_sub(keys.len() + link_prefix.len() + truncated_url.len());
        let padding = " ".repeat(padding_len);

        let status = Line::from(vec![
            Span::styled(keys, styles::status_style()),
            Span::styled(
                link_prefix,
                Style::default().bg(Color::DarkGray).fg(Color::White),
            ),
            Span::styled(
                format!("{}{}", truncated_url, padding),
                Style::default().bg(Color::DarkGray).fg(Color::Cyan),
            ),
        ]);

        frame.render_widget(Paragraph::new(status).style(styles::status_style()), area);
        return;
    }

    let help = if app.erwin_pane_visible && can_split {
        let focus_indicator = if app.left_pane_focused {
            "[Question]"
        } else {
            "[Erwin]"
        };
        format!(
            " j/k:scroll  e/E:Erwin  Tab:links  o:browser  b/q:back  {}",
            focus_indicator
        )
    } else if erwin_count > 0 {
        " j/k:scroll  e:Erwin  Tab:links  o:browser  b/q:back".to_string()
    } else {
        " j/k:scroll  Tab:links  o:browser  b/q:back".to_string()
    };

    let status = Line::from(vec![Span::styled(help, styles::status_style())]);

    frame.render_widget(Paragraph::new(status).style(styles::status_style()), area);
}
