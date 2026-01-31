// Interactive Stack Overflow Scraper Workflow
// Save this as interactive_scraper.ts

import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import type { StackOverflowAnswer, ScrapedData, StoredQuestion } from "./types.ts";

// Lazy load embeddings module (only when needed for embedding commands)
async function loadEmbeddings() {
  return await import("./embeddings.ts");
}

// Load .env file
const env = await load();

// Stack Overflow user ID for Erwin Brandstetter
const USER_ID = 939860;
const API_KEY = env["STACKOVERFLOW_API_KEY"] || Deno.env.get("STACKOVERFLOW_API_KEY") || "";
const API_KEY_PARAM = API_KEY ? `&key=${API_KEY}` : "";
const API_URL = `https://api.stackexchange.com/2.3/users/${USER_ID}/answers?order=desc&sort=activity&site=stackoverflow&filter=default${API_KEY_PARAM}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class InteractiveStackOverflowScraper {
  private questionIds: number[] = [];
  private scrapedData = new Map<number, ScrapedData>();
  private db: DB | null = null;

  // Initialize SQLite database
  async initDatabase(dbPath = "stackoverflow_data.db") {
    this.db = new DB(dbPath);
    console.log(`✅ Connected to SQLite database: ${dbPath}`);
    if (API_KEY) {
      console.log(`🔑 Using API key (10,000 requests/day quota)`);
    } else {
      console.log(`⚠️  No API key set (300 requests/day). Set STACKOVERFLOW_API_KEY env var for higher quota.`);
    }

    // Create tables
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS question_ids (
        id INTEGER PRIMARY KEY,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        scraped BOOLEAN DEFAULT FALSE,
        scraped_at DATETIME NULL
      )
    `);

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        answer_count INTEGER DEFAULT 0,
        creation_date INTEGER DEFAULT 0,
        last_activity_date INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        is_answered BOOLEAN DEFAULT FALSE,
        accepted_answer_id INTEGER,
        author_name TEXT DEFAULT 'Unknown',
        author_reputation INTEGER DEFAULT 0,
        author_user_id INTEGER DEFAULT 0,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id) REFERENCES question_ids (id)
      )
    `);

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS question_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER,
        comment_text TEXT,
        score INTEGER DEFAULT 0,
        creation_date INTEGER DEFAULT 0,
        author_name TEXT DEFAULT 'Unknown',
        author_reputation INTEGER DEFAULT 0,
        author_user_id INTEGER DEFAULT 0,
        FOREIGN KEY (question_id) REFERENCES questions (id)
      )
    `);

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER,
        answer_id INTEGER,
        answer_text TEXT,
        answer_order INTEGER,
        score INTEGER DEFAULT 0,
        is_accepted BOOLEAN DEFAULT FALSE,
        creation_date INTEGER DEFAULT 0,
        last_activity_date INTEGER DEFAULT 0,
        author_name TEXT DEFAULT 'Unknown',
        author_reputation INTEGER DEFAULT 0,
        author_user_id INTEGER DEFAULT 0,
        FOREIGN KEY (question_id) REFERENCES questions (id)
      )
    `);

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS answer_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        answer_id INTEGER,
        comment_text TEXT,
        score INTEGER DEFAULT 0,
        creation_date INTEGER DEFAULT 0,
        author_name TEXT DEFAULT 'Unknown',
        author_reputation INTEGER DEFAULT 0,
        author_user_id INTEGER DEFAULT 0,
        FOREIGN KEY (answer_id) REFERENCES answers (id)
      )
    `);

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS question_embeddings (
        question_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions (id)
      )
    `);

    // Load existing question IDs from database
    await this.loadQuestionIdsFromDatabase();

    await this.getDatabaseStats();
  }

  // Load existing question IDs from database
  async loadQuestionIdsFromDatabase() {
    if (!this.db) return;

    const existingIds = this.query(
      "SELECT id FROM question_ids ORDER BY discovered_at DESC",
    );
    this.questionIds = existingIds.map((row: any) => row.id);

    if (this.questionIds.length > 0) {
      console.log(
        `📚 Loaded ${this.questionIds.length} existing question IDs from database`,
      );
    }
  }

  // Save question IDs to database
  async saveQuestionIdsToDatabase(questionIds: number[]) {
    if (!this.db) return;

    console.log(`💾 Saving ${questionIds.length} question IDs to database...`);

    this.db.execute("BEGIN TRANSACTION");
    try {
      let newCount = 0;
      for (const id of questionIds) {
        // Use INSERT OR IGNORE to avoid duplicates
        this.db.query(
          "INSERT OR IGNORE INTO question_ids (id) VALUES (?)",
          [id],
        );
        // SQLite returns the number of changed rows, check if this was a new insert
        if (this.db.changes > 0) newCount++;
      }
      this.db.execute("COMMIT");
      console.log(
        `✅ Saved ${newCount} new question IDs (${questionIds.length - newCount} were already known)`,
      );
    } catch (err) {
      this.db.execute("ROLLBACK");
      throw err;
    }
  }
  // Fetch question IDs and display them
  async fetchQuestionIds(maxPages: number = 1): Promise<number[]> {
    let page = 1;
    let hasMore = true;
    const questionIds = new Set<number>(this.questionIds); // Start with existing IDs

    console.log(`🔍 Fetching answered question IDs (max ${maxPages} pages)...`);
    console.log(
      `📚 Starting with ${this.questionIds.length} existing IDs from database`,
    );

    while (hasMore && page <= maxPages) {
      try {
        const url = API_URL + `&page=${page}&pagesize=100`;
        const response = await fetch(url);
        const data = await response.json();

        console.log(
          `📄 Page ${page}: ${data.items?.length || 0} answers, quota remaining: ${data.quota_remaining}`,
        );

        const items = data.items || [];
        hasMore = data.has_more;

        if (items.length === 0) break;

        const newIdsThisPage = new Set<number>();
        items.forEach((item: StackOverflowAnswer) => {
          if (!questionIds.has(item.question_id)) {
            newIdsThisPage.add(item.question_id);
          }
          questionIds.add(item.question_id);
        });

        console.log(
          `   📝 Found ${newIdsThisPage.size} new question IDs on this page`,
        );

        page++;
        if (hasMore && page <= maxPages) await sleep(1000);
      } catch (err) {
        console.error(`❌ Error fetching page ${page}: ${err instanceof Error ? err.message : err}`);
        break;
      }
    }

    const newQuestionIds = Array.from(questionIds);

    // Save all IDs to database (will ignore duplicates)
    await this.saveQuestionIdsToDatabase(newQuestionIds);

    // Update our in-memory list
    this.questionIds = newQuestionIds;

    console.log(`\n📊 Total unique questions: ${this.questionIds.length}`);
    return this.questionIds;
  }

  // Check if a question is already scraped
  isQuestionScraped(questionId: number): boolean {
    if (!this.db) return false;

    const result = this.query("SELECT scraped FROM question_ids WHERE id = ?", [
      questionId,
    ]);

    return result.length > 0 && result[0].scraped === 1;
  }

  // Mark a question as scraped
  markQuestionAsScraped(questionId: number) {
    if (!this.db) return;

    this.db.query(
      "UPDATE question_ids SET scraped = TRUE, scraped_at = CURRENT_TIMESTAMP WHERE id = ?",
      [questionId],
    );
  }

  // Get unscraped question IDs (newest first - higher ID = newer question)
  getUnscrapedQuestionIds(limit = 10): number[] {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return [];
    }

    const result = this.query(
      "SELECT id FROM question_ids WHERE scraped = FALSE ORDER BY id DESC LIMIT ?",
      [limit],
    );

    return result.map((row: any) => row.id);
  }

  // Get scraped question IDs
  getScrapedQuestionIds(limit = 10): number[] {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return [];
    }

    const result = this.query(
      "SELECT id FROM question_ids WHERE scraped = TRUE ORDER BY scraped_at DESC LIMIT ?",
      [limit],
    );

    return result.map((row: any) => row.id);
  }
  // Display question IDs in a nice format
  displayQuestionIds(limit = 20) {
    if (this.questionIds.length === 0) {
      console.log(
        "❌ No question IDs available. Run fetchQuestionIds() first.",
      );
      return;
    }

    console.log(
      `\n📋 Question IDs (showing first ${Math.min(limit, this.questionIds.length)} of ${this.questionIds.length}):`,
    );

    const idsToShow = this.questionIds.slice(0, limit);
    idsToShow.forEach((id, index) => {
      const isScraped = this.isQuestionScraped(id);
      const status = isScraped ? "✅" : "⏳";
      console.log(`  ${(index + 1).toString().padStart(2)}: ${id} ${status}`);
    });

    if (this.questionIds.length > limit) {
      console.log(`  ... and ${this.questionIds.length - limit} more`);
    }

    // Show scraping statistics
    const unscrapedCount = this.getUnscrapedQuestionIds(1000).length;
    const scrapedCount = this.getScrapedQuestionIds(1000).length;
    console.log(
      `\n📊 Status: ${scrapedCount} scraped, ${unscrapedCount} unscraped`,
    );
  }

  // Display unscraped question IDs
  displayUnscrapedIds(limit = 20) {
    const unscrapedIds = this.getUnscrapedQuestionIds(limit);

    if (unscrapedIds.length === 0) {
      console.log("🎉 All questions have been scraped!");
      return;
    }

    console.log(
      `\n⏳ Unscraped Question IDs (showing ${unscrapedIds.length}):`,
    );
    unscrapedIds.forEach((id, index) => {
      console.log(`  ${(index + 1).toString().padStart(2)}: ${id}`);
    });
  }

  // Get specific ranges of question IDs
  getQuestionIds(start = 0, count = 10): number[] {
    return this.questionIds.slice(start, start + count);
  }


  // Helper to fetch with rate limit handling
  async fetchWithRetry(url: string, retries = 3): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(url);

      // Check if we got HTML (rate limited) instead of JSON
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        // Log any useful headers
        const retryAfter = response.headers.get("retry-after");
        const rateLimitReset = response.headers.get("x-ratelimit-reset");

        if (retryAfter) {
          const waitSecs = parseInt(retryAfter, 10);
          console.log(`⚠️  Rate limited. Retry-After: ${waitSecs}s`);
          if (attempt < retries) {
            console.log(`⏳ Waiting ${waitSecs}s before retry ${attempt + 1}/${retries}...`);
            await sleep(waitSecs * 1000);
            continue;
          }
        } else if (rateLimitReset) {
          const resetTime = new Date(parseInt(rateLimitReset, 10) * 1000);
          console.log(`⚠️  Rate limited. Quota resets at: ${resetTime.toLocaleString()}`);
        } else {
          console.log(`⚠️  Rate limited (no retry info in headers).`);
          // Log all headers for debugging
          console.log(`   Response status: ${response.status}`);
        }

        if (attempt < retries) {
          console.log(`⏳ Waiting 30s before retry ${attempt + 1}/${retries}...`);
          await sleep(30000);
          continue;
        }
        throw new Error("API rate limit exceeded. Try again later or use an API key.");
      }

      const data = await response.json();

      // Check for backoff request from API
      if (data.backoff) {
        console.log(`⏳ API requested backoff of ${data.backoff}s...`);
        await sleep(data.backoff * 1000);
      }

      // Check quota remaining
      if (data.quota_remaining !== undefined) {
        console.log(`   📊 API quota: ${data.quota_remaining}/${data.quota_max || 10000} remaining`);
        if (data.quota_remaining === 0) {
          throw new Error("API quota exhausted. Resets daily at midnight UTC.");
        }
      }

      return data;
    }
    throw new Error("Max retries exceeded");
  }

  // Scrape a single question
  async scrapeQuestion(questionId: number): Promise<ScrapedData | StoredQuestion | null> {
    // Check if already scraped
    if (this.isQuestionScraped(questionId)) {
      console.log(
        `✅ Question ${questionId} already scraped, loading from database...`,
      );
      return this.getQuestion(questionId);
    }

    try {
      console.log(`🔄 Fetching question ${questionId} from API...`);

      // Get question details with body included
      const questionData = await this.fetchWithRetry(
        `https://api.stackexchange.com/2.3/questions/${questionId}?order=desc&sort=activity&site=stackoverflow&filter=withbody${API_KEY_PARAM}`,
      );

      if (!questionData.items || questionData.items.length === 0) {
        console.log(`❌ No question data found for ID ${questionId} (likely deleted)`);
        // Mark as scraped so we don't keep retrying deleted questions
        this.markQuestionAsScraped(questionId);
        return null;
      }

      const question = questionData.items[0];

      await sleep(1000); // Rate limit delay

      // Get answers with body included
      const answersData = await this.fetchWithRetry(
        `https://api.stackexchange.com/2.3/questions/${questionId}/answers?order=desc&sort=activity&site=stackoverflow&filter=withbody&pagesize=100${API_KEY_PARAM}`,
      );

      await sleep(1000); // Rate limit delay

      // Get question comments with body included
      const questionCommentsData = await this.fetchWithRetry(
        `https://api.stackexchange.com/2.3/questions/${questionId}/comments?order=desc&sort=creation&site=stackoverflow&filter=withbody&pagesize=100${API_KEY_PARAM}`,
      );

      const questionComments =
        questionCommentsData.items
          ?.map((comment: any) => ({
            text: comment.body || "",
            score: comment.score || 0,
            creationDate: comment.creation_date || 0,
            author: {
              name: comment.owner?.display_name || "Unknown",
              reputation: comment.owner?.reputation || 0,
              userId: comment.owner?.user_id || 0,
            },
          }))
          .filter((c: any) => c.text.trim().length > 0) || [];

      const answers: any[] = [];

      // For each answer, get its comments with author info
      for (const answer of answersData.items || []) {
        const answerCommentsData = await this.fetchWithRetry(
          `https://api.stackexchange.com/2.3/answers/${answer.answer_id}/comments?order=desc&sort=creation&site=stackoverflow&filter=withbody&pagesize=100${API_KEY_PARAM}`,
        );

        const comments =
          answerCommentsData.items
            ?.map((comment: any) => ({
              text: comment.body || "",
              score: comment.score || 0,
              creationDate: comment.creation_date || 0,
              author: {
                name: comment.owner?.display_name || "Unknown",
                reputation: comment.owner?.reputation || 0,
                userId: comment.owner?.user_id || 0,
              },
            }))
            .filter((c: any) => c.text.trim().length > 0) || [];

        answers.push({
          answerId: answer.answer_id,
          answerText: answer.body || "",
          score: answer.score || 0,
          isAccepted: answer.is_accepted || false,
          creationDate: answer.creation_date || 0,
          lastActivityDate: answer.last_activity_date || 0,
          author: {
            name: answer.owner?.display_name || "Unknown",
            reputation: answer.owner?.reputation || 0,
            userId: answer.owner?.user_id || 0,
          },
          comments,
        });

        await sleep(1000); // Rate limit delay between answer comments
      }

      const data: ScrapedData = {
        questionId,
        title: question.title || "",
        questionBody: question.body || "",
        questionScore: question.score || 0,
        viewCount: question.view_count || 0,
        favoriteCount: question.favorite_count || 0,
        creationDate: question.creation_date || 0,
        lastActivityDate: question.last_activity_date || 0,
        tags: question.tags || [],
        isAnswered: question.is_answered || false,
        acceptedAnswerId: question.accepted_answer_id,
        closeReason: question.close_reason,
        questionComments,
        author: {
          name: question.owner?.display_name || "Unknown",
          reputation: question.owner?.reputation || 0,
          userId: question.owner?.user_id || 0,
        },
        answers,
      };

      console.log(
        `✅ Fetched "${data.title.substring(0, 50)}..." (${answers.length} answers)`,
      );

      // Cache the result
      this.scrapedData.set(questionId, data);

      // Save to database and mark as scraped
      if (this.db) {
        console.log(`💾 Saving to database...`);
        this.saveToDatabase(data);
        console.log(`💾 Marking as scraped...`);
        this.markQuestionAsScraped(questionId);
        console.log(`💾 Done saving`);
      }

      return data;
    } catch (err) {
      console.error(`❌ Error fetching question ${questionId}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  // Batch scrape multiple questions
  async scrapeQuestions(questionIds: number[]): Promise<(ScrapedData | StoredQuestion)[]> {
    console.log(
      `🚀 Starting batch scrape of ${questionIds.length} questions...`,
    );

    // Filter out already scraped questions
    const unscrapedIds = questionIds.filter(
      (id) => !this.isQuestionScraped(id),
    );
    const alreadyScrapedCount = questionIds.length - unscrapedIds.length;

    if (alreadyScrapedCount > 0) {
      console.log(
        `📚 ${alreadyScrapedCount} questions already scraped, skipping them`,
      );
    }

    if (unscrapedIds.length === 0) {
      console.log(`🎉 All ${questionIds.length} questions already scraped!`);
      // Return the already scraped questions from database
      return questionIds
        .map((id) => this.getQuestion(id))
        .filter((q): q is StoredQuestion => q !== null);
    }

    console.log(`🔄 Will scrape ${unscrapedIds.length} new questions`);

    const results: (ScrapedData | StoredQuestion)[] = [];

    for (let i = 0; i < unscrapedIds.length; i++) {
      const id = unscrapedIds[i];
      console.log(
        `\n📊 Progress: ${i + 1}/${unscrapedIds.length} (${Math.round(((i + 1) / unscrapedIds.length) * 100)}%)`,
      );

      const data = await this.scrapeQuestion(id);
      if (data) {
        results.push(data);
      }

      // Rate limit: wait 2 seconds between questions to avoid hitting API limits
      if (i < unscrapedIds.length - 1) {
        await sleep(2000);
      }
    }

    console.log(
      `\n🎉 Batch scrape complete! Scraped ${results.length} new questions successfully.`,
    );
    return results;
  }

  // Smart scrape - automatically scrape unscraped questions
  async scrapeNextBatch(batchSize = 5): Promise<(ScrapedData | StoredQuestion)[]> {
    const unscrapedIds = this.getUnscrapedQuestionIds(batchSize);

    if (unscrapedIds.length === 0) {
      console.log(
        "🎉 No unscraped questions found! All questions have been scraped.",
      );
      return [];
    }

    console.log(
      `🤖 Smart scraping next ${unscrapedIds.length} unscraped questions...`,
    );
    return await this.scrapeQuestions(unscrapedIds);
  }

  // Save scraped data to SQLite
  async saveToDatabase(data: ScrapedData) {
    if (!this.db) {
      console.log("❌ Database not initialized. Call initDatabase() first.");
      return;
    }

    const db = this.db;
    db.execute("BEGIN TRANSACTION");

    try {
      // Insert question with all metadata
      db.query(
        `INSERT OR REPLACE INTO questions (
          id, title, body, score, view_count, answer_count,
          creation_date, last_activity_date, tags, is_answered,
          accepted_answer_id, author_name, author_reputation, author_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.questionId,
          data.title,
          data.questionBody,
          data.questionScore,
          data.viewCount,
          data.answers.length,
          data.creationDate,
          data.lastActivityDate,
          JSON.stringify(data.tags),
          data.isAnswered,
          data.acceptedAnswerId || null,
          data.author.name,
          data.author.reputation,
          data.author.userId,
        ],
      );

      // Clear existing comments and answers
      db.query("DELETE FROM question_comments WHERE question_id = ?", [
        data.questionId,
      ]);
      db.query(
        "DELETE FROM answer_comments WHERE answer_id IN (SELECT id FROM answers WHERE question_id = ?)",
        [data.questionId],
      );
      db.query("DELETE FROM answers WHERE question_id = ?", [
        data.questionId,
      ]);

      // Insert question comments with metadata
      data.questionComments.forEach((comment) => {
        db.query(
          `INSERT INTO question_comments (
            question_id, comment_text, score, creation_date,
            author_name, author_reputation, author_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            data.questionId,
            comment.text,
            comment.score,
            comment.creationDate,
            comment.author.name,
            comment.author.reputation,
            comment.author.userId,
          ],
        );
      });

      // Insert answers and their comments with metadata
      data.answers.forEach((answer, index) => {
        const result = db.query(
          `INSERT INTO answers (
            question_id, answer_id, answer_text, answer_order, score, is_accepted,
            creation_date, last_activity_date, author_name, author_reputation, author_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            data.questionId,
            answer.answerId,
            answer.answerText,
            index + 1,
            answer.score,
            answer.isAccepted,
            answer.creationDate,
            answer.lastActivityDate,
            answer.author.name,
            answer.author.reputation,
            answer.author.userId,
          ],
        );

        const dbAnswerId = result[0][0] as number;

        answer.comments.forEach((comment) => {
          db.query(
            `INSERT INTO answer_comments (
              answer_id, comment_text, score, creation_date,
              author_name, author_reputation, author_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              dbAnswerId,
              comment.text,
              comment.score,
              comment.creationDate,
              comment.author.name,
              comment.author.reputation,
              comment.author.userId,
            ],
          );
        });
      });

      db.execute("COMMIT");
    } catch (err) {
      db.execute("ROLLBACK");
      throw err;
    }
  }

  // Query database methods
  query(sql: string, params: any[] = []) {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return [];
    }
    return this.db.queryEntries(sql, params);
  }

  // Get database stats
  async getDatabaseStats() {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return;
    }

    const totalIds = Number(
      this.query("SELECT COUNT(*) as count FROM question_ids")[0]?.count || 0,
    );
    const scrapedIds = Number(
      this.query(
        "SELECT COUNT(*) as count FROM question_ids WHERE scraped = TRUE",
      )[0]?.count || 0,
    );
    const unscrapedIds = totalIds - scrapedIds;
    const questionCount = Number(
      this.query("SELECT COUNT(*) as count FROM questions")[0]?.count || 0,
    );
    const answerCount = Number(
      this.query("SELECT COUNT(*) as count FROM answers")[0]?.count || 0,
    );
    const questionCommentCount = Number(
      this.query("SELECT COUNT(*) as count FROM question_comments")[0]?.count ||
        0,
    );
    const answerCommentCount = Number(
      this.query("SELECT COUNT(*) as count FROM answer_comments")[0]?.count ||
        0,
    );

    console.log("\n📊 Database Statistics:");
    console.log(
      `  Question IDs: ${totalIds} total (${scrapedIds} scraped, ${unscrapedIds} unscraped)`,
    );
    console.log(`  Questions: ${questionCount}`);
    console.log(`  Answers: ${answerCount}`);
    console.log(`  Question Comments: ${questionCommentCount}`);
    console.log(`  Answer Comments: ${answerCommentCount}`);

    if (totalIds > 0) {
      const percentageScraped = Math.round((scrapedIds / totalIds) * 100);
      console.log(`  Progress: ${percentageScraped}% scraped`);
    }
  }

  // List questions in database
  listQuestions(limit = 10) {
    const questions = this.query(
      "SELECT id, title, substr(body, 1, 100) as preview, scraped_at FROM questions ORDER BY scraped_at DESC LIMIT ?",
      [limit],
    );

    if (questions.length === 0) {
      console.log("📭 No questions in database.");
      return;
    }

    console.log(`\n📋 Questions in Database (showing ${questions.length}):`);
    questions.forEach((q: any, index) => {
      console.log(`\n${index + 1}. ID: ${q.id}`);
      console.log(`   Title: ${q.title}`);
      console.log(`   Preview: ${q.preview}...`);
      console.log(`   Scraped: ${q.scraped_at}`);
    });
  }

  // Get a specific question from database
  getQuestion(questionId: number): StoredQuestion | null {
    const questions = this.query("SELECT * FROM questions WHERE id = ?", [
      questionId,
    ]);
    if (questions.length === 0) {
      console.log(`❌ Question ${questionId} not found in database.`);
      return null;
    }

    const question = questions[0] as { id: number; title: string; body: string };
    const questionComments = this.query(
      "SELECT comment_text FROM question_comments WHERE question_id = ?",
      [questionId],
    ) as { comment_text: string }[];
    const answers = this.query(
      "SELECT id, answer_text, answer_order FROM answers WHERE question_id = ? ORDER BY answer_order",
      [questionId],
    ) as { id: number; answer_text: string }[];

    // Get comments for each answer
    const answersWithComments = answers.map((answer) => {
      const comments = this.query(
        "SELECT comment_text FROM answer_comments WHERE answer_id = ?",
        [answer.id],
      ) as { comment_text: string }[];
      return {
        answerText: answer.answer_text,
        comments: comments.map((c) => c.comment_text),
      };
    });

    return {
      questionId: question.id,
      title: question.title,
      questionBody: question.body,
      questionComments: questionComments.map((c) => c.comment_text),
      answers: answersWithComments,
    };
  }

  // Print a question nicely
  printQuestion(data: ScrapedData | StoredQuestion | null) {
    if (!data) {
      console.log("❌ No data to display");
      return;
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`Question ID: ${data.questionId}`);
    console.log(`Title: ${data.title}`);
    console.log(`${"=".repeat(80)}`);

    console.log(`\n📝 QUESTION:`);
    console.log(
      data.questionBody.substring(0, 500) +
        (data.questionBody.length > 500 ? "..." : ""),
    );

    if (data.questionComments.length > 0) {
      console.log(`\n💬 QUESTION COMMENTS (${data.questionComments.length}):`);
      data.questionComments.slice(0, 3).forEach((c, i) => {
        const text = typeof c === "string" ? c : c.text;
        if (text.trim().length > 0) {
          console.log(
            `  ${i + 1}. ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`,
          );
        }
      });
      if (data.questionComments.length > 3) {
        console.log(
          `  ... and ${data.questionComments.length - 3} more comments`,
        );
      }
    }

    console.log(`\n✅ ANSWERS (${data.answers.length}):`);
    data.answers.forEach((a, i) => {
      console.log(`\n--- Answer ${i + 1} ---`);
      const answerText = a.answerText || "";
      console.log(
        answerText.substring(0, 400) + (answerText.length > 400 ? "..." : ""),
      );

      if (a.comments.length > 0) {
        console.log(`  💬 Comments (${a.comments.length}):`);
        a.comments.slice(0, 2).forEach((c, j) => {
          const text = typeof c === "string" ? c : c.text;
          if (text.trim().length > 0) {
            console.log(
              `    ${j + 1}. ${text.substring(0, 150)}${text.length > 150 ? "..." : ""}`,
            );
          }
        });
        if (a.comments.length > 2) {
          console.log(`    ... and ${a.comments.length - 2} more comments`);
        }
      }
    });
  }

  // Search questions in database
  searchQuestions(searchTerm: string, limit = 5) {
    const questions = this.query(
      `SELECT id, title, substr(body, 1, 200) as preview
       FROM questions
       WHERE title LIKE ? OR body LIKE ?
       ORDER BY id DESC
       LIMIT ?`,
      [`%${searchTerm}%`, `%${searchTerm}%`, limit],
    );

    if (questions.length === 0) {
      console.log(`❌ No questions found matching "${searchTerm}"`);
      return [];
    }

    console.log(
      `\n🔍 Search Results for "${searchTerm}" (${questions.length} found):`,
    );
    questions.forEach((q: any, index) => {
      console.log(`\n${index + 1}. ID: ${q.id}`);
      console.log(`   Title: ${q.title}`);
      console.log(`   Preview: ${q.preview}...`);
    });

    return questions.map((q: any) => q.id);
  }

  // Reset scraped status for a question (allows re-scraping)
  resetScrapedStatus(questionId: number) {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return;
    }

    this.db.query(
      "UPDATE question_ids SET scraped = FALSE, scraped_at = NULL WHERE id = ?",
      [questionId],
    );
    console.log(`🔄 Reset scraped status for question ${questionId}`);
  }

  // Delete a question and all its related data
  deleteQuestion(questionId: number) {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return;
    }

    const db = this.db;
    db.execute("BEGIN TRANSACTION");

    try {
      // Delete answer comments first
      db.query(
        "DELETE FROM answer_comments WHERE answer_id IN (SELECT id FROM answers WHERE question_id = ?)",
        [questionId],
      );
      // Delete question comments
      db.query("DELETE FROM question_comments WHERE question_id = ?", [questionId]);
      // Delete answers
      db.query("DELETE FROM answers WHERE question_id = ?", [questionId]);
      // Delete question
      db.query("DELETE FROM questions WHERE id = ?", [questionId]);
      // Reset scraped status
      db.query(
        "UPDATE question_ids SET scraped = FALSE, scraped_at = NULL WHERE id = ?",
        [questionId],
      );

      db.execute("COMMIT");
      console.log(`🗑️  Deleted question ${questionId} and all related data`);
    } catch (err) {
      db.execute("ROLLBACK");
      throw err;
    }
  }

  // Get unembedded questions
  getUnembeddedQuestions(limit = 50): { id: number; title: string }[] {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return [];
    }

    const result = this.query(
      `SELECT id, title FROM questions
       WHERE id NOT IN (SELECT question_id FROM question_embeddings)
       LIMIT ?`,
      [limit],
    );

    return result.map((row: any) => ({
      id: row.id,
      title: row.title,
    }));
  }

  // Embed next batch of questions
  async embedNextBatch(count: number | "all" = 50) {
    // If "all", get total count first for progress
    if (count === "all") {
      const totalUnembedded = Number(
        this.query(
          "SELECT COUNT(*) as count FROM questions WHERE id NOT IN (SELECT question_id FROM question_embeddings)"
        )[0]?.count || 0
      );

      if (totalUnembedded === 0) {
        console.log("🎉 All questions have embeddings!");
        return;
      }

      console.log(`🤖 Embedding all ${totalUnembedded} unembedded questions...`);

      // Get all unembedded questions at once for accurate progress
      const allUnembedded = this.getUnembeddedQuestions(totalUnembedded);
      await this.embedBatch(allUnembedded);
      return;
    }

    const unembedded = this.getUnembeddedQuestions(count);

    if (unembedded.length === 0) {
      console.log("🎉 All questions have embeddings!");
      return;
    }

    console.log(`🤖 Embedding ${unembedded.length} questions...`);
    await this.embedBatch(unembedded);
  }

  // Progress bar helper
  private progressBar(current: number, total: number, width = 30): string {
    const pct = current / total;
    const filled = Math.round(width * pct);
    const empty = width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return `[${bar}] ${current}/${total} (${(pct * 100).toFixed(0)}%)`;
  }

  // Helper method to embed a batch of questions
  private async embedBatch(questions: { id: number; title: string }[]) {
    const { batchGenerateEmbeddings, serializeEmbedding } = await loadEmbeddings();
    const total = questions.length;
    let completed = 0;

    // Process in batches of 20 for DB transactions
    const batchSize = 20;
    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);

      const texts = batch.map((q) => q.title);
      const embeddings = await batchGenerateEmbeddings(texts, (current: number) => {
        const overall = completed + current;
        const status = this.progressBar(overall, total);
        Deno.stdout.writeSync(new TextEncoder().encode(`\r🔄 ${status}`));
      });

      // Save to database
      if (this.db) {
        this.db.execute("BEGIN TRANSACTION");
        try {
          for (let j = 0; j < batch.length; j++) {
            const questionId = batch[j].id;
            const embedding = embeddings[j];
            const blob = serializeEmbedding(embedding);

            this.db.query(
              "INSERT OR REPLACE INTO question_embeddings (question_id, embedding) VALUES (?, ?)",
              [questionId, blob],
            );
          }
          this.db.execute("COMMIT");
        } catch (err) {
          this.db.execute("ROLLBACK");
          throw err;
        }
      }

      completed += batch.length;
    }
    console.log(`\n✅ Embedded ${completed} questions`);
  }

  // Re-embed existing questions
  async reembedQuestions(limit?: number) {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return;
    }

    const query = limit
      ? `SELECT id, title FROM questions LIMIT ?`
      : `SELECT id, title FROM questions`;
    const params = limit ? [limit] : [];

    const questions = this.query(query, params).map((row: any) => ({
      id: row.id,
      title: row.title,
    }));

    if (questions.length === 0) {
      console.log("❌ No questions found to embed.");
      return;
    }

    console.log(`🔄 Re-embedding ${questions.length} questions...`);
    await this.embedBatch(questions);
  }

  // Get embedding statistics
  getEmbeddingStats() {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return;
    }

    const totalQuestions = Number(
      this.query("SELECT COUNT(*) as count FROM questions")[0]?.count || 0,
    );
    const embeddedQuestions = Number(
      this.query("SELECT COUNT(*) as count FROM question_embeddings")[0]?.count ||
        0,
    );
    const unembeddedQuestions = totalQuestions - embeddedQuestions;

    // Get last embedded timestamp
    const lastEmbedded = this.query(
      "SELECT created_at FROM question_embeddings ORDER BY created_at DESC LIMIT 1",
    )[0]?.created_at;

    // Get database size of embeddings table
    const dbSize = this.query("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")[0]?.size || 0;

    console.log("\n📊 Embedding Statistics:");
    console.log(`  Total questions: ${totalQuestions}`);
    console.log(`  Embedded: ${embeddedQuestions}`);
    console.log(`  Unembedded: ${unembeddedQuestions}`);

    if (totalQuestions > 0) {
      const percentageEmbedded = Math.round(
        (embeddedQuestions / totalQuestions) * 100,
      );
      console.log(`  Coverage: ${percentageEmbedded}%`);
    }

    if (lastEmbedded) {
      console.log(`  Last embedded: ${lastEmbedded}`);
    }

    console.log(`  Database size: ${(Number(dbSize) / 1024 / 1024).toFixed(2)} MB`);
  }

  // Truncate all scraped data (keeps question IDs)
  truncateScrapedData() {
    if (!this.db) {
      console.log("❌ Database not initialized.");
      return;
    }

    const db = this.db;
    db.execute("BEGIN TRANSACTION");

    try {
      db.execute("DELETE FROM answer_comments");
      db.execute("DELETE FROM question_comments");
      db.execute("DELETE FROM answers");
      db.execute("DELETE FROM questions");
      db.execute("UPDATE question_ids SET scraped = FALSE, scraped_at = NULL");

      db.execute("COMMIT");
      console.log("🗑️  Truncated all scraped data (question IDs preserved)");
    } catch (err) {
      db.execute("ROLLBACK");
      throw err;
    }
  }

  // Close database connection
  closeDatabase() {
    if (this.db) {
      this.db.close();
      console.log("🔒 Database connection closed.");
    }
  }
}

// Create a global instance for interactive use
export const scraper = new InteractiveStackOverflowScraper();

// Helper functions for REPL
export async function init(dbPath = "sqlite.db") {
  await scraper.initDatabase(dbPath);
}

export async function fetchIds(pages = 1) {
  return await scraper.fetchQuestionIds(pages);
}

export function showIds(limit = 20) {
  scraper.displayQuestionIds(limit);
}

export function getIds(start = 0, count = 10) {
  return scraper.getQuestionIds(start, count);
}

export async function scrapeOne(questionId: number) {
  return await scraper.scrapeQuestion(questionId);
}

export async function scrapeMany(questionIds: number[]) {
  return await scraper.scrapeQuestions(questionIds);
}

export function showUnscraped(limit = 20) {
  scraper.displayUnscrapedIds(limit);
}

export async function scrapeNext(batchSize = 5) {
  return await scraper.scrapeNextBatch(batchSize);
}

export function stats() {
  return scraper.getDatabaseStats();
}

export function list(limit = 10) {
  scraper.listQuestions(limit);
}

export function get(questionId: number) {
  return scraper.getQuestion(questionId);
}

export function print(questionId: number) {
  const data = scraper.getQuestion(questionId);
  scraper.printQuestion(data);
}

export function search(term: string, limit = 5) {
  return scraper.searchQuestions(term, limit);
}

export async function rescrape(questionId: number) {
  scraper.resetScrapedStatus(questionId);
  return await scraper.scrapeQuestion(questionId);
}

export async function rescrapeAll(limit = 10) {
  const scrapedIds = scraper.getScrapedQuestionIds(limit);
  console.log(`🔄 Re-scraping ${scrapedIds.length} questions...`);
  for (const id of scrapedIds) {
    scraper.resetScrapedStatus(id);
  }
  return await scraper.scrapeQuestions(scrapedIds);
}

export function deleteQuestion(questionId: number) {
  scraper.deleteQuestion(questionId);
}

export function truncate() {
  scraper.truncateScrapedData();
}

export function close() {
  scraper.closeDatabase();
}

export async function embedNext(count: number | "all" = 50) {
  await scraper.embedNextBatch(count);
}

export async function reembed(limit?: number | "all") {
  if (limit === "all") {
    await scraper.reembedQuestions();
  } else {
    await scraper.reembedQuestions(limit);
  }
}

export function embedStats() {
  scraper.getEmbeddingStats();
}

export async function semanticSearch(query: string, limit = 10) {
  if (!scraper["db"]) {
    console.log("❌ Database not initialized.");
    return;
  }

  console.log(`\n🔍 Semantic search: "${query}"\n`);

  // Generate embedding for query
  const { generateEmbedding, deserializeEmbedding } = await import("./embeddings.ts");
  const queryEmbedding = await generateEmbedding(query);

  // Get all question embeddings from database
  const embeddingsData = scraper.query(
    `SELECT qe.question_id, q.title, qe.embedding
     FROM question_embeddings qe
     JOIN questions q ON qe.question_id = q.id`
  );

  if (embeddingsData.length === 0) {
    console.log("❌ No embeddings found. Run 'embedNext all' first.");
    return;
  }

  // Compute similarity scores
  interface ScoredResult {
    question_id: number;
    score: number;
    question_title: string;
  }

  const results: ScoredResult[] = embeddingsData.map((row: any) => {
    const embedding = deserializeEmbedding(new Uint8Array(row.embedding as ArrayBuffer));
    const score = cosineSimilarity(queryEmbedding, embedding);
    return {
      question_id: row.question_id as number,
      score,
      question_title: row.title as string,
    };
  });

  // Sort by score descending and take top N
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, limit);

  console.log(`📊 Found ${topResults.length} results:\n`);

  topResults.forEach((result, index) => {
    const similarity = (result.score * 100).toFixed(1);
    console.log(`${index + 1}. [${similarity}%] Q${result.question_id}: ${result.question_title}`);
    console.log(`   https://stackoverflow.com/questions/${result.question_id}\n`);
  });
}

// Cosine similarity helper
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// CLI Interface
async function main() {
  const args = Deno.args;
  const command = args[0];

  if (!command) {
    console.log(`
Usage: deno run --allow-net --allow-read --allow-write scraper.ts <command> [args]

Commands:
  init                    Initialize database connection
  stats                   Show database statistics
  list [limit]            List scraped questions (default: 10)
  scrapeNext [count]      Scrape next N unscraped questions (default: 5)
  scrapeOne <id>          Scrape a specific question by ID
  print <id>              Print a specific question
  search <term> [limit]   Search questions (default limit: 5)
  fetchIds [pages]        Fetch question IDs from API (default: 1 page)
  rescrape <id>           Re-scrape a specific question (fetch fresh data)
  rescrapeAll [limit]     Re-scrape N already-scraped questions (default: 10)
  delete <id>             Delete a question and all its data
  truncate                Delete ALL scraped data (keeps question IDs)
  embedNext [count|all]   Embed next N unembedded question titles (default: 50) or 'all' remaining
  reembed [limit|all]     Regenerate embeddings for N or all question titles
  embedStats              Show embedding coverage statistics
  semanticSearch <query>  Search questions using semantic similarity (default: 10 results)

Examples:
  deno run --allow-net --allow-read --allow-write scraper.ts scrapeNext 10
  deno run --allow-net --allow-read --allow-write scraper.ts embedNext 100
  deno run --allow-net --allow-read --allow-write scraper.ts embedNext all
  deno run --allow-net --allow-read --allow-write scraper.ts embedStats
  deno run --allow-net --allow-read --allow-write scraper.ts semanticSearch "best index for arrays"
  deno run --allow-net --allow-read --allow-write scraper.ts rescrape 866465
  deno run --allow-net --allow-read --allow-write scraper.ts truncate
`);
    return;
  }

  // Always init first for commands that need the database
  if (command !== "help") {
    await init();
  }

  switch (command) {
    case "init":
      // Already initialized above
      break;

    case "stats":
      await stats();
      break;

    case "list": {
      const limit = parseInt(args[1]) || 10;
      list(limit);
      break;
    }

    case "scrapeNext": {
      const count = parseInt(args[1]) || 5;
      await scrapeNext(count);
      break;
    }

    case "scrapeOne": {
      const id = parseInt(args[1]);
      if (!id) {
        console.error("❌ Please provide a question ID");
        Deno.exit(1);
      }
      await scrapeOne(id);
      break;
    }

    case "print": {
      const id = parseInt(args[1]);
      if (!id) {
        console.error("❌ Please provide a question ID");
        Deno.exit(1);
      }
      print(id);
      break;
    }

    case "search": {
      const term = args[1];
      if (!term) {
        console.error("❌ Please provide a search term");
        Deno.exit(1);
      }
      const limit = parseInt(args[2]) || 5;
      search(term, limit);
      break;
    }

    case "fetchIds": {
      const pages = parseInt(args[1]) || 1;
      await fetchIds(pages);
      break;
    }

    case "rescrape": {
      const id = parseInt(args[1]);
      if (!id) {
        console.error("❌ Please provide a question ID");
        Deno.exit(1);
      }
      await rescrape(id);
      break;
    }

    case "rescrapeAll": {
      const limit = parseInt(args[1]) || 10;
      await rescrapeAll(limit);
      break;
    }

    case "delete": {
      const id = parseInt(args[1]);
      if (!id) {
        console.error("❌ Please provide a question ID");
        Deno.exit(1);
      }
      deleteQuestion(id);
      break;
    }

    case "truncate": {
      truncate();
      break;
    }

    case "embedNext": {
      const countArg = args[1];
      const count = countArg === "all" ? "all" : (parseInt(countArg) || 50);
      await embedNext(count);
      break;
    }

    case "reembed": {
      const limitArg = args[1];
      const limit = limitArg === "all" ? "all" : (limitArg ? parseInt(limitArg) : undefined);
      await reembed(limit);
      break;
    }

    case "embedStats": {
      embedStats();
      break;
    }

    case "semanticSearch": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("❌ Please provide a search query");
        Deno.exit(1);
      }
      const limit = 10; // Default to 10 results
      await semanticSearch(query, limit);
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      Deno.exit(1);
  }

  close();
}

main();
