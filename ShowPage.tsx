import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { convert } from "html-to-text";
import { DB, QuestionRow, AnswerRow, CommentRow } from "./db.ts";
import {
  formatDate,
  formatNumber,
  htmlToLines,
  highlightErwinName,
  isErwin,
  openInBrowser,
  ContentLine,
} from "./utils.tsx";

// Question Pane Component (left pane in split view, or full view)
interface QuestionPaneProps {
  question: QuestionRow | undefined;
  answers: AnswerRow[];
  comments: CommentRow[];
  db: DB;
  focused: boolean;
  terminalDimensions: {
    width: number;
    height: number;
    visibleRows: number;
  };
  scrollOffset: number;
  setScrollOffset: (offset: number | ((prev: number) => number)) => void;
  focusedLinkIndex: number | null;
  setFocusedLinkIndex: (index: number | null) => void;
  onNavigate: (id: number) => void;
  onErwinAnswerIndicesChange?: (indices: number[]) => void;
  hideErwinAnswers?: boolean;
}

function QuestionPane({
  question,
  answers,
  comments,
  db,
  focused,
  terminalDimensions,
  scrollOffset,
  setScrollOffset,
  focusedLinkIndex,
  setFocusedLinkIndex,
  onNavigate,
  onErwinAnswerIndicesChange,
  hideErwinAnswers,
}: QuestionPaneProps) {
  const contentWidth = Math.min(terminalDimensions.width - 4, 100);
  const { visibleRows } = terminalDimensions;

  const { lines, linkIndices, erwinAnswerIndices } = useMemo(() => {
    const result: ContentLine[] = [];
    const links: number[] = [];
    const erwinIndices: number[] = [];

    if (question) {
      // Title
      result.push({ text: question.title, type: "title" });
      result.push({
        text: `stackoverflow.com/questions/${question.id}`,
        type: "url",
      });
      result.push({
        text: `Asked by ${question.author_name} on ${formatDate(question.creation_date)}  |  ${question.score} votes  |  ${formatNumber(question.view_count)} views`,
        type: "text",
      });
      result.push({ text: "", type: "text" });
      result.push({
        text: "─".repeat(Math.min(contentWidth, 60)),
        type: "separator",
      });
      result.push({ text: "", type: "text" });

      // Question body (HTML with syntax highlighting)
      result.push({ text: "QUESTION", type: "header" });
      result.push({ text: "", type: "text" });
      htmlToLines(question.body, contentWidth, db).forEach((line) =>
        result.push(line),
      );

      // Question comments
      if (comments.length > 0) {
        result.push({ text: "", type: "text" });
        result.push({ text: `Comments (${comments.length})`, type: "comment" });
        comments.forEach((c) => {
          result.push({ text: "", type: "text" });
          const voteStr = c.score > 0 ? `[+${c.score}] ` : "";
          htmlToLines(
            `${voteStr}${c.comment_text} — ${c.author_name}`,
            contentWidth - 4,
            db,
          ).forEach((line) => {
            result.push({ ...line, text: "    " + line.text });
          });
        });
      }

      // Answers
      answers.forEach((answer, i) => {
        // Get comments for this answer
        const answerComments = db.getAnswerComments(answer.id);
        const authorIsErwin = isErwin(answer.author_name);

        // Skip Erwin's answers when they're shown in the dedicated pane
        if (authorIsErwin && hideErwinAnswers) {
          return;
        }

        result.push({ text: "", type: "text" });
        result.push({
          text: "─".repeat(Math.min(contentWidth, 60)),
          type: "separator",
        });
        result.push({ text: "", type: "text" });

        // Track where Erwin's answer starts
        if (authorIsErwin) {
          erwinIndices.push(result.length);
        }

        // Answer header with accepted indicator and score
        const acceptedMark = answer.is_accepted ? " ✓ ACCEPTED" : "";
        const scoreStr =
          answer.score > 0 ? `+${answer.score}` : answer.score.toString();
        const erwinMark = authorIsErwin ? " ◆" : "";
        result.push({
          text: `ANSWER ${i + 1}${acceptedMark}${erwinMark}  (${scoreStr} votes)`,
          type: authorIsErwin ? "erwin_header" : "header",
        });
        result.push({
          text: `by ${answer.author_name} (${formatNumber(answer.author_reputation)} rep)`,
          type: authorIsErwin ? "erwin_text" : "text",
        });
        result.push({ text: "", type: authorIsErwin ? "erwin_text" : "text" });

        htmlToLines(answer.answer_text, contentWidth, db).forEach((line) => {
          if (authorIsErwin) {
            if (line.type === "text") {
              result.push({ ...line, type: "erwin_text" });
            } else if (line.type === "code") {
              result.push({ ...line, type: "erwin_code" });
            } else if (line.type === "link") {
              result.push({ ...line, type: "erwin_link" }); // inDb is preserved via spread
            } else {
              result.push(line);
            }
          } else {
            result.push(line);
          }
        });

        // Answer comments
        if (answerComments.length > 0) {
          result.push({ text: "", type: "text" });
          result.push({
            text: `Comments (${answerComments.length})`,
            type: "comment",
          });
          answerComments.forEach((c) => {
            const commentIsErwin = isErwin(c.author_name);
            result.push({ text: "", type: "text" });
            const voteStr = c.score > 0 ? `[+${c.score}] ` : "";
            const erwinCommentMark = commentIsErwin ? "◆ " : "";
            htmlToLines(
              `${erwinCommentMark}${voteStr}${c.comment_text} — ${c.author_name}`,
              contentWidth - 4,
              db,
            ).forEach((line) => {
              let finalType = line.type;
              if (commentIsErwin) {
                if (line.type === "text") finalType = "erwin_text";
                else if (line.type === "link") finalType = "erwin_link";
              }
              result.push({
                ...line,
                text: "    " + line.text,
                type: finalType,
              });
            });
          });
        }
      });

      result.push({ text: "", type: "text" });
      result.push({
        text: "─".repeat(Math.min(contentWidth, 60)),
        type: "separator",
      });
    } else {
      result.push({ text: "Question not found", type: "text" });
    }

    // Build list of link line indices
    result.forEach((line, idx) => {
      if (line.type === "link" || line.type === "erwin_link") {
        links.push(idx);
      }
    });

    return {
      lines: result,
      linkIndices: links,
      erwinAnswerIndices: erwinIndices,
    };
  }, [question, answers, comments, contentWidth, db, hideErwinAnswers]);

  // Notify parent of Erwin answer line indices
  useEffect(() => {
    if (onErwinAnswerIndicesChange) {
      onErwinAnswerIndicesChange(erwinAnswerIndices);
    }
  }, [erwinAnswerIndices, onErwinAnswerIndicesChange]);

  // Input handling (only when focused)
  useInput(
    (input, key) => {
      if (!focused) return;

      // Tab/Shift+Tab cycles through links
      if (key.tab && linkIndices.length > 0) {
        const reverse = key.shift;
        let nextIndex: number;
        if (focusedLinkIndex === null) {
          nextIndex = reverse ? linkIndices.length - 1 : 0;
        } else if (reverse) {
          nextIndex =
            (focusedLinkIndex - 1 + linkIndices.length) % linkIndices.length;
        } else {
          nextIndex = (focusedLinkIndex + 1) % linkIndices.length;
        }
        setFocusedLinkIndex(nextIndex);
        const lineIdx = linkIndices[nextIndex];
        if (lineIdx < scrollOffset) {
          setScrollOffset(lineIdx);
        } else if (lineIdx >= scrollOffset + visibleRows) {
          setScrollOffset(lineIdx - visibleRows + 1);
        }
        return;
      }

      // Enter opens the focused link
      if (key.return && focusedLinkIndex !== null) {
        const lineIdx = linkIndices[focusedLinkIndex];
        const line = lines[lineIdx];
        if (line?.linkQuestionId) {
          if (db.questionExists(line.linkQuestionId)) {
            onNavigate(line.linkQuestionId);
          } else if (line.linkUrl) {
            openInBrowser(line.linkUrl);
          }
        }
        return;
      }

      // j/k scroll
      if (input === "j" || key.downArrow) {
        setScrollOffset((prev) =>
          Math.min(prev + 1, Math.max(0, lines.length - visibleRows)),
        );
        return;
      }

      if (input === "k" || key.upArrow) {
        setScrollOffset((prev) => Math.max(prev - 1, 0));
        return;
      }

      // Page navigation
      if (key.pageDown || input === "d" || input === " ") {
        setScrollOffset((prev) =>
          Math.min(prev + visibleRows, Math.max(0, lines.length - visibleRows)),
        );
        return;
      }

      if (key.pageUp || input === "u") {
        setScrollOffset((prev) => Math.max(prev - visibleRows, 0));
        return;
      }

      // Top/bottom
      if (input === "g") {
        setScrollOffset(0);
        return;
      }

      if (input === "G") {
        setScrollOffset(Math.max(0, lines.length - visibleRows));
        return;
      }
    },
    { isActive: focused },
  );

  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleRows);

  // Helper to render a single line
  const renderLine = (line: ContentLine | undefined, key: string) => {
    if (!line) {
      return (
        <Box key={key} height={1}>
          <Text> </Text>
        </Box>
      );
    }

    // Extract index from key for link focus calculation
    const idx = parseInt(key.split("-")[1], 10);
    const text = line.text || " ";

    if (line.type === "title") {
      return (
        <Box key={key} height={1}>
          <Text color="yellow" bold>
            {text}
          </Text>
        </Box>
      );
    }
    if (line.type === "header") {
      const color = line.text.startsWith("ANSWER") ? "green" : "magenta";
      return (
        <Box key={key} height={1}>
          <Text color={color} bold>
            {text}
          </Text>
        </Box>
      );
    }
    if (line.type === "url") {
      return (
        <Box key={key} height={1}>
          <Text color="cyan" dimColor>
            {text}
          </Text>
        </Box>
      );
    }
    if (line.type === "separator") {
      return (
        <Box key={key} height={1}>
          <Text dimColor>{text}</Text>
        </Box>
      );
    }
    if (line.type === "comment") {
      return (
        <Box key={key} height={1}>
          <Text color="gray" bold>
            {text}
          </Text>
        </Box>
      );
    }
    if (line.type === "erwin_header") {
      return (
        <Box key={key} height={1}>
          <Text color="black" backgroundColor="yellow" bold>
            {" ◆ "}
          </Text>
          <Text color="yellow" bold>
            {text.replace(" ◆", "")}
          </Text>
        </Box>
      );
    }
    if (line.type === "erwin_text") {
      return (
        <Box key={key} height={1}>
          <Text color="yellow">│ </Text>
          <Text color="white">{highlightErwinName(text)}</Text>
        </Box>
      );
    }
    if (line.type === "erwin_code") {
      return (
        <Box key={key} height={1}>
          <Text color="yellow">│ </Text>
          <Text>{text}</Text>
        </Box>
      );
    }
    if (line.type === "code") {
      return (
        <Box key={key} height={1}>
          <Text>{text}</Text>
        </Box>
      );
    }
    if (line.type === "erwin_link" || line.type === "link") {
      // Determine if this link is focused
      const lineAbsoluteIdx = scrollOffset + idx;
      const linkIdx = linkIndices.indexOf(lineAbsoluteIdx);
      const isFocused = linkIdx !== -1 && linkIdx === focusedLinkIndex;

      const inDb = line.inDb ?? false;
      const leadingSpaces = text.match(/^(\s*)/)?.[1] || "";
      const content = text.trimStart();
      const prefix = line.type === "erwin_link" ? "│ " : "";

      if (isFocused) {
        return (
          <Box key={key} height={1}>
            {prefix && <Text color="yellow">{prefix}</Text>}
            <Text>{leadingSpaces}</Text>
            <Text backgroundColor="cyan" color="black" bold>
              {content} {inDb ? "→ [in DB]" : "→ [external]"}
            </Text>
          </Box>
        );
      }
      return (
        <Box key={key} height={1}>
          {prefix && <Text color="yellow">{prefix}</Text>}
          <Text>{leadingSpaces}</Text>
          <Text color="cyan" underline>
            {content}
          </Text>
        </Box>
      );
    }
    return (
      <Box key={key} height={1}>
        <Text>{highlightErwinName(text)}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {Array.from({ length: visibleRows }).map((_, i) =>
        renderLine(visibleLines[i], `line-${i}`),
      )}
    </Box>
  );
}

// Erwin Pane Component (right pane in split view - shows only one Erwin answer)
interface ErwinPaneProps {
  answers: AnswerRow[]; // All answers - filtered to Erwin's inside
  answerIndex: number; // Which Erwin answer to display (index into Erwin-only list)
  db: DB;
  focused: boolean;
  terminalDimensions: {
    width: number;
    height: number;
    visibleRows: number;
  };
  scrollOffset: number;
  setScrollOffset: (offset: number | ((prev: number) => number)) => void;
  focusedLinkIndex: number | null;
  setFocusedLinkIndex: (index: number | null) => void;
  onNavigate: (id: number) => void;
}

function ErwinPane({
  answers,
  answerIndex,
  db,
  focused,
  terminalDimensions,
  scrollOffset,
  setScrollOffset,
  focusedLinkIndex,
  setFocusedLinkIndex,
  onNavigate,
}: ErwinPaneProps) {
  const contentWidth = Math.min(terminalDimensions.width / 2 - 4, 100);
  const { visibleRows } = terminalDimensions;

  // Build content lines for the current Erwin answer (memoized)
  const { lines, linkIndices } = useMemo(() => {
    const result: ContentLine[] = [];
    const links: number[] = [];

    // Filter to Erwin's answers only
    const erwinAnswers = answers.filter((a) => isErwin(a.author_name));
    if (erwinAnswers.length === 0 || answerIndex >= erwinAnswers.length) {
      result.push({ text: "No Erwin answer selected", type: "text" });
      return { lines: result, linkIndices: links };
    }

    const answer = erwinAnswers[answerIndex];
    const answerComments = db.getAnswerComments(answer.id);

    // Answer header
    const acceptedMark = answer.is_accepted ? " ✓ ACCEPTED" : "";
    const scoreStr =
      answer.score > 0 ? `+${answer.score}` : answer.score.toString();
    // Note: No diamond here since pane header already shows it's Erwin
    result.push({
      text: `ANSWER${acceptedMark}  (${scoreStr} votes)`,
      type: "erwin_header",
    });
    result.push({
      text: `by ${answer.author_name} (${formatNumber(answer.author_reputation)} rep)`,
      type: "erwin_text",
    });
    result.push({ text: "", type: "erwin_text" });

    // Answer body
    htmlToLines(answer.answer_text, contentWidth, db).forEach((line) => {
      if (line.type === "text") {
        result.push({ ...line, type: "erwin_text" });
      } else if (line.type === "code") {
        result.push({ ...line, type: "erwin_code" });
      } else if (line.type === "link") {
        result.push({ ...line, type: "erwin_link" });
      } else {
        result.push(line);
      }
    });

    // Answer comments
    if (answerComments.length > 0) {
      result.push({ text: "", type: "erwin_text" });
      result.push({
        text: `Comments (${answerComments.length})`,
        type: "comment",
      });
      answerComments.forEach((c) => {
        const commentIsErwin = isErwin(c.author_name);
        result.push({ text: "", type: "erwin_text" });
        const voteStr = c.score > 0 ? `[+${c.score}] ` : "";
        const erwinCommentMark = commentIsErwin ? "◆ " : "";
        htmlToLines(
          `${erwinCommentMark}${voteStr}${c.comment_text} — ${c.author_name}`,
          contentWidth - 4,
          db,
        ).forEach((line) => {
          let finalType = line.type;
          if (commentIsErwin) {
            if (line.type === "text") finalType = "erwin_text";
            else if (line.type === "link") finalType = "erwin_link";
          }
          result.push({
            ...line,
            text: "    " + line.text,
            type: finalType,
          });
        });
      });
    }

    // Build list of link line indices
    result.forEach((line, idx) => {
      if (line.type === "link" || line.type === "erwin_link") {
        links.push(idx);
      }
    });

    return { lines: result, linkIndices: links };
  }, [answers, answerIndex, contentWidth, db]);

  // Input handling (only when focused)
  useInput(
    (input, key) => {
      if (!focused) return;

      // Tab/Shift+Tab cycles through links
      if (key.tab && linkIndices.length > 0) {
        const reverse = key.shift;
        let nextIndex: number;
        if (focusedLinkIndex === null) {
          nextIndex = reverse ? linkIndices.length - 1 : 0;
        } else if (reverse) {
          nextIndex =
            (focusedLinkIndex - 1 + linkIndices.length) % linkIndices.length;
        } else {
          nextIndex = (focusedLinkIndex + 1) % linkIndices.length;
        }
        setFocusedLinkIndex(nextIndex);
        const lineIdx = linkIndices[nextIndex];
        if (lineIdx < scrollOffset) {
          setScrollOffset(lineIdx);
        } else if (lineIdx >= scrollOffset + visibleRows) {
          setScrollOffset(lineIdx - visibleRows + 1);
        }
        return;
      }

      // Enter opens the focused link
      if (key.return && focusedLinkIndex !== null) {
        const lineIdx = linkIndices[focusedLinkIndex];
        const line = lines[lineIdx];
        if (line?.linkQuestionId) {
          if (db.questionExists(line.linkQuestionId)) {
            onNavigate(line.linkQuestionId);
          } else if (line.linkUrl) {
            openInBrowser(line.linkUrl);
          }
        }
        return;
      }

      // j/k scroll
      if (input === "j" || key.downArrow) {
        setScrollOffset((prev) =>
          Math.min(prev + 1, Math.max(0, lines.length - visibleRows)),
        );
        return;
      }

      if (input === "k" || key.upArrow) {
        setScrollOffset((prev) => Math.max(prev - 1, 0));
        return;
      }

      // Page navigation
      if (key.pageDown || input === "d" || input === " ") {
        setScrollOffset((prev) =>
          Math.min(prev + visibleRows, Math.max(0, lines.length - visibleRows)),
        );
        return;
      }

      if (key.pageUp || input === "u") {
        setScrollOffset((prev) => Math.max(prev - visibleRows, 0));
        return;
      }

      // Top/bottom
      if (input === "g") {
        setScrollOffset(0);
        return;
      }

      if (input === "G") {
        setScrollOffset(Math.max(0, lines.length - visibleRows));
        return;
      }
    },
    { isActive: focused },
  );

  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleRows);

  // Helper to render a single line (simplified for Erwin pane)
  const renderLine = (line: ContentLine | undefined, key: string) => {
    if (!line) {
      return (
        <Box key={key} height={1}>
          <Text> </Text>
        </Box>
      );
    }

    const idx = parseInt(key.split("-")[1], 10);
    const text = line.text || " ";

    if (line.type === "erwin_header") {
      // In Erwin pane, no diamond prefix - pane header shows it's Erwin
      return (
        <Box key={key} height={1}>
          <Text color="yellow" bold>
            {text.replace(" ◆", "")}
          </Text>
        </Box>
      );
    }
    if (line.type === "separator") {
      return (
        <Box key={key} height={1}>
          <Text dimColor>{text}</Text>
        </Box>
      );
    }
    if (line.type === "comment") {
      return (
        <Box key={key} height={1}>
          <Text color="gray" bold>
            {text}
          </Text>
        </Box>
      );
    }
    if (line.type === "erwin_text") {
      return (
        <Box key={key} height={1}>
          <Text color="white">{highlightErwinName(text)}</Text>
        </Box>
      );
    }
    if (line.type === "erwin_code") {
      return (
        <Box key={key} height={1}>
          <Text>{text}</Text>
        </Box>
      );
    }
    if (line.type === "code") {
      return (
        <Box key={key} height={1}>
          <Text>{text}</Text>
        </Box>
      );
    }
    if (line.type === "erwin_link" || line.type === "link") {
      const lineAbsoluteIdx = scrollOffset + idx;
      const linkIdx = linkIndices.indexOf(lineAbsoluteIdx);
      const isFocused = linkIdx !== -1 && linkIdx === focusedLinkIndex;

      const inDb = line.inDb ?? false;
      const leadingSpaces = text.match(/^(\s*)/)?.[1] || "";
      const content = text.trimStart();

      if (isFocused) {
        return (
          <Box key={key} height={1}>
            <Text>{leadingSpaces}</Text>
            <Text backgroundColor="cyan" color="black" bold>
              {content} {inDb ? "→ [in DB]" : "→ [external]"}
            </Text>
          </Box>
        );
      }
      return (
        <Box key={key} height={1}>
          <Text>{leadingSpaces}</Text>
          <Text color="cyan" underline>
            {content}
          </Text>
        </Box>
      );
    }
    return (
      <Box key={key} height={1}>
        <Text>{highlightErwinName(text)}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {Array.from({ length: visibleRows }).map((_, i) =>
        renderLine(visibleLines[i], `erwin-${i}`),
      )}
    </Box>
  );
}

// Show Page Component (Simplified - coordinates between panes)
export function ShowPage({
  db,
  questionId,
  onBack,
  onNavigate,
}: {
  db: DB;
  questionId: number;
  onBack: () => void;
  onNavigate: (id: number) => void;
}) {
  const { stdout } = useStdout();

  // Fetch and decode data once per questionId
  const { question, answers, comments } = useMemo(() => {
    const rawQuestion = db.getQuestion(questionId);
    const rawAnswers = db.getAnswers(questionId);
    const rawComments = db.getQuestionComments(questionId);

    return {
      question: rawQuestion
        ? {
            ...rawQuestion,
            title: convert(rawQuestion.title, { wordwrap: false }),
          }
        : undefined,
      answers: rawAnswers,
      comments: rawComments,
    };
  }, [db, questionId]);

  // Terminal dimensions
  const terminalWidth = stdout?.columns || 80;
  const terminalHeight = stdout?.rows || 24;
  const visibleRows = terminalHeight - 2; // header + status bar

  // High-level state: which pane is shown, which Erwin answer, which pane has focus
  const [showErwinPane, setShowErwinPane] = useState(false);
  const [erwinIndex, setErwinIndex] = useState(0);
  const [leftPaneFocused, setLeftPaneFocused] = useState(true);

  // State for each pane (managed here, passed as props)
  const [questionScrollOffset, setQuestionScrollOffset] = useState(0);
  const [questionFocusedLinkIndex, setQuestionFocusedLinkIndex] = useState<
    number | null
  >(null);
  const [erwinScrollOffset, setErwinScrollOffset] = useState(0);
  const [erwinFocusedLinkIndex, setErwinFocusedLinkIndex] = useState<
    number | null
  >(null);
  const [erwinAnswerLineIndices, setErwinAnswerLineIndices] = useState<
    number[]
  >([]);

  // Count Erwin answers for navigation
  const erwinAnswerCount = answers.filter((a) => isErwin(a.author_name)).length;

  // Check if we have enough width for 2-pane view (160+ columns)
  const canShowSplitView = terminalWidth >= 160;
  const halfWidth = Math.floor(terminalWidth / 2);

  // High-level input handling (ShowPage-level navigation only)
  useInput((input, key) => {
    // Back navigation
    if (key.escape || input === "b" || input === "q") {
      onBack();
      return;
    }

    // Open in browser
    if (input === "o") {
      const url = `https://stackoverflow.com/questions/${questionId}`;
      openInBrowser(url);
      return;
    }

    // e/E for Erwin mode - e=next answer/switch to right, E=previous answer/switch to left
    if ((input === "e" || input === "E") && erwinAnswerCount > 0) {
      if (canShowSplitView) {
        if (!showErwinPane) {
          // Open Erwin pane
          setShowErwinPane(true);
          setErwinScrollOffset(0);
          setErwinFocusedLinkIndex(null);
          setLeftPaneFocused(false);
        } else if (input === "E") {
          // E = previous Erwin answer or switch focus to left pane
          if (erwinIndex === 0) {
            // At first answer, switch focus or close
            if (!leftPaneFocused) {
              setLeftPaneFocused(true);
            } else {
              setShowErwinPane(false);
              setLeftPaneFocused(true);
            }
          } else {
            setErwinIndex(erwinIndex - 1);
            setErwinScrollOffset(0);
            setErwinFocusedLinkIndex(null);
            setLeftPaneFocused(false);
          }
        } else {
          // e = next Erwin answer or switch focus to right pane
          if (leftPaneFocused) {
            setLeftPaneFocused(false);
          } else {
            const nextErwinIndex = (erwinIndex + 1) % erwinAnswerCount;
            if (nextErwinIndex === 0) {
              // Cycled back, close pane
              setShowErwinPane(false);
              setLeftPaneFocused(true);
            } else {
              setErwinIndex(nextErwinIndex);
              setErwinScrollOffset(0);
              setErwinFocusedLinkIndex(null);
            }
          }
        }
      } else {
        // Narrow terminal: scroll to Erwin's answer
        const delta = input === "E" ? -1 : 1;
        const nextErwinIndex =
          (erwinIndex + delta + erwinAnswerCount) % erwinAnswerCount;
        setErwinIndex(nextErwinIndex);

        // Scroll the question pane to the Erwin answer
        if (erwinAnswerLineIndices.length > nextErwinIndex) {
          setQuestionScrollOffset(erwinAnswerLineIndices[nextErwinIndex]);
        }
      }
      return;
    }
    // All other input (scrolling, links, etc.) is handled by the focused pane component
  });

  return (
    <Box flexDirection="column" minHeight={terminalHeight}>
      {/* Header with focus indication */}
      <Box>
        {(() => {
          const attribution = "SO · CC BY-SA";
          if (showErwinPane && canShowSplitView) {
            const leftTitle = ` Question #${questionId} `;
            const rightTitle = ` ◆ Erwin's Answer ${erwinIndex + 1}/${erwinAnswerCount} `;
            const rightPadding = halfWidth - rightTitle.length - attribution.length;
            return (
              <>
                <Text
                  backgroundColor={leftPaneFocused ? "cyan" : "blue"}
                  color={leftPaneFocused ? "black" : "white"}
                  bold
                >
                  {leftTitle.padEnd(halfWidth)}
                </Text>
                <Text
                  backgroundColor={!leftPaneFocused ? "yellow" : "blue"}
                  color={!leftPaneFocused ? "black" : "white"}
                  bold
                >
                  {rightTitle + " ".repeat(Math.max(0, rightPadding)) + attribution}
                </Text>
              </>
            );
          } else {
            const title = ` Question #${questionId} `;
            const padding = terminalWidth - title.length - attribution.length;
            return (
              <Text backgroundColor="blue" color="white" bold>
                {title + " ".repeat(Math.max(0, padding)) + attribution}
              </Text>
            );
          }
        })()}
      </Box>

      {/* Content area */}
      <Box flexGrow={1}>
        {/* Left pane (question) */}
        <Box
          flexDirection="column"
          width={showErwinPane && canShowSplitView ? "50%" : "100%"}
          paddingX={1}
        >
          <QuestionPane
            question={question}
            answers={answers}
            comments={comments}
            db={db}
            focused={leftPaneFocused || !showErwinPane}
            terminalDimensions={{
              width: terminalWidth,
              height: terminalHeight,
              visibleRows,
            }}
            scrollOffset={questionScrollOffset}
            setScrollOffset={setQuestionScrollOffset}
            focusedLinkIndex={questionFocusedLinkIndex}
            setFocusedLinkIndex={setQuestionFocusedLinkIndex}
            onNavigate={onNavigate}
            onErwinAnswerIndicesChange={setErwinAnswerLineIndices}
            hideErwinAnswers={showErwinPane && canShowSplitView}
          />
        </Box>

        {/* Right pane (Erwin) with left border */}
        {showErwinPane && canShowSplitView && (
          <Box
            flexDirection="column"
            width="50%"
            borderStyle="single"
            borderColor="yellow"
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
          >
            <ErwinPane
              answers={answers}
              answerIndex={erwinIndex}
              db={db}
              focused={!leftPaneFocused}
              terminalDimensions={{
                width: terminalWidth,
                height: terminalHeight,
                visibleRows,
              }}
              scrollOffset={erwinScrollOffset}
              setScrollOffset={setErwinScrollOffset}
              focusedLinkIndex={erwinFocusedLinkIndex}
              setFocusedLinkIndex={setErwinFocusedLinkIndex}
              onNavigate={onNavigate}
            />
          </Box>
        )}
      </Box>

      {/* Status bar */}
      <Box>
        <Text backgroundColor="gray" color="black">
          {(showErwinPane && canShowSplitView
            ? ` j/k:scroll  e/E:Erwin  Tab:links  h:help  o:browser  b/q:back  [${leftPaneFocused ? "Question" : "Erwin"}]`
            : ` j/k:scroll  ${erwinAnswerCount > 0 ? "e:Erwin  " : ""}Tab:links  o:browser  b/q:back`
          ).padEnd(terminalWidth)}
        </Text>
      </Box>
    </Box>
  );
}
