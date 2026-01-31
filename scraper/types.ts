// Shared type definitions for Stack Overflow scraper

export interface StackOverflowAnswer {
  question_id: number;
}

export interface ScrapedData {
  questionId: number;
  title: string;
  questionBody: string;
  questionScore: number;
  viewCount: number;
  favoriteCount: number;
  creationDate: number;
  lastActivityDate: number;
  tags: string[];
  isAnswered: boolean;
  acceptedAnswerId?: number;
  closeReason?: string;
  questionComments: {
    text: string;
    score: number;
    creationDate: number;
    author: {
      name: string;
      reputation: number;
      userId: number;
    };
  }[];
  author: {
    name: string;
    reputation: number;
    userId: number;
  };
  answers: {
    answerId: number;
    answerText: string;
    score: number;
    isAccepted: boolean;
    creationDate: number;
    lastActivityDate: number;
    author: {
      name: string;
      reputation: number;
      userId: number;
    };
    comments: {
      text: string;
      score: number;
      creationDate: number;
      author: {
        name: string;
        reputation: number;
        userId: number;
      };
    }[];
  }[];
}

// Simplified question data retrieved from the database
export interface StoredQuestion {
  questionId: number;
  title: string;
  questionBody: string;
  questionComments: string[];
  answers: {
    answerText: string;
    comments: string[];
  }[];
}

// Search result for semantic search
export interface SearchResult {
  answer_id: number;
  question_id: number;
  score: number;
  answer_text: string;
  question_title: string;
}
