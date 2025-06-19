import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { generateEmbedding, serializeEmbedding } from "./embeddings.ts";
import type { SearchResult } from "./types.ts";
import { getPaths, isDevelopment, isCompiledBinary } from "./paths.ts";

// Types for database rows
export interface QuestionRow {
  id: number;
  title: string;
  body: string;
  score: number;
  view_count: number;
  answer_count: number;
  creation_date: number;
  accepted_answer_id: number | null;
  author_name: string;
}

export interface AnswerRow {
  id: number;
  answer_id: number;
  answer_text: string;
  score: number;
  is_accepted: boolean;
  author_name: string;
  author_reputation: number;
}

export interface CommentRow {
  comment_text: string;
  score: number;
  author_name: string;
}

export class DB {
  private db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  // Initialize database and return instance
  static init(): DB {
    const paths = getPaths();
    const db = new Database(paths.database);

    // In development (bun tui.tsx), use sqlite-vec npm package
    if (isDevelopment) {
      sqliteVec.load(db);
    } else if (paths.sqliteVec !== null) {
      // In production/compiled mode, load the native extension directly
      db.loadExtension(paths.sqliteVec);
    } else {
      // Compiled binary but no extension found - try npm package as fallback
      // This works when running compiled binary from the project directory
      try {
        sqliteVec.load(db);
      } catch {
        throw new Error(
          "sqlite-vec extension not found. For compiled binaries, ensure lib/vec0.so exists " +
          "or run from a directory with node_modules/sqlite-vec-* installed."
        );
      }
    }

    return new DB(db);
  }

  // Fetch all questions for index
  getQuestions(): QuestionRow[] {
    return this.db
      .query(
        `SELECT id, title, body, score, view_count, answer_count,
       creation_date, accepted_answer_id, author_name
       FROM questions ORDER BY id DESC`
      )
      .all() as QuestionRow[];
  }

  // Fetch a single question with details
  getQuestion(id: number): QuestionRow | undefined {
    return this.db
      .query(
        `SELECT id, title, body, score, view_count, answer_count,
       creation_date, accepted_answer_id, author_name
       FROM questions WHERE id = ?`
      )
      .get(id) as QuestionRow | undefined;
  }

  // Fetch answers for a question
  getAnswers(questionId: number): AnswerRow[] {
    const rows = this.db
      .query(
        `SELECT id, answer_id, answer_text, score, is_accepted, author_name, author_reputation
       FROM answers WHERE question_id = ? ORDER BY answer_order`
      )
      .all(questionId) as Array<{
      id: number;
      answer_id: number;
      answer_text: string;
      score: number;
      is_accepted: number;
      author_name: string;
      author_reputation: number;
    }>;

    return rows.map((row) => ({
      ...row,
      is_accepted: Boolean(row.is_accepted),
    }));
  }

  // Fetch comments for a question
  getQuestionComments(questionId: number): CommentRow[] {
    return this.db
      .query(
        "SELECT comment_text, score, author_name FROM question_comments WHERE question_id = ?"
      )
      .all(questionId) as CommentRow[];
  }

  // Fetch comments for an answer
  getAnswerComments(answerId: number): CommentRow[] {
    return this.db
      .query(
        "SELECT comment_text, score, author_name FROM answer_comments WHERE answer_id = ?"
      )
      .all(answerId) as CommentRow[];
  }

  // Check if a question exists in our database
  questionExists(questionId: number): boolean {
    const result = this.db
      .query("SELECT 1 FROM questions WHERE id = ? LIMIT 1")
      .get(questionId);
    return result !== null;
  }

  // Perform semantic search using sqlite-vec
  async semanticSearch(
    queryText: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const queryEmbedding = await generateEmbedding(queryText);
    const queryBlob = serializeEmbedding(queryEmbedding);

    const results = this.db
      .query(
        `
      SELECT
        ae.answer_id,
        a.question_id,
        vec_distance_cosine(ae.embedding, ?) as distance,
        a.answer_text,
        q.title as question_title
      FROM answer_embeddings ae
      JOIN answers a ON ae.answer_id = a.id
      JOIN questions q ON a.question_id = q.id
      ORDER BY distance ASC
      LIMIT ?
    `
      )
      .all(queryBlob, limit) as Array<{
      answer_id: number;
      question_id: number;
      distance: number;
      answer_text: string;
      question_title: string;
    }>;

    return results.map((row) => ({
      answer_id: row.answer_id,
      question_id: row.question_id,
      score: 1 - row.distance,
      answer_text: row.answer_text,
      question_title: row.question_title,
    }));
  }
}
