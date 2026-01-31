use nucleo::{
    pattern::{Atom, AtomKind, CaseMatching, Normalization},
    Config, Matcher, Utf32Str,
};

pub struct FuzzyMatcher {
    matcher: Matcher,
}

impl FuzzyMatcher {
    pub fn new() -> Self {
        Self {
            matcher: Matcher::new(Config::DEFAULT),
        }
    }

    #[allow(dead_code)]
    pub fn score(&mut self, pattern: &str, text: &str) -> Option<u32> {
        if pattern.is_empty() {
            return Some(0);
        }

        let atom = Atom::new(
            pattern,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
            false,
        );
        let mut buf = Vec::new();
        let haystack = Utf32Str::new(text, &mut buf);

        atom.score(haystack, &mut self.matcher).map(|s| s as u32)
    }

    pub fn match_indices(&mut self, pattern: &str, text: &str) -> Option<(u32, Vec<u32>)> {
        if pattern.is_empty() {
            return None;
        }

        let atom = Atom::new(
            pattern,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
            false,
        );
        let mut buf = Vec::new();
        let haystack = Utf32Str::new(text, &mut buf);

        let mut indices = Vec::new();
        let score = atom.indices(haystack, &mut self.matcher, &mut indices)?;

        Some((score as u32, indices))
    }
}

impl Default for FuzzyMatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct FuzzyMatch {
    pub index: usize,
    pub score: u32,
    pub match_indices: Vec<u32>,
}

pub fn fuzzy_filter<T, F>(items: &[T], pattern: &str, get_text: F) -> Vec<FuzzyMatch>
where
    F: Fn(&T) -> &str,
{
    if pattern.is_empty() {
        return Vec::new();
    }

    let mut matcher = FuzzyMatcher::new();
    let mut matches: Vec<FuzzyMatch> = items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let text = get_text(item);
            matcher
                .match_indices(pattern, text)
                .map(|(score, indices)| FuzzyMatch {
                    index,
                    score,
                    match_indices: indices,
                })
        })
        .collect();

    // Sort by score descending
    matches.sort_by(|a, b| b.score.cmp(&a.score));

    matches
}
