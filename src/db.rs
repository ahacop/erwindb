use anyhow::{Context, Result};
use rusqlite::ffi::sqlite3_auto_extension;
use rusqlite::{params, Connection, OptionalExtension};
use sqlite_vec::sqlite3_vec_init;
use std::fs;
use std::path::{Path, PathBuf};

/// Embedded database (compiled into the binary)
const EMBEDDED_DB: &[u8] = include_bytes!("../sqlite.db");

#[derive(Debug, Clone)]
pub struct Question {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub score: i32,
    pub view_count: i32,
    pub answer_count: i32,
    pub creation_date: i64,
    pub accepted_answer_id: Option<i64>,
    pub author_name: String,
}

#[derive(Debug, Clone)]
pub struct Answer {
    pub id: i64,
    #[allow(dead_code)]
    pub answer_id: i64,
    pub answer_text: String,
    pub score: i32,
    pub is_accepted: bool,
    pub author_name: String,
    pub author_reputation: i32,
}

#[derive(Debug, Clone)]
pub struct Comment {
    pub comment_text: String,
    pub score: i32,
    pub author_name: String,
}

#[derive(Debug)]
pub struct SemanticResult {
    pub question_id: i64,
    #[allow(dead_code)]
    pub distance: f32,
}

pub struct Database {
    conn: Connection,
}

/// Get the path where the database should be stored
fn get_db_path() -> Result<PathBuf> {
    let data_dir = dirs::data_dir()
        .context("Could not find data directory")?
        .join("erwindb");

    Ok(data_dir.join("sqlite.db"))
}

/// Extract the embedded database to the data directory if it doesn't exist
fn ensure_db_exists() -> Result<PathBuf> {
    let db_path = get_db_path()?;

    if !db_path.exists() {
        // Create parent directory if needed
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).context("Failed to create data directory")?;
        }

        // Write embedded database
        fs::write(&db_path, EMBEDDED_DB).context("Failed to extract database")?;
    }

    Ok(db_path)
}

impl Database {
    /// Open the embedded database (extracts to data directory on first run)
    pub fn open_embedded() -> Result<Self> {
        let db_path = ensure_db_exists()?;
        Self::open(&db_path)
    }

    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        // Register sqlite-vec extension before opening connection
        unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        }

        let conn = Connection::open(path).context("Failed to open database")?;

        Ok(Self { conn })
    }

    pub fn get_questions(&self) -> Result<Vec<Question>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, body, score, view_count, answer_count,
                    creation_date, accepted_answer_id, author_name
             FROM questions ORDER BY id DESC",
        )?;

        let questions = stmt
            .query_map([], |row| {
                Ok(Question {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    score: row.get(3)?,
                    view_count: row.get(4)?,
                    answer_count: row.get(5)?,
                    creation_date: row.get(6)?,
                    accepted_answer_id: row.get(7)?,
                    author_name: row.get(8)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(questions)
    }

    pub fn get_question(&self, id: i64) -> Result<Option<Question>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, body, score, view_count, answer_count,
                    creation_date, accepted_answer_id, author_name
             FROM questions WHERE id = ?",
        )?;

        let question = stmt
            .query_row(params![id], |row| {
                Ok(Question {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    score: row.get(3)?,
                    view_count: row.get(4)?,
                    answer_count: row.get(5)?,
                    creation_date: row.get(6)?,
                    accepted_answer_id: row.get(7)?,
                    author_name: row.get(8)?,
                })
            })
            .optional()?;

        Ok(question)
    }

    pub fn get_answers(&self, question_id: i64) -> Result<Vec<Answer>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, answer_id, answer_text, score, is_accepted, author_name, author_reputation
             FROM answers WHERE question_id = ? ORDER BY answer_order",
        )?;

        let answers = stmt
            .query_map(params![question_id], |row| {
                Ok(Answer {
                    id: row.get(0)?,
                    answer_id: row.get(1)?,
                    answer_text: row.get(2)?,
                    score: row.get(3)?,
                    is_accepted: row.get::<_, i32>(4)? != 0,
                    author_name: row.get(5)?,
                    author_reputation: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(answers)
    }

    pub fn get_question_comments(&self, question_id: i64) -> Result<Vec<Comment>> {
        let mut stmt = self.conn.prepare(
            "SELECT comment_text, score, author_name
             FROM question_comments WHERE question_id = ?",
        )?;

        let comments = stmt
            .query_map(params![question_id], |row| {
                Ok(Comment {
                    comment_text: row.get(0)?,
                    score: row.get(1)?,
                    author_name: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(comments)
    }

    pub fn get_answer_comments(&self, answer_id: i64) -> Result<Vec<Comment>> {
        let mut stmt = self.conn.prepare(
            "SELECT comment_text, score, author_name
             FROM answer_comments WHERE answer_id = ?",
        )?;

        let comments = stmt
            .query_map(params![answer_id], |row| {
                Ok(Comment {
                    comment_text: row.get(0)?,
                    score: row.get(1)?,
                    author_name: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(comments)
    }

    #[allow(dead_code)]
    pub fn question_exists(&self, question_id: i64) -> bool {
        self.conn
            .query_row(
                "SELECT 1 FROM questions WHERE id = ? LIMIT 1",
                params![question_id],
                |_| Ok(()),
            )
            .is_ok()
    }

    pub fn semantic_search(
        &self,
        query_embedding: &[f32],
        limit: usize,
    ) -> Result<Vec<SemanticResult>> {
        let blob: Vec<u8> = query_embedding
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();

        let mut stmt = self.conn.prepare(
            "SELECT qe.question_id,
                    vec_distance_cosine(qe.embedding, ?) as distance
             FROM question_embeddings qe
             ORDER BY distance ASC
             LIMIT ?",
        )?;

        let results = stmt
            .query_map(params![blob, limit as i64], |row| {
                Ok(SemanticResult {
                    question_id: row.get(0)?,
                    distance: row.get(1)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(results)
    }
}
