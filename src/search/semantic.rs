use anyhow::Result;

#[allow(dead_code)]
pub struct SemanticSearch {
    loaded: bool,
}

#[allow(dead_code)]
impl SemanticSearch {
    pub fn new() -> Self {
        Self { loaded: false }
    }

    pub fn is_loaded(&self) -> bool {
        self.loaded
    }

    pub fn embed(&self, _text: &str) -> Result<Vec<f32>> {
        anyhow::bail!("Semantic search not available. ONNX runtime not configured.")
    }
}

impl Default for SemanticSearch {
    fn default() -> Self {
        Self::new()
    }
}
