#!/usr/bin/env bun
// Semantic search CLI
import { DB } from "./db.ts";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: bun search.ts <query> [limit]

Examples:
  bun search.ts "optimize postgresql queries"
  bun search.ts "recursive SQL" 5
`);
    process.exit(1);
  }

  const limit = args[args.length - 1].match(/^\d+$/)
    ? parseInt(args.pop()!)
    : 10;
  const query = args.join(" ");

  console.log(`\n🔍 Semantic search: "${query}"\n`);

  const db = DB.init();
  const results = await db.semanticSearch(query, limit);

  if (results.length === 0) {
    console.log("❌ No results found.");
    return;
  }

  console.log(`📊 Found ${results.length} results:\n`);

  results.forEach((result, index) => {
    const similarity = (result.score * 100).toFixed(1);
    console.log(`${index + 1}. [${similarity}%] Q${result.question_id}: ${result.question_title}`);
    console.log(`   Answer preview: ${result.answer_text.replace(/<[^>]*>/g, '').slice(0, 150)}...`);
    console.log(`   https://stackoverflow.com/questions/${result.question_id}\n`);
  });
}

main().catch(console.error);
