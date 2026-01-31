use ratatui::{
    Frame,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
};

use crate::app::App;
use super::styles;

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

    draw_header(frame, app, chunks[0], can_split);
    draw_content(frame, app, chunks[1], can_split);
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
            Style::default().bg(Color::Cyan).fg(Color::Black).add_modifier(Modifier::BOLD)
        } else {
            styles::header_style()
        };

        let right_style = if !app.left_pane_focused {
            Style::default().bg(Color::Yellow).fg(Color::Black).add_modifier(Modifier::BOLD)
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
                format!("{}{}{}", right_title, " ".repeat(right_padding), attribution),
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

    let visible_lines: Vec<Line> = lines
        .iter()
        .skip(app.scroll_offset)
        .take(visible_rows)
        .cloned()
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

    let visible_lines: Vec<Line> = lines
        .iter()
        .skip(app.erwin_scroll_offset)
        .take(visible_rows)
        .cloned()
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

fn draw_status_bar(frame: &mut Frame, app: &App, area: Rect, can_split: bool) {
    let erwin_count = app.erwin_answer_count();

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
