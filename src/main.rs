mod app;
mod content;
mod db;
mod event;
mod highlight;
mod html;
mod search;
mod ui;

use anyhow::Result;
use crossterm::{
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;

use app::App;
use event::EventHandler;

fn main() -> Result<()> {
    // Create app first (downloads models with progress bars visible)
    let mut app = App::new()?;
    let events = EventHandler::new(16); // ~60fps for responsive scrolling

    // Set up terminal after models are loaded
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Main loop
    let result = run_app(&mut terminal, &mut app, &events);

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = result {
        eprintln!("Error: {err:?}");
    }

    Ok(())
}

fn run_app(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
    events: &EventHandler,
) -> Result<()> {
    loop {
        terminal.draw(|frame| ui::draw(frame, app))?;

        match events.next()? {
            event::Event::Tick => {}
            event::Event::Key(key) => {
                app.handle_key(key);
            }
            event::Event::Mouse(mouse) => {
                app.handle_mouse(mouse);
            }
            event::Event::Resize(width, height) => {
                app.handle_resize(width, height);
            }
        }

        if app.should_quit {
            return Ok(());
        }
    }
}
