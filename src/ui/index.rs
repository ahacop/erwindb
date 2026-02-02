use chrono::{TimeZone, Utc};
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

use super::styles;
use crate::app::{App, SearchMode, SortColumn, SortDirection};

pub fn draw_index(frame: &mut Frame, app: &App) {
    let size = frame.area();

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // Header
            Constraint::Length(1), // Column headers
            Constraint::Min(1),    // Content
            Constraint::Length(1), // Status bar
        ])
        .split(size);

    draw_header(frame, app, chunks[0]);
    draw_column_headers(frame, app, chunks[1]);
    draw_question_list(frame, app, chunks[2]);
    draw_status_bar(frame, app, chunks[3]);

    // Draw semantic search modal on top if active
    if app.search_mode == SearchMode::Semantic {
        draw_semantic_modal(frame, app, size);
    }
}

fn draw_header(frame: &mut Frame, app: &App, area: Rect) {
    let (style, text) = match app.search_mode {
        SearchMode::Title => (
            styles::search_title_style(),
            format!(" /{}\u{2588}", app.search_input),
        ),
        // Semantic search uses a modal, so show normal header
        SearchMode::Semantic | SearchMode::None => {
            let count_text = if let Some(ref matches) = app.fuzzy_matches {
                format!(
                    " ErwinDB ({}/{} matching \"{}\") ",
                    matches.len(),
                    app.questions.len(),
                    app.search_input
                )
            } else if app.semantic_loading {
                " Searching... ".to_string()
            } else if app.semantic_results.is_some() {
                format!(
                    " ErwinDB ({} semantic results) ",
                    app.semantic_results.as_ref().map(|r| r.len()).unwrap_or(0)
                )
            } else {
                format!(" ErwinDB ({} questions) ", app.questions.len())
            };
            (styles::header_style(), count_text)
        }
    };

    let header = Paragraph::new(Line::from(vec![Span::styled(
        format!("{:<width$}", text, width = area.width as usize),
        style,
    )]));
    frame.render_widget(header, area);
}

fn draw_semantic_modal(frame: &mut Frame, app: &App, area: Rect) {
    // Modal dimensions: border + input + hint + border = 4 lines minimum
    let modal_width = 60.min(area.width.saturating_sub(4));
    let modal_height = 5;

    // Center the modal
    let x = (area.width.saturating_sub(modal_width)) / 2;
    let y = (area.height.saturating_sub(modal_height)) / 2;

    let modal_area = Rect::new(x, y, modal_width, modal_height);

    // Clear the area behind the modal
    frame.render_widget(Clear, modal_area);

    // Draw modal border
    let block = Block::default()
        .title(" Semantic Search ")
        .title_style(
            Style::default()
                .fg(Color::Magenta)
                .add_modifier(Modifier::BOLD),
        )
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Magenta));

    frame.render_widget(block, modal_area);

    // Input prompt and cursor (y+1 is first row inside border)
    let input_area = Rect::new(
        modal_area.x + 2,
        modal_area.y + 1,
        modal_area.width.saturating_sub(4),
        1,
    );

    let prompt = "> ";
    let cursor = "\u{2588}";
    let input_text = format!("{}{}{}", prompt, app.search_input, cursor);
    let input = Paragraph::new(Line::from(vec![Span::styled(
        input_text,
        Style::default().fg(Color::White),
    )]));

    frame.render_widget(input, input_area);

    // Hint text below input (y+2 = second row inside border)
    let hint_area = Rect::new(
        modal_area.x + 2,
        modal_area.y + 3,
        modal_area.width.saturating_sub(4),
        1,
    );

    let hint = Paragraph::new(Line::from(vec![Span::styled(
        "Enter to search · Esc to cancel",
        Style::default().fg(Color::DarkGray),
    )]));

    frame.render_widget(hint, hint_area);
}

fn draw_column_headers(frame: &mut Frame, app: &App, area: Rect) {
    let get_indicator = |col: SortColumn| -> &str {
        if app.sort_active && app.sort_column == col {
            match app.sort_direction {
                SortDirection::Asc => "\u{25b2}",
                SortDirection::Desc => "\u{25bc}",
            }
        } else {
            " "
        }
    };

    let headers = Line::from(vec![
        Span::styled("   ", Style::default().fg(Color::DarkGray)),
        Span::styled(
            format!("{:>7}{} ", "ID", get_indicator(SortColumn::Id)),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!("{:<12}{} ", "Date", get_indicator(SortColumn::Date)),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!("{:>5}{} ", "Score", get_indicator(SortColumn::Score)),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!("{:>6}{} ", "Views", get_indicator(SortColumn::Views)),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!("{:>3}{} ", "A", get_indicator(SortColumn::Answers)),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "Title".to_string(),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        ),
    ]);

    frame.render_widget(Paragraph::new(headers), area);
}

fn draw_question_list(frame: &mut Frame, app: &App, area: Rect) {
    let sorted = app.get_sorted_questions();
    let visible_rows = area.height as usize;

    // Calculate scroll offset to keep selected item visible
    let scroll = if app.selected_index >= visible_rows {
        app.selected_index - visible_rows + 1
    } else {
        0
    };

    let fixed_width = 3 + 8 + 13 + 6 + 7 + 4 + 5; // selector + columns + spaces
    let title_width = (area.width as usize).saturating_sub(fixed_width);

    let lines: Vec<Line> = sorted
        .iter()
        .enumerate()
        .skip(scroll)
        .take(visible_rows)
        .map(|(idx, q)| {
            let is_selected = idx == app.selected_index;
            let selector = if is_selected { " > " } else { "   " };

            let id_str = format!("{:>8}", q.id);
            let date_str = format_date(q.creation_date);
            let score_str = format!("{:>6}", q.score);
            let views_str = format!("{:>7}", format_number(q.view_count));
            let answers_str = format!("{:>4}", q.answer_count);

            let title = if q.title.len() > title_width {
                format!(
                    "{}...",
                    &q.title[..title_width.saturating_sub(3).min(q.title.len())]
                )
            } else {
                q.title.clone()
            };

            let base_style = if is_selected {
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            let selector_style = if is_selected {
                styles::selected_style()
            } else {
                Style::default()
            };

            let id_style = if is_selected {
                Style::default().fg(Color::Cyan)
            } else {
                Style::default().fg(Color::DarkGray)
            };

            let dim_style = if is_selected {
                base_style
            } else {
                Style::default().fg(Color::DarkGray)
            };

            let score_style = if q.score > 0 {
                if is_selected {
                    base_style
                } else {
                    Style::default().fg(Color::Green)
                }
            } else if is_selected {
                base_style
            } else {
                Style::default().fg(Color::DarkGray)
            };

            let answers_style = if q.accepted_answer_id.is_some() {
                if is_selected {
                    base_style
                } else {
                    Style::default().fg(Color::Green)
                }
            } else if is_selected {
                base_style
            } else {
                Style::default().fg(Color::DarkGray)
            };

            // Build title with fuzzy highlighting if applicable
            let title_spans = if let Some(ref matches) = app.fuzzy_matches {
                if let Some(m) = matches
                    .iter()
                    .find(|m| app.questions[m.index].id == q.id)
                {
                    highlight_fuzzy_match(&title, &m.match_indices, base_style)
                } else {
                    vec![Span::styled(title.clone(), base_style)]
                }
            } else {
                vec![Span::styled(title.clone(), base_style)]
            };

            let mut spans = vec![
                Span::styled(selector.to_string(), selector_style),
                Span::styled(format!("{} ", id_str), id_style),
                Span::styled(format!("{} ", date_str), dim_style),
                Span::styled(format!("{} ", score_str), score_style),
                Span::styled(format!("{} ", views_str), dim_style),
                Span::styled(format!("{} ", answers_str), answers_style),
            ];
            spans.extend(title_spans);

            Line::from(spans)
        })
        .collect();

    let list = Paragraph::new(lines);
    frame.render_widget(list, area);
}

fn draw_status_bar(frame: &mut Frame, app: &App, area: Rect) {
    let help = match app.search_mode {
        SearchMode::Title => " Type to search by title, Enter to confirm, Esc to cancel",
        SearchMode::Semantic => " Type your question, Enter to search, Esc to cancel",
        SearchMode::None => {
            if app.semantic_loading {
                " Generating embedding and searching..."
            } else if app.fuzzy_matches.is_some() || app.semantic_results.is_some() {
                " j/k:move  Space/Ctrl-d/u:page  1-5:sort  /:title  ?:semantic  Esc:clear  q:back"
            } else {
                " j/k:move  Space/Ctrl-d/u:page  1-5:sort  /:title  ?:semantic  q:quit"
            }
        }
    };

    let position = format!(
        "{}/{}",
        app.selected_index + 1,
        app.visible_questions_count()
    );

    let scroll_pct = if app.visible_questions_count() > 0 {
        let pct = (app.selected_index * 100) / app.visible_questions_count().max(1);
        format!(" {}%", pct)
    } else {
        String::new()
    };

    let right_side = format!("{}{}", position, scroll_pct);
    let help_width = area.width as usize - right_side.len() - 1;

    let status = Line::from(vec![
        Span::styled(
            format!("{:<width$}", help, width = help_width),
            styles::status_style(),
        ),
        Span::styled(right_side, styles::status_style()),
    ]);

    frame.render_widget(Paragraph::new(status), area);
}

fn format_date(timestamp: i64) -> String {
    if timestamp == 0 {
        return "N/A".to_string();
    }
    Utc.timestamp_opt(timestamp, 0)
        .single()
        .map(|dt| dt.format("%b %d, %Y").to_string())
        .unwrap_or_else(|| "N/A".to_string())
}

fn format_number(num: i32) -> String {
    if num >= 1_000_000 {
        format!("{:.1}M", num as f64 / 1_000_000.0)
    } else if num >= 1_000 {
        format!("{:.1}K", num as f64 / 1_000.0)
    } else {
        num.to_string()
    }
}

fn highlight_fuzzy_match(text: &str, indices: &[u32], base_style: Style) -> Vec<Span<'static>> {
    let mut spans = Vec::new();
    let mut last_end = 0;
    let chars: Vec<char> = text.chars().collect();

    for &idx in indices {
        let idx = idx as usize;
        if idx >= chars.len() {
            continue;
        }
        if idx > last_end {
            let segment: String = chars[last_end..idx].iter().collect();
            spans.push(Span::styled(segment, base_style));
        }
        spans.push(Span::styled(
            chars[idx].to_string(),
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ));
        last_end = idx + 1;
    }

    if last_end < chars.len() {
        let segment: String = chars[last_end..].iter().collect();
        spans.push(Span::styled(segment, base_style));
    }

    spans
}
