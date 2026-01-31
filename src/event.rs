use anyhow::Result;
use crossterm::event::{self, KeyEvent, KeyEventKind, Event as CrosstermEvent};
use std::time::Duration;

pub enum Event {
    Tick,
    Key(KeyEvent),
    Resize(u16, u16),
}

pub struct EventHandler {
    tick_rate: Duration,
}

impl EventHandler {
    pub fn new(tick_rate_ms: u64) -> Self {
        Self {
            tick_rate: Duration::from_millis(tick_rate_ms),
        }
    }

    /// Poll for the next event, coalescing repeated key events to prevent lag
    pub fn next(&self) -> Result<Event> {
        // Wait for at least one event
        if !event::poll(self.tick_rate)? {
            return Ok(Event::Tick);
        }

        let mut last_key: Option<KeyEvent> = None;
        let mut last_resize: Option<(u16, u16)> = None;

        // Read all pending events, keeping only the last of each type
        loop {
            match event::read()? {
                CrosstermEvent::Key(key) => {
                    // Skip key release events
                    if key.kind != KeyEventKind::Release {
                        last_key = Some(key);
                    }
                }
                CrosstermEvent::Resize(w, h) => {
                    last_resize = Some((w, h));
                }
                _ => {}
            }

            // Check if there are more events pending
            if !event::poll(Duration::ZERO)? {
                break;
            }
        }

        // Prioritize resize events, then key events
        if let Some((w, h)) = last_resize {
            return Ok(Event::Resize(w, h));
        }
        if let Some(key) = last_key {
            return Ok(Event::Key(key));
        }

        Ok(Event::Tick)
    }
}
