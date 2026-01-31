use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

use crate::db::{Answer, Comment, Question};
use crate::html::{decode_html_entities, html_to_content, is_erwin, strip_html_tags, Link};
use crate::ui::styles;

/// Pre-rendered content for the show page
pub struct RenderedContent {
    pub lines: Vec<Line<'static>>,
    pub erwin_positions: Vec<usize>,
    pub links: Vec<Link>,
}

/// Pre-rendered content for the Erwin pane
pub struct RenderedErwinContent {
    pub lines: Vec<Line<'static>>,
    pub links: Vec<Link>,
}

pub fn build_question_content(
    question: &Question,
    answers: &[Answer],
    question_comments: &[Comment],
    answer_comments: &[Vec<Comment>],
    width: usize,
    hide_erwin: bool,
) -> RenderedContent {
    let content_width = width.saturating_sub(4);
    let mut lines: Vec<Line<'static>> = Vec::new();
    let mut erwin_positions: Vec<usize> = Vec::new();
    let mut all_links: Vec<Link> = Vec::new();

    // Title
    let title = decode_html_entities(&question.title);
    lines.push(Line::from(Span::styled(title, styles::title_style())));

    // URL
    lines.push(Line::from(Span::styled(
        format!("stackoverflow.com/questions/{}", question.id),
        Style::default().fg(Color::Cyan).add_modifier(Modifier::DIM),
    )));

    // Meta info
    let date = format_date(question.creation_date);
    lines.push(Line::from(Span::styled(
        format!(
            "Asked by {} on {}  |  {} votes  |  {} views",
            question.author_name,
            date,
            question.score,
            format_number(question.view_count)
        ),
        Style::default(),
    )));

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "\u{2500}".repeat(content_width.min(60)),
        styles::separator_style(),
    )));
    lines.push(Line::from(""));

    // Question body
    lines.push(Line::from(Span::styled(
        "QUESTION",
        styles::question_header_style(),
    )));
    lines.push(Line::from(""));

    let body_content = html_to_content(&question.body, content_width);
    let link_offset = lines.len();
    for content_line in body_content.lines {
        lines.push(content_line.line);
    }
    // Adjust link line indices and add to collection
    for mut link in body_content.links {
        link.line_index += link_offset;
        all_links.push(link);
    }

    // Question comments
    if !question_comments.is_empty() {
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            format!("Comments ({})", question_comments.len()),
            styles::comment_header_style(),
        )));

        for comment in question_comments {
            lines.push(Line::from(""));
            let vote_str = if comment.score > 0 {
                format!("[+{}] ", comment.score)
            } else {
                String::new()
            };
            let comment_text = strip_html_tags(&comment.comment_text);
            lines.push(Line::from(Span::styled(
                format!(
                    "    {}{} \u{2014} {}",
                    vote_str, comment_text, comment.author_name
                ),
                styles::comment_text_style(),
            )));
        }
    }

    // Answers
    for (i, answer) in answers.iter().enumerate() {
        let author_is_erwin = is_erwin(&answer.author_name);

        // Skip Erwin's answers when shown in dedicated pane
        if author_is_erwin && hide_erwin {
            continue;
        }

        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "\u{2500}".repeat(content_width.min(60)),
            styles::separator_style(),
        )));
        lines.push(Line::from(""));

        // Track Erwin answer positions for scrolling in narrow mode
        if author_is_erwin {
            erwin_positions.push(lines.len().saturating_sub(3));
        }

        // Answer header
        let accepted_mark = if answer.is_accepted {
            " \u{2713} ACCEPTED"
        } else {
            ""
        };
        let score_str = if answer.score > 0 {
            format!("+{}", answer.score)
        } else {
            answer.score.to_string()
        };
        let erwin_mark = if author_is_erwin { " \u{25c6}" } else { "" };

        if author_is_erwin {
            lines.push(Line::from(vec![
                Span::styled(" \u{25c6} ", styles::erwin_header_style()),
                Span::styled(
                    format!("ANSWER {}{}  ({} votes)", i + 1, accepted_mark, score_str),
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
            ]));
        } else {
            lines.push(Line::from(Span::styled(
                format!(
                    "ANSWER {}{}{}  ({} votes)",
                    i + 1,
                    accepted_mark,
                    erwin_mark,
                    score_str
                ),
                styles::answer_header_style(),
            )));
        }

        let author_style = if author_is_erwin {
            styles::erwin_text_style()
        } else {
            Style::default()
        };

        lines.push(Line::from(Span::styled(
            format!(
                "by {} ({} rep)",
                answer.author_name,
                format_number(answer.author_reputation)
            ),
            author_style,
        )));
        lines.push(Line::from(""));

        // Answer body
        let answer_content = html_to_content(&answer.answer_text, content_width);
        let answer_link_offset = lines.len();
        for content_line in answer_content.lines {
            if author_is_erwin {
                let mut spans = vec![Span::styled("\u{2502} ", styles::erwin_accent_style())];
                spans.extend(content_line.line.spans);
                lines.push(Line::from(spans));
            } else {
                lines.push(content_line.line);
            }
        }
        // Adjust link line indices and add to collection
        for mut link in answer_content.links {
            link.line_index += answer_link_offset;
            all_links.push(link);
        }

        // Answer comments
        let comments = answer_comments.get(i).map(|c| c.as_slice()).unwrap_or(&[]);
        if !comments.is_empty() {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                format!("Comments ({})", comments.len()),
                styles::comment_header_style(),
            )));

            for comment in comments {
                let comment_is_erwin = is_erwin(&comment.author_name);
                lines.push(Line::from(""));
                let vote_str = if comment.score > 0 {
                    format!("[+{}] ", comment.score)
                } else {
                    String::new()
                };
                let erwin_mark = if comment_is_erwin { "\u{25c6} " } else { "" };
                let comment_text = strip_html_tags(&comment.comment_text);

                let style = if comment_is_erwin {
                    Style::default().fg(Color::Yellow)
                } else {
                    styles::comment_text_style()
                };

                lines.push(Line::from(Span::styled(
                    format!(
                        "    {}{}{} \u{2014} {}",
                        erwin_mark, vote_str, comment_text, comment.author_name
                    ),
                    style,
                )));
            }
        }
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "\u{2500}".repeat(content_width.min(60)),
        styles::separator_style(),
    )));

    RenderedContent {
        lines,
        erwin_positions,
        links: all_links,
    }
}

pub fn build_erwin_content(
    answer: &Answer,
    comments: &[Comment],
    width: usize,
) -> RenderedErwinContent {
    let content_width = width.saturating_sub(6);
    let mut lines: Vec<Line<'static>> = Vec::new();
    let mut all_links: Vec<Link> = Vec::new();

    // Answer header
    let accepted_mark = if answer.is_accepted {
        " \u{2713} ACCEPTED"
    } else {
        ""
    };
    let score_str = if answer.score > 0 {
        format!("+{}", answer.score)
    } else {
        answer.score.to_string()
    };

    lines.push(Line::from(Span::styled(
        format!("ANSWER{}  ({} votes)", accepted_mark, score_str),
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD),
    )));

    lines.push(Line::from(Span::styled(
        format!(
            "by {} ({} rep)",
            answer.author_name,
            format_number(answer.author_reputation)
        ),
        styles::erwin_text_style(),
    )));
    lines.push(Line::from(""));

    // Answer body
    let answer_content = html_to_content(&answer.answer_text, content_width);
    let link_offset = lines.len();
    for content_line in answer_content.lines {
        lines.push(content_line.line);
    }
    // Adjust link line indices and add to collection
    for mut link in answer_content.links {
        link.line_index += link_offset;
        all_links.push(link);
    }

    // Answer comments
    if !comments.is_empty() {
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            format!("Comments ({})", comments.len()),
            styles::comment_header_style(),
        )));

        for comment in comments {
            let comment_is_erwin = is_erwin(&comment.author_name);
            lines.push(Line::from(""));
            let vote_str = if comment.score > 0 {
                format!("[+{}] ", comment.score)
            } else {
                String::new()
            };
            let erwin_mark = if comment_is_erwin { "\u{25c6} " } else { "" };
            let comment_text = strip_html_tags(&comment.comment_text);

            let style = if comment_is_erwin {
                Style::default().fg(Color::Yellow)
            } else {
                styles::comment_text_style()
            };

            lines.push(Line::from(Span::styled(
                format!(
                    "    {}{}{} \u{2014} {}",
                    erwin_mark, vote_str, comment_text, comment.author_name
                ),
                style,
            )));
        }
    }

    RenderedErwinContent {
        lines,
        links: all_links,
    }
}

fn format_date(timestamp: i64) -> String {
    use chrono::{TimeZone, Utc};
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
