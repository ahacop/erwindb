mod index;
mod show;
pub mod styles;

pub use show::DUAL_PANE_MIN_WIDTH;

use ratatui::Frame;

use crate::app::{App, Page};

pub fn draw(frame: &mut Frame, app: &mut App) {
    let size = frame.area();
    app.width = size.width;
    app.height = size.height;

    match app.page {
        Page::Index => index::draw_index(frame, app),
        Page::Show => show::draw_show(frame, app),
    }
}
