use anyhow::Result;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::text::Line;

use crate::content::{build_erwin_content, build_question_content};
use crate::db::{Answer, Comment, Database, Question};
use crate::html::{is_erwin, Link};
use crate::search::fuzzy::{fuzzy_filter, FuzzyMatch};
use crate::search::semantic::SemanticSearch;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortColumn {
    Id,
    Date,
    Score,
    Views,
    Answers,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    Index,
    Show,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchMode {
    None,
    Title,
    Semantic,
}

pub struct App {
    pub should_quit: bool,
    pub db: Database,
    pub semantic: Option<SemanticSearch>,
    pub questions: Vec<Question>,
    pub page: Page,

    // Terminal dimensions
    pub width: u16,
    pub height: u16,

    // Index page state
    pub selected_index: usize,
    pub sort_column: SortColumn,
    pub sort_direction: SortDirection,
    pub search_mode: SearchMode,
    pub search_input: String,
    pub fuzzy_matches: Option<Vec<FuzzyMatch>>,
    pub semantic_results: Option<Vec<i64>>,
    pub semantic_loading: bool,

    // Show page state
    pub current_question_id: i64,
    pub current_question: Option<Question>,
    pub current_answers: Vec<Answer>,
    pub current_comments: Vec<Comment>,
    pub answer_comments: Vec<Vec<Comment>>, // Comments for each answer
    pub scroll_offset: usize,
    pub erwin_pane_visible: bool,
    pub erwin_answer_index: usize,
    pub left_pane_focused: bool,
    pub erwin_scroll_offset: usize,
    pub focused_link_index: Option<usize>,

    // Pre-rendered content (rebuilt when question or width changes)
    pub rendered_content: Vec<Line<'static>>,
    pub rendered_erwin_content: Vec<Line<'static>>,
    pub erwin_answer_positions: Vec<usize>,
    pub rendered_width: u16,
    pub content_links: Vec<Link>,
    pub erwin_links: Vec<Link>,

    // History stack for back navigation
    pub history: Vec<i64>,
}

impl App {
    pub fn new() -> Result<Self> {
        let db = Database::open("sqlite.db")?;
        let questions = db.get_questions()?;

        // Initialize semantic search (may fail if model can't be loaded)
        if !std::path::Path::new(".fastembed_cache").exists() {
            eprintln!("First run: downloading embedding model (~50MB)...");
        }
        let semantic = SemanticSearch::new().ok();

        Ok(Self {
            should_quit: false,
            db,
            semantic,
            questions,
            page: Page::Index,

            width: 80,
            height: 24,

            selected_index: 0,
            sort_column: SortColumn::Score,
            sort_direction: SortDirection::Desc,
            search_mode: SearchMode::None,
            search_input: String::new(),
            fuzzy_matches: None,
            semantic_results: None,
            semantic_loading: false,

            current_question_id: 0,
            current_question: None,
            current_answers: Vec::new(),
            current_comments: Vec::new(),
            answer_comments: Vec::new(),
            scroll_offset: 0,
            erwin_pane_visible: false,
            erwin_answer_index: 0,
            left_pane_focused: true,
            erwin_scroll_offset: 0,
            focused_link_index: None,

            rendered_content: Vec::new(),
            rendered_erwin_content: Vec::new(),
            erwin_answer_positions: Vec::new(),
            rendered_width: 0,
            content_links: Vec::new(),
            erwin_links: Vec::new(),

            history: Vec::new(),
        })
    }

    pub fn handle_resize(&mut self, width: u16, height: u16) {
        let width_changed = self.width != width;
        self.width = width;
        self.height = height;

        // Rebuild content if width changed and we're on show page
        if width_changed && self.page == Page::Show && self.current_question.is_some() {
            self.rebuild_content();
        }
    }

    pub fn handle_key(&mut self, key: KeyEvent) {
        match self.page {
            Page::Index => self.handle_index_key(key),
            Page::Show => self.handle_show_key(key),
        }
    }

    fn handle_index_key(&mut self, key: KeyEvent) {
        // Handle search input mode
        if self.search_mode != SearchMode::None {
            match key.code {
                KeyCode::Esc => {
                    self.search_mode = SearchMode::None;
                    self.search_input.clear();
                    self.fuzzy_matches = None;
                    self.selected_index = 0;
                }
                KeyCode::Enter => {
                    if self.search_mode == SearchMode::Semantic && !self.search_input.is_empty() {
                        self.perform_semantic_search();
                    }
                    self.search_mode = SearchMode::None;
                }
                KeyCode::Backspace => {
                    self.search_input.pop();
                    if self.search_mode == SearchMode::Title {
                        self.update_fuzzy_search();
                    }
                }
                KeyCode::Char(c) => {
                    if key.modifiers.contains(KeyModifiers::CONTROL) {
                        match c {
                            'u' => {
                                self.search_input.clear();
                                if self.search_mode == SearchMode::Title {
                                    self.update_fuzzy_search();
                                }
                            }
                            'w' => {
                                // Delete last word
                                if let Some(last_space) = self.search_input.rfind(' ') {
                                    self.search_input.truncate(last_space);
                                } else {
                                    self.search_input.clear();
                                }
                                if self.search_mode == SearchMode::Title {
                                    self.update_fuzzy_search();
                                }
                            }
                            _ => {}
                        }
                    } else {
                        self.search_input.push(c);
                        if self.search_mode == SearchMode::Title {
                            self.update_fuzzy_search();
                        }
                    }
                }
                _ => {}
            }
            return;
        }

        // Normal mode
        match key.code {
            KeyCode::Char('q') => {
                if self.fuzzy_matches.is_some() || self.semantic_results.is_some() {
                    // Clear search results
                    self.fuzzy_matches = None;
                    self.semantic_results = None;
                    self.search_input.clear();
                    self.selected_index = 0;
                } else {
                    self.should_quit = true;
                }
            }
            KeyCode::Char('/') => {
                self.search_mode = SearchMode::Title;
                self.search_input.clear();
            }
            KeyCode::Char('?') => {
                self.search_mode = SearchMode::Semantic;
                self.search_input.clear();
            }
            KeyCode::Esc => {
                if self.fuzzy_matches.is_some() || self.semantic_results.is_some() {
                    self.fuzzy_matches = None;
                    self.semantic_results = None;
                    self.search_input.clear();
                    self.selected_index = 0;
                }
            }
            KeyCode::Char('j') | KeyCode::Down => {
                let max = self.visible_questions_count().saturating_sub(1);
                self.selected_index = (self.selected_index + 1).min(max);
            }
            KeyCode::Char('k') | KeyCode::Up => {
                self.selected_index = self.selected_index.saturating_sub(1);
            }
            KeyCode::Char('g') => {
                self.selected_index = 0;
            }
            KeyCode::Char('G') => {
                self.selected_index = self.visible_questions_count().saturating_sub(1);
            }
            KeyCode::Char(' ') => {
                let visible = self.height.saturating_sub(3) as usize;
                let max = self.visible_questions_count().saturating_sub(1);
                self.selected_index = (self.selected_index + visible).min(max);
            }
            KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                let half = (self.height.saturating_sub(3) / 2) as usize;
                let max = self.visible_questions_count().saturating_sub(1);
                self.selected_index = (self.selected_index + half).min(max);
            }
            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                let half = (self.height.saturating_sub(3) / 2) as usize;
                self.selected_index = self.selected_index.saturating_sub(half);
            }
            KeyCode::Char('1') => self.toggle_sort(SortColumn::Id),
            KeyCode::Char('2') => self.toggle_sort(SortColumn::Date),
            KeyCode::Char('3') => self.toggle_sort(SortColumn::Score),
            KeyCode::Char('4') => self.toggle_sort(SortColumn::Views),
            KeyCode::Char('5') => self.toggle_sort(SortColumn::Answers),
            KeyCode::Enter => {
                if let Some(question) = self.get_selected_question() {
                    self.navigate_to_question(question.id);
                }
            }
            KeyCode::Char('o') => {
                if let Some(question) = self.get_selected_question() {
                    let url = format!("https://stackoverflow.com/questions/{}", question.id);
                    let _ = open::that(url);
                }
            }
            _ => {}
        }
    }

    fn handle_show_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                // Clear focused link first, then go back
                if self.focused_link_index.is_some() {
                    self.focused_link_index = None;
                } else {
                    self.go_back();
                }
            }
            KeyCode::Char('q') | KeyCode::Char('b') => {
                self.go_back();
            }
            KeyCode::Char('j') | KeyCode::Down => {
                self.focused_link_index = None;
                if self.erwin_pane_visible && !self.left_pane_focused {
                    self.erwin_scroll_offset += 1;
                } else {
                    self.scroll_offset += 1;
                }
            }
            KeyCode::Char('k') | KeyCode::Up => {
                self.focused_link_index = None;
                if self.erwin_pane_visible && !self.left_pane_focused {
                    self.erwin_scroll_offset = self.erwin_scroll_offset.saturating_sub(1);
                } else {
                    self.scroll_offset = self.scroll_offset.saturating_sub(1);
                }
            }
            KeyCode::Char(' ') | KeyCode::Char('d') => {
                self.focused_link_index = None;
                let page = self.height.saturating_sub(2) as usize;
                if self.erwin_pane_visible && !self.left_pane_focused {
                    self.erwin_scroll_offset += page;
                } else {
                    self.scroll_offset += page;
                }
            }
            KeyCode::Char('u') => {
                self.focused_link_index = None;
                let page = self.height.saturating_sub(2) as usize;
                if self.erwin_pane_visible && !self.left_pane_focused {
                    self.erwin_scroll_offset = self.erwin_scroll_offset.saturating_sub(page);
                } else {
                    self.scroll_offset = self.scroll_offset.saturating_sub(page);
                }
            }
            KeyCode::Char('g') => {
                self.focused_link_index = None;
                if self.erwin_pane_visible && !self.left_pane_focused {
                    self.erwin_scroll_offset = 0;
                } else {
                    self.scroll_offset = 0;
                }
            }
            KeyCode::Char('G') => {
                self.focused_link_index = None;
                // Scroll to end - will be clamped in view
                if self.erwin_pane_visible && !self.left_pane_focused {
                    self.erwin_scroll_offset = usize::MAX / 2;
                } else {
                    self.scroll_offset = usize::MAX / 2;
                }
            }
            KeyCode::Char('e') => {
                self.focused_link_index = None;
                let erwin_count = self.erwin_answer_count();
                if erwin_count > 0 {
                    if self.width >= 160 {
                        // Wide terminal: toggle/cycle Erwin pane
                        if !self.erwin_pane_visible {
                            self.erwin_pane_visible = true;
                            self.left_pane_focused = false;
                            self.erwin_scroll_offset = 0;
                            self.rebuild_content(); // Hide Erwin from left pane
                            self.rebuild_erwin_content();
                        } else if self.left_pane_focused {
                            self.left_pane_focused = false;
                        } else {
                            self.erwin_answer_index = (self.erwin_answer_index + 1) % erwin_count;
                            if self.erwin_answer_index == 0 {
                                self.erwin_pane_visible = false;
                                self.left_pane_focused = true;
                                self.rebuild_content(); // Show Erwin in left pane again
                            }
                            self.erwin_scroll_offset = 0;
                            self.rebuild_erwin_content();
                        }
                    } else {
                        // Narrow terminal: cycle to next Erwin answer and scroll to it
                        self.erwin_answer_index = (self.erwin_answer_index + 1) % erwin_count;
                        if let Some(&pos) = self.erwin_answer_positions.get(self.erwin_answer_index)
                        {
                            self.scroll_offset = pos;
                        }
                    }
                }
            }
            KeyCode::Char('E') => {
                self.focused_link_index = None;
                let erwin_count = self.erwin_answer_count();
                if erwin_count > 0 {
                    if self.width >= 160 && self.erwin_pane_visible {
                        if !self.left_pane_focused && self.erwin_answer_index == 0 {
                            self.left_pane_focused = true;
                        } else if !self.left_pane_focused {
                            self.erwin_answer_index = self.erwin_answer_index.saturating_sub(1);
                            self.erwin_scroll_offset = 0;
                            self.rebuild_erwin_content();
                        } else {
                            self.erwin_pane_visible = false;
                            self.rebuild_content(); // Show Erwin in left pane again
                        }
                    } else if self.width < 160 {
                        // Narrow terminal: go to previous Erwin answer
                        self.erwin_answer_index = if self.erwin_answer_index == 0 {
                            erwin_count - 1
                        } else {
                            self.erwin_answer_index - 1
                        };
                        if let Some(&pos) = self.erwin_answer_positions.get(self.erwin_answer_index)
                        {
                            self.scroll_offset = pos;
                        }
                    }
                }
            }
            KeyCode::Char('o') => {
                // If a link is focused, open that; otherwise open the question
                if let Some(link) = self.get_focused_link().cloned() {
                    // If it's a SO question we have locally, navigate to it
                    if let Some(qid) = link.question_id {
                        if self.questions.iter().any(|q| q.id == qid) {
                            self.navigate_to_question(qid);
                            return;
                        }
                    }
                    let _ = open::that(&link.url);
                } else {
                    let url = format!(
                        "https://stackoverflow.com/questions/{}",
                        self.current_question_id
                    );
                    let _ = open::that(url);
                }
            }
            KeyCode::Tab => {
                self.cycle_link(true);
            }
            KeyCode::BackTab => {
                self.cycle_link(false);
            }
            _ => {}
        }
    }

    fn update_fuzzy_search(&mut self) {
        if self.search_input.is_empty() {
            self.fuzzy_matches = None;
        } else {
            let matches = fuzzy_filter(&self.questions, &self.search_input, |q| &q.title);
            self.fuzzy_matches = Some(matches);
        }
        self.selected_index = 0;
    }

    fn perform_semantic_search(&mut self) {
        if self.search_input.is_empty() {
            self.semantic_results = None;
            return;
        }

        let Some(ref semantic) = self.semantic else {
            return;
        };

        // Generate embedding for query
        let Ok(embedding) = semantic.embed(&self.search_input) else {
            return;
        };

        // Search database for similar questions (by title)
        let Ok(results) = self.db.semantic_search(&embedding, 20) else {
            return;
        };

        // Extract question IDs directly - no deduplication or re-ranking needed
        let question_ids: Vec<i64> = results.into_iter().map(|r| r.question_id).collect();
        self.semantic_results = Some(question_ids);
        self.selected_index = 0;
    }

    fn toggle_sort(&mut self, column: SortColumn) {
        if self.sort_column == column {
            self.sort_direction = match self.sort_direction {
                SortDirection::Asc => SortDirection::Desc,
                SortDirection::Desc => SortDirection::Asc,
            };
        } else {
            self.sort_column = column;
            self.sort_direction = SortDirection::Desc;
        }
        self.selected_index = 0;
    }

    pub fn navigate_to_question(&mut self, question_id: i64) {
        if self.page == Page::Show {
            self.history.push(self.current_question_id);
        }

        self.current_question_id = question_id;
        self.current_question = self.db.get_question(question_id).ok().flatten();
        self.current_answers = self.db.get_answers(question_id).unwrap_or_default();
        self.current_comments = self
            .db
            .get_question_comments(question_id)
            .unwrap_or_default();

        // Pre-fetch all answer comments
        self.answer_comments = self
            .current_answers
            .iter()
            .map(|a| self.db.get_answer_comments(a.id).unwrap_or_default())
            .collect();

        self.scroll_offset = 0;
        self.erwin_pane_visible = false;
        self.erwin_answer_index = 0;
        self.left_pane_focused = true;
        self.erwin_scroll_offset = 0;
        self.focused_link_index = None;
        self.page = Page::Show;

        // Build the content
        self.rebuild_content();
    }

    fn rebuild_content(&mut self) {
        if let Some(ref question) = self.current_question {
            let hide_erwin = self.erwin_pane_visible && self.width >= 160;
            let content = build_question_content(
                question,
                &self.current_answers,
                &self.current_comments,
                &self.answer_comments,
                self.width as usize,
                hide_erwin,
            );
            self.rendered_content = content.lines;
            self.erwin_answer_positions = content.erwin_positions;
            self.content_links = content.links;
            self.rendered_width = self.width;
        }
    }

    fn rebuild_erwin_content(&mut self) {
        if let Some(answer) = self.get_current_erwin_answer() {
            let comments = self
                .current_answers
                .iter()
                .position(|a| a.id == answer.id)
                .and_then(|i| self.answer_comments.get(i))
                .map(|c| c.as_slice())
                .unwrap_or(&[]);

            let content = build_erwin_content(answer, comments, self.width as usize / 2);
            self.rendered_erwin_content = content.lines;
            self.erwin_links = content.links;
        }
    }

    fn go_back(&mut self) {
        if let Some(prev_id) = self.history.pop() {
            self.navigate_to_question(prev_id);
            self.history.pop(); // Remove the entry navigate_to_question just added
        } else {
            self.page = Page::Index;
        }
    }

    pub fn visible_questions_count(&self) -> usize {
        if let Some(ref matches) = self.fuzzy_matches {
            matches.len()
        } else if let Some(ref ids) = self.semantic_results {
            ids.len()
        } else {
            self.questions.len()
        }
    }

    pub fn get_sorted_questions(&self) -> Vec<&Question> {
        if let Some(ref matches) = self.fuzzy_matches {
            matches.iter().map(|m| &self.questions[m.index]).collect()
        } else if let Some(ref ids) = self.semantic_results {
            ids.iter()
                .filter_map(|id| self.questions.iter().find(|q| q.id == *id))
                .collect()
        } else {
            let mut sorted: Vec<_> = self.questions.iter().collect();
            sorted.sort_by(|a, b| {
                let cmp = match self.sort_column {
                    SortColumn::Id => a.id.cmp(&b.id),
                    SortColumn::Date => a.creation_date.cmp(&b.creation_date),
                    SortColumn::Score => a.score.cmp(&b.score),
                    SortColumn::Views => a.view_count.cmp(&b.view_count),
                    SortColumn::Answers => a.answer_count.cmp(&b.answer_count),
                };
                match self.sort_direction {
                    SortDirection::Asc => cmp,
                    SortDirection::Desc => cmp.reverse(),
                }
            });
            sorted
        }
    }

    pub fn get_selected_question(&self) -> Option<&Question> {
        self.get_sorted_questions()
            .get(self.selected_index)
            .copied()
    }

    pub fn erwin_answer_count(&self) -> usize {
        self.current_answers
            .iter()
            .filter(|a| is_erwin(&a.author_name))
            .count()
    }

    pub fn get_current_erwin_answer(&self) -> Option<&Answer> {
        self.current_answers
            .iter()
            .filter(|a| is_erwin(&a.author_name))
            .nth(self.erwin_answer_index)
    }

    fn cycle_link(&mut self, forward: bool) {
        // Determine which link collection and scroll offset to use
        let (links, scroll_offset) = if self.erwin_pane_visible && !self.left_pane_focused {
            (&self.erwin_links, &mut self.erwin_scroll_offset)
        } else {
            (&self.content_links, &mut self.scroll_offset)
        };

        if links.is_empty() {
            return;
        }

        // Calculate next link index
        let new_index = match self.focused_link_index {
            Some(current) => {
                if forward {
                    if current + 1 >= links.len() {
                        0
                    } else {
                        current + 1
                    }
                } else if current == 0 {
                    links.len() - 1
                } else {
                    current - 1
                }
            }
            None => {
                if forward {
                    0
                } else {
                    links.len() - 1
                }
            }
        };

        self.focused_link_index = Some(new_index);

        // Scroll to make the link visible
        if let Some(link) = links.get(new_index) {
            let visible_height = self.height.saturating_sub(2) as usize;
            if link.line_index < *scroll_offset {
                *scroll_offset = link.line_index;
            } else if link.line_index >= *scroll_offset + visible_height {
                *scroll_offset = link.line_index.saturating_sub(visible_height / 2);
            }
        }
    }

    pub fn get_focused_link(&self) -> Option<&Link> {
        let links = if self.erwin_pane_visible && !self.left_pane_focused {
            &self.erwin_links
        } else {
            &self.content_links
        };

        self.focused_link_index.and_then(|idx| links.get(idx))
    }
}
