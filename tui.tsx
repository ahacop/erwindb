import { existsSync } from "node:fs";
import { join } from "node:path";
import { ERWINDB_HOME, PATHS, getPaths, isDevelopment, isCompiledBinary } from "./paths.ts";
import React, { useState, useEffect } from "react";
import { render, Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import { convert } from "html-to-text";
import { DB, QuestionRow } from "./db.ts";
import { IndexPage } from "./IndexPage.tsx";
import { ShowPage } from "./ShowPage.tsx";
import { SortColumn, SortDirection } from "./utils.tsx";

// Loading spinner
function Loading() {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;

  return (
    <Box flexDirection="column" minHeight={terminalHeight}>
      <Box>
        <Text backgroundColor="blue" color="white" bold>
          {" ErwinDB ".padEnd(terminalWidth)}
        </Text>
      </Box>
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading database...</Text>
      </Box>
      <Box>
        <Text backgroundColor="gray" color="black">
          {" ".repeat(terminalWidth)}
        </Text>
      </Box>
    </Box>
  );
}

// Main App Component
function App() {
  const { stdout } = useStdout();
  const [page, setPage] = useState<"index" | "show">("index");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [database, setDatabase] = useState<DB | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchTerm, setSearchTerm] = useState("");

  const terminalWidth = stdout?.columns || 80;

  useEffect(() => {
    const db = DB.init();
    setDatabase(db);
    const rawQuestions = db.getQuestions();
    const decodedQuestions = rawQuestions.map((q) => ({
      ...q,
      title: convert(q.title, { wordwrap: false }),
    }));
    setQuestions(decodedQuestions);
    setLoading(false);
  }, []);

  if (loading) {
    return <Loading />;
  }

  if (questions.length === 0) {
    return (
      <Box flexDirection="column" minHeight={stdout?.rows || 24}>
        <Box>
          <Text backgroundColor="blue" color="white" bold>
            {" ErwinDB ".padEnd(terminalWidth)}
          </Text>
        </Box>
        <Box flexGrow={1} flexDirection="column" padding={1}>
          <Text color="yellow">No questions found in database.</Text>
          <Text dimColor>
            Run: deno run --allow-net --allow-read --allow-write scraper.ts
            scrapeNext 10
          </Text>
        </Box>
        <Box>
          <Text backgroundColor="gray" color="black">
            {" q:quit".padEnd(terminalWidth)}
          </Text>
        </Box>
      </Box>
    );
  }

  if (page === "show" && selectedId !== null && database) {
    return (
      <ShowPage
        db={database}
        questionId={selectedId}
        onBack={() => setPage("index")}
        onNavigate={setSelectedId}
      />
    );
  }

  return (
    <IndexPage
      questions={questions}
      db={database!}
      initialSelectedId={selectedId}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      onSortChange={(column, direction) => {
        setSortColumn(column);
        setSortDirection(direction);
      }}
      onSelect={(id) => {
        setSelectedId(id);
        setPage("show");
      }}
    />
  );
}

// Diagnostics check
function runDiagnostics(): void {
  const paths = getPaths();
  console.log(`ERWINDB_HOME: ${ERWINDB_HOME}`);
  console.log(`Mode: ${isCompiledBinary ? "compiled binary" : "development (bun)"}\n`);

  // Core checks (required)
  const coreChecks = [
    { name: "Database", path: paths.database },
    { name: "sqlite-vec", path: paths.sqliteVec },
  ];

  // Model checks (only required in production)
  const modelSubdir = "sentence-transformers/all-MiniLM-L6-v2";
  const modelChecks = [
    { name: "Model config", path: join(paths.models, modelSubdir, "config.json") },
    { name: "Model ONNX", path: join(paths.models, modelSubdir, "onnx", "model.onnx") },
  ];

  // WASM checks (only required in production)
  const wasmChecks = [
    { name: "ONNX WASM", path: join(ERWINDB_HOME, "wasm", "ort-wasm-simd-threaded.wasm") },
  ];

  let allPassed = true;

  // Check core paths
  for (const { name, path } of coreChecks) {
    if (path === null) {
      console.log(`- ${name}: using npm package (dev mode)`);
      continue;
    }
    const exists = existsSync(path);
    console.log(`${exists ? "✓" : "✗"} ${name}: ${path}`);
    if (!exists) allPassed = false;
  }

  // Check model paths (optional in dev mode)
  for (const { name, path } of modelChecks) {
    const exists = existsSync(path);
    if (isDevelopment) {
      console.log(
        `${exists ? "✓" : "-"} ${name}: ${exists ? path : "will download on-demand"}`
      );
    } else {
      console.log(`${exists ? "✓" : "✗"} ${name}: ${path}`);
      if (!exists) allPassed = false;
    }
  }

  // Check WASM paths (only in production)
  for (const { name, path } of wasmChecks) {
    if (isDevelopment) {
      console.log(`- ${name}: using node_modules (dev mode)`);
    } else {
      const exists = existsSync(path);
      console.log(`${exists ? "✓" : "✗"} ${name}: ${path}`);
      if (!exists) allPassed = false;
    }
  }

  // Test database and sqlite-vec loading
  console.log("");
  try {
    const db = DB.init();
    console.log("✓ Database opens successfully");

    // Test a simple query
    const questions = db.getQuestions();
    console.log(`✓ Database contains ${questions.length} questions`);
  } catch (e) {
    console.log(`✗ Database failed: ${(e as Error).message}`);
    allPassed = false;
  }

  process.exit(allPassed ? 0 : 1);
}

// Handle --check flag
if (process.argv.includes("--check")) {
  runDiagnostics();
} else {
  // Render the app
  render(<App />);
}
