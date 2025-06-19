import React, { useState, useMemo, useRef, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { VirtualList } from "ink-virtual-list";
import fuzzysort from "fuzzysort";
import { DB, QuestionRow } from "./db.ts";
import {
  formatDate,
  formatNumber,
  getScrollIndicator,
  SortColumn,
  SortDirection,
  openInBrowser,
} from "./utils.tsx";

// Index Page Component
export function IndexPage({
  questions,
  db,
  initialSelectedId,
  sortColumn: externalSortColumn,
  sortDirection: externalSortDirection,
  searchTerm,
  setSearchTerm,
  onSortChange,
  onSelect,
}: {
  questions: QuestionRow[];
  db: DB;
  initialSelectedId: number | null;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  onSortChange: (column: SortColumn, direction: SortDirection) => void;
  onSelect: (id: number) => void;
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const sortColumn = externalSortColumn;
  const sortDirection = externalSortDirection;
  const [searchType, setSearchType] = useState<"title" | "semantic" | null>(null);
  const [semanticInput, setSemanticInput] = useState(""); // Input buffer for semantic search (separate from searchTerm)
  const [semanticResults, setSemanticResults] = useState<number[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");

  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const visibleRows = terminalHeight - 3; // header + column header + status bar

  // Debug counter for filteredAndSortedQuestions
  const filteredQuestionsRecomputeCount = useRef(0);

  // Column widths
  const idWidth = 8;
  const dateWidth = 13;
  const scoreWidth = 6;
  const viewsWidth = 7;
  const answersWidth = 4;

  // Filter and sort questions (memoized to prevent flicker)
  const filteredAndSortedQuestions = useMemo(() => {
    // When semantic results are present, filter and preserve semantic ordering
    if (semanticResults !== null) {
      const questionMap = new Map(questions.map((q) => [q.id, q]));
      return semanticResults
        .map((id) => questionMap.get(id))
        .filter((q): q is QuestionRow => q !== undefined)
        .map((q) => ({
          question: q,
          result: null as Fuzzysort.KeyResult<QuestionRow> | null,
        }));
    }

    // When fuzzy searching, use fuzzysort's ranking (don't re-sort by column)
    if (searchTerm) {
      const results = fuzzysort.go(searchTerm, questions, {
        key: "title",
        threshold: 0.5,
      });
      return results.map((r) => ({ question: r.obj, result: r }));
    }

    // When not searching, sort by selected column
    const sorted = [...questions].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case "id":
          comparison = a.id - b.id;
          break;
        case "date":
          comparison = a.creation_date - b.creation_date;
          break;
        case "score":
          comparison = a.score - b.score;
          break;
        case "views":
          comparison = a.view_count - b.view_count;
          break;
        case "answers":
          comparison = a.answer_count - b.answer_count;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted.map((q) => ({
      question: q,
      result: null as Fuzzysort.KeyResult<QuestionRow> | null,
    }));
  }, [questions, sortColumn, sortDirection, searchTerm, semanticResults]);

  const fixedWidth =
    3 + idWidth + dateWidth + scoreWidth + viewsWidth + answersWidth + 5; // selector + spaces
  const titleWidth = Math.max(20, terminalWidth - fixedWidth);

  // Pre-calculate all formatted data (memoized to avoid recalculation on scroll)
  const formattedQuestions = useMemo(() => {
    return filteredAndSortedQuestions.map(({ question: q, result }) => {
      const truncatedTitle =
        q.title.length > titleWidth
          ? q.title.slice(0, titleWidth - 3) + "..."
          : q.title;

      return {
        id: q.id,
        title: q.title,
        hasAccepted: q.accepted_answer_id !== null,
        score: q.score,
        formattedId: q.id.toString().padStart(idWidth),
        formattedDate: formatDate(q.creation_date).padEnd(dateWidth),
        formattedScore: q.score.toString().padStart(scoreWidth),
        formattedViews: formatNumber(q.view_count).padStart(viewsWidth),
        formattedAnswers: q.answer_count.toString().padStart(answersWidth),
        formattedTitle: truncatedTitle,
        fuzzyResult: result,
      };
    });
  }, [
    filteredAndSortedQuestions,
    idWidth,
    dateWidth,
    scoreWidth,
    viewsWidth,
    answersWidth,
    titleWidth,
  ]);

  // Initialize selectedIndex based on initialSelectedId
  const initialIndex = useMemo(() => {
    if (initialSelectedId === null) return 0;
    const idx = formattedQuestions.findIndex((q) => q.id === initialSelectedId);
    return idx >= 0 ? idx : 0;
  }, [initialSelectedId, formattedQuestions]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // Clamp selectedIndex when filtered results change
  useEffect(() => {
    if (
      selectedIndex >= formattedQuestions.length &&
      formattedQuestions.length > 0
    ) {
      setSelectedIndex(formattedQuestions.length - 1);
    }
  }, [formattedQuestions.length, selectedIndex]);

  // Execute semantic search
  const executeSemanticSearch = async (query: string) => {
    if (!query.trim()) return;
    setSemanticLoading(true);
    try {
      const results = await db.semanticSearch(query, 20);
      // Extract unique question IDs while preserving order
      const questionIds: number[] = [];
      const seen = new Set<number>();
      for (const result of results) {
        if (!seen.has(result.question_id)) {
          seen.add(result.question_id);
          questionIds.push(result.question_id);
        }
      }
      setSemanticResults(questionIds);
      setSemanticQuery(query);
      setSelectedIndex(0);
    } catch (error) {
      // Semantic search failed - log error and return to normal view
      console.error("Semantic search failed:", error);
      setSemanticResults(null);
      setSemanticQuery("");
    } finally {
      setSemanticLoading(false);
    }
  };

  useInput((input, key) => {
    // Don't handle input while semantic search is loading
    if (semanticLoading) return;

    // Title search mode handling (uses searchTerm, filters live)
    if (searchType === "title") {
      if (key.escape) {
        setSearchType(null);
        setSearchTerm("");
        setSelectedIndex(0);
        return;
      }
      if (key.return) {
        setSearchType(null);
        return;
      }
      if (key.ctrl && input === "u") {
        setSearchTerm("");
        setSelectedIndex(0);
        return;
      }
      if (key.ctrl && input === "w") {
        setSearchTerm((prev) => prev.replace(/\s*\S+\s*$/, ""));
        setSelectedIndex(0);
        return;
      }
      if (key.backspace || key.delete || (key.ctrl && input === "h")) {
        setSearchTerm((prev) => prev.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchTerm((prev) => prev + input);
        setSelectedIndex(0);
        return;
      }
      return;
    }

    // Semantic search mode handling (uses semanticInput, only searches on Enter)
    if (searchType === "semantic") {
      if (key.escape) {
        setSearchType(null);
        setSemanticInput("");
        return;
      }
      if (key.return) {
        if (semanticInput.trim()) {
          executeSemanticSearch(semanticInput);
        }
        setSearchType(null);
        setSemanticInput("");
        return;
      }
      if (key.ctrl && input === "u") {
        setSemanticInput("");
        return;
      }
      if (key.ctrl && input === "w") {
        setSemanticInput((prev) => prev.replace(/\s*\S+\s*$/, ""));
        return;
      }
      if (key.backspace || key.delete || (key.ctrl && input === "h")) {
        setSemanticInput((prev) => prev.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSemanticInput((prev) => prev + input);
        return;
      }
      return;
    }

    if (input === "q") {
      // If in semantic search results view, clear and return to normal
      if (semanticResults !== null) {
        setSemanticResults(null);
        setSemanticQuery("");
        setSelectedIndex(0);
        return;
      }
      // If in fuzzy search results view, clear search and return to normal
      if (searchTerm) {
        setSearchTerm("");
        setSelectedIndex(0);
        return;
      }
      // Otherwise exit the app
      exit();
      return;
    }

    // Enter title search mode
    if (input === "/") {
      setSearchType("title");
      setSearchTerm("");
      return;
    }

    // Enter semantic search mode
    if (input === "?") {
      setSearchType("semantic");
      setSearchTerm("");
      return;
    }

    // Clear search with Escape
    if (key.escape) {
      if (semanticResults !== null) {
        setSemanticResults(null);
        setSemanticQuery("");
        setSelectedIndex(0);
        return;
      }
      if (searchTerm) {
        setSearchTerm("");
        setSelectedIndex(0);
        return;
      }
    }

    // Sort by column (1-5 keys)
    const sortKeys: { [key: string]: SortColumn } = {
      "1": "id",
      "2": "date",
      "3": "score",
      "4": "views",
      "5": "answers",
    };
    if (sortKeys[input]) {
      const newColumn = sortKeys[input];
      if (sortColumn === newColumn) {
        // Toggle direction
        onSortChange(newColumn, sortDirection === "asc" ? "desc" : "asc");
      } else {
        // New column, default to desc
        onSortChange(newColumn, "desc");
      }
      setSelectedIndex(0);
      return;
    }

    if (input === "j" || key.downArrow) {
      setSelectedIndex((prev) =>
        Math.min(prev + 1, formattedQuestions.length - 1),
      );
    }

    if (input === "k" || key.upArrow) {
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    }

    if (input === "g") {
      setSelectedIndex(0);
    }

    if (input === "G") {
      setSelectedIndex(formattedQuestions.length - 1);
    }

    if (input === " ") {
      setSelectedIndex((prev) =>
        Math.min(prev + visibleRows, formattedQuestions.length - 1),
      );
    }

    if (key.ctrl && input === "d") {
      const halfPage = Math.floor(visibleRows / 2);
      setSelectedIndex((prev) =>
        Math.min(prev + halfPage, formattedQuestions.length - 1),
      );
    }

    if (key.ctrl && input === "u") {
      const halfPage = Math.floor(visibleRows / 2);
      setSelectedIndex((prev) => Math.max(prev - halfPage, 0));
    }

    if (key.return) {
      if (formattedQuestions[selectedIndex]) {
        onSelect(formattedQuestions[selectedIndex].id);
      }
    }

    if (input === "o") {
      if (formattedQuestions[selectedIndex]) {
        const url = `https://stackoverflow.com/questions/${formattedQuestions[selectedIndex].id}`;
        openInBrowser(url);
      }
    }
  });

  const getSortIndicator = (col: SortColumn) => {
    if (sortColumn !== col) return " ";
    return sortDirection === "asc" ? "▲" : "▼";
  };

  return (
    <Box flexDirection="column" minHeight={terminalHeight}>
      {/* Header */}
      <Box>
        {searchType === "title" ? (
          <Text backgroundColor="yellow" color="black" bold>
            {` /${searchTerm}█`.padEnd(terminalWidth)}
          </Text>
        ) : searchType === "semantic" ? (
          <Text backgroundColor="magenta" color="white" bold>
            {` ? ${semanticInput}█`.padEnd(terminalWidth)}
          </Text>
        ) : semanticLoading ? (
          <Text backgroundColor="magenta" color="white" bold>
            {` Searching... `.padEnd(terminalWidth)}
          </Text>
        ) : semanticResults !== null ? (
          <Text backgroundColor="magenta" color="white" bold>
            {` ErwinDB (${formattedQuestions.length} results for "${semanticQuery}") `.padEnd(
              terminalWidth,
            )}
          </Text>
        ) : searchTerm ? (
          <Text backgroundColor="blue" color="white" bold>
            {` ErwinDB (${formattedQuestions.length}/${questions.length} matching "${searchTerm}") `.padEnd(
              terminalWidth,
            )}
          </Text>
        ) : (
          <Text backgroundColor="blue" color="white" bold>
            {` ErwinDB (${questions.length} questions) `.padEnd(terminalWidth)}
          </Text>
        )}
      </Box>

      {/* Column headers */}
      <Box>
        <Text dimColor>{"   "}</Text>
        <Text
          dimColor
          bold
        >{`${"ID".padStart(idWidth - 1)}${getSortIndicator("id")} `}</Text>
        <Text
          dimColor
          bold
        >{`${"Date".padEnd(dateWidth - 1)}${getSortIndicator("date")} `}</Text>
        <Text
          dimColor
          bold
        >{`${"Score".padStart(scoreWidth - 1)}${getSortIndicator("score")} `}</Text>
        <Text
          dimColor
          bold
        >{`${"Views".padStart(viewsWidth - 1)}${getSortIndicator("views")} `}</Text>
        <Text
          dimColor
          bold
        >{`${"A".padStart(answersWidth - 1)}${getSortIndicator("answers")} `}</Text>
        <Text dimColor bold wrap="truncate">
          {"Title"}
        </Text>
      </Box>

      {/* Content area */}
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        <VirtualList
          items={formattedQuestions}
          selectedIndex={selectedIndex}
          height={visibleRows}
          itemHeight={1}
          showOverflowIndicators={false}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item: q, isSelected }) => (
            <Box height={1}>
              {isSelected ? (
                <Text backgroundColor="cyan" color="black" bold>
                  {" > "}
                </Text>
              ) : (
                <Text>{"   "}</Text>
              )}
              <Text color={isSelected ? "cyan" : "gray"}>{q.formattedId} </Text>
              <Text color={isSelected ? "white" : "gray"}>
                {q.formattedDate}{" "}
              </Text>
              <Text
                color={
                  q.score > 0
                    ? isSelected
                      ? "white"
                      : "green"
                    : isSelected
                      ? "white"
                      : "gray"
                }
              >
                {q.formattedScore}{" "}
              </Text>
              <Text color={isSelected ? "white" : "gray"}>
                {q.formattedViews}{" "}
              </Text>
              <Text
                color={
                  q.hasAccepted
                    ? isSelected
                      ? "white"
                      : "green"
                    : isSelected
                      ? "white"
                      : "gray"
                }
              >
                {q.formattedAnswers}{" "}
              </Text>
              <Text color={isSelected ? "white" : undefined} bold={isSelected}>
                {q.fuzzyResult
                  ? q.fuzzyResult.highlight((m, i) => (
                      <Text key={i} color="yellow" bold>
                        {m}
                      </Text>
                    ))
                  : q.formattedTitle}
              </Text>
            </Box>
          )}
        />
      </Box>

      {/* Status bar */}
      <Box>
        <Text backgroundColor="gray" color="black">
          {(searchType === "title"
            ? ` Type to search by title, Enter to confirm, Esc to cancel`
            : searchType === "semantic"
              ? ` Type your question, Enter to search, Esc to cancel`
              : semanticLoading
                ? ` Generating embedding and searching...`
                : ` j/k:move  Space/Ctrl-d/u:page  1-5:sort  /:title  ?:semantic  ${searchTerm || semanticResults !== null ? "Esc:clear  " : ""}q:${searchTerm || semanticResults !== null ? "back" : "quit"}`
          ).padEnd(terminalWidth - 15) +
            `${selectedIndex + 1}/${formattedQuestions.length} ${getScrollIndicator(selectedIndex, formattedQuestions.length, visibleRows)}`.padStart(
              15,
            )}
        </Text>
      </Box>
    </Box>
  );
}
