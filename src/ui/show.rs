use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

use super::styles;
use crate::app::App;

pub fn draw_show(frame: &mut Frame, app: &mut App) {
    let size = frame.area();
    let can_split = size.width >= 160;

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // Header
            Constraint::Min(1),    // Content
            Constraint::Length(1), // Status bar
        ])
        .split(size);

    // Add 1 space left margin to content only
    let content_with_margin = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(1), Constraint::Min(1)])
        .split(chunks[1]);

    draw_header(frame, app, chunks[0], can_split);
    draw_content(frame, app, content_with_margin[1], can_split);
    draw_status_bar(frame, app, chunks[2], can_split);
}

fn draw_header(frame: &mut Frame, app: &App, area: Rect, can_split: bool) {
    let attribution = "SO \u{00b7} CC BY-SA";

    if app.erwin_pane_visible && can_split {
        let half_width = area.width / 2;
        let erwin_count = app.erwin_answer_count();

        let left_title = format!(" Question #{} ", app.current_question_id);
        let right_title = format!(
            " \u{25c6} Erwin's Answer {}/{} ",
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

        let left_padding = (half_width as usize).saturating_sub(left_title.len());
        let right_padding = (half_width as usize)
            .saturating_sub(right_title.len())
            .saturating_sub(attribution.len());

        let header = Line::from(vec![
            Span::styled(
                format!("{}{}", left_title, " ".repeat(left_padding)),
                left_style,
            ),
            Span::styled(
                format!(
                    "{}{}{}",
                    right_title,
                    " ".repeat(right_padding),
                    attribution
                ),
                right_style,
            ),
        ]);

        frame.render_widget(Paragraph::new(header), area);
    } else {
        let title = format!(" Question #{} ", app.current_question_id);
        let padding = (area.width as usize)
            .saturating_sub(title.len())
            .saturating_sub(attribution.len());

        let header = Line::from(vec![Span::styled(
            format!("{}{}{}", title, " ".repeat(padding), attribution),
            styles::header_style(),
        )]);

        frame.render_widget(Paragraph::new(header), area);
    }
}

fn draw_content(frame: &mut Frame, app: &mut App, area: Rect, can_split: bool) {
    if app.erwin_pane_visible && can_split {
        let chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .split(area);

        draw_question_pane(frame, app, chunks[0]);
        draw_erwin_pane(frame, app, chunks[1]);
    } else {
        draw_question_pane(frame, app, area);
    }
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
            .map(|link| (link.line_index, link.link_num))
    } else {
        None
    };

    let visible_lines: Vec<Line> = lines
        .iter()
        .enumerate()
        .skip(app.scroll_offset)
        .take(visible_rows)
        .map(|(idx, line)| {
            if let Some((line_idx, link_num)) = focused_link {
                if idx == line_idx {
                    return highlight_link_in_line(line, link_num);
                }
            }
            line.clone()
        })
        .collect();

    let content = Paragraph::new(visible_lines)
        .block(Block::default().borders(Borders::NONE))
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
            .map(|link| (link.line_index, link.link_num))
    } else {
        None
    };

    let visible_lines: Vec<Line> = lines
        .iter()
        .enumerate()
        .skip(app.erwin_scroll_offset)
        .take(visible_rows)
        .map(|(idx, line)| {
            if let Some((line_idx, link_num)) = focused_link {
                if idx == line_idx {
                    return highlight_link_in_line(line, link_num);
                }
            }
            line.clone()
        })
        .collect();

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

        frame.render_widget(Paragraph::new(status), area);
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

    let status = Line::from(vec![Span::styled(
        format!("{:<width$}", help, width = area.width as usize),
        styles::status_style(),
    )]);

    frame.render_widget(Paragraph::new(status), area);
}
