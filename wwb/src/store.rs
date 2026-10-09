// Data persistence — WWB's own state, in one SQLite file in the profile.
//
// The /workspace rule, carried over: tabs are rows, not memory. The strip
// survives a crash or a restart because it is written as it changes, the same
// way /workspace keeps its tabs in the database rather than in React state.
//
// What lives where:
//   <profile>/wwb.sqlite   tabs (the session), history, bookmarks, settings
//   <profile>/engine/      Servo's own: cookies, localStorage, sessionStorage,
//                          IndexedDB, the HTTP cache (via Opts::config_dir)
//
// History is local only — nothing here is ever sent anywhere — and WWB's own
// pages (wwb://) are never recorded in it.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

pub struct Store {
    db: Connection,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SavedTab {
    pub url: String,
    pub title: String,
}

/// `<data dir>/WWB/profile`, created if missing.
pub fn profile_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("WWB").join("profile");
    let _ = std::fs::create_dir_all(dir.join("engine"));
    dir
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

impl Store {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let db = Connection::open(path)?;
        // WAL keeps a crash mid-write from corrupting the session; the file is
        // the user's, so it is never world-readable where the OS lets us say so.
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS tabs (
                 position INTEGER PRIMARY KEY,
                 url      TEXT NOT NULL,
                 title    TEXT NOT NULL DEFAULT '',
                 active   INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS history (
                 url        TEXT PRIMARY KEY,
                 title      TEXT NOT NULL DEFAULT '',
                 visits     INTEGER NOT NULL DEFAULT 0,
                 last_visit INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS history_recent ON history (last_visit DESC);
             CREATE TABLE IF NOT EXISTS bookmarks (
                 url     TEXT PRIMARY KEY,
                 title   TEXT NOT NULL DEFAULT '',
                 created INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS settings (
                 key   TEXT PRIMARY KEY,
                 value TEXT NOT NULL
             );",
        )?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(Self { db })
    }

    /* ---------------------------------------------------------- session */

    /// Replace the saved strip with the current one, in one transaction.
    pub fn save_session(&mut self, tabs: &[SavedTab], active: usize) -> rusqlite::Result<()> {
        let tx = self.db.transaction()?;
        tx.execute("DELETE FROM tabs", [])?;
        for (i, t) in tabs.iter().enumerate() {
            tx.execute(
                "INSERT INTO tabs (position, url, title, active) VALUES (?1, ?2, ?3, ?4)",
                params![i as i64, t.url, t.title, (i == active) as i64],
            )?;
        }
        tx.commit()
    }

    pub fn load_session(&self) -> rusqlite::Result<(Vec<SavedTab>, usize)> {
        let mut stmt = self.db.prepare("SELECT url, title, active FROM tabs ORDER BY position")?;
        let mut active = 0;
        let mut tabs = Vec::new();
        for (i, row) in stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?
            .enumerate()
        {
            let (url, title, is_active) = row?;
            if is_active != 0 {
                active = i;
            }
            tabs.push(SavedTab { url, title });
        }
        Ok((tabs, active))
    }

    /* ---------------------------------------------------------- history */

    pub fn record_visit(&self, url: &str, title: &str) -> rusqlite::Result<()> {
        if url.starts_with("wwb:") || url.starts_with("about:") {
            return Ok(());
        }
        self.db.execute(
            "INSERT INTO history (url, title, visits, last_visit) VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(url) DO UPDATE SET
               visits = visits + 1,
               last_visit = excluded.last_visit,
               title = CASE WHEN excluded.title = '' THEN history.title ELSE excluded.title END",
            params![url, title, now()],
        )?;
        Ok(())
    }

    pub fn retitle(&self, url: &str, title: &str) -> rusqlite::Result<()> {
        self.db.execute("UPDATE history SET title = ?2 WHERE url = ?1", params![url, title])?;
        Ok(())
    }

    /// Local history matching what is typed — frecency-ish: visits, then recency.
    pub fn history_matches(&self, typed: &str, limit: usize) -> rusqlite::Result<Vec<SavedTab>> {
        let like = format!("%{}%", typed.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
        let mut stmt = self.db.prepare(
            "SELECT url, title FROM history
             WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
             ORDER BY visits DESC, last_visit DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![like, limit as i64], |r| Ok(SavedTab { url: r.get(0)?, title: r.get(1)? }))?;
        rows.collect()
    }

    /* -------------------------------------------------------- bookmarks */

    /// Bookmark or un-bookmark; returns whether it is bookmarked afterwards.
    pub fn toggle_bookmark(&self, url: &str, title: &str) -> rusqlite::Result<bool> {
        if self.is_bookmarked(url)? {
            self.db.execute("DELETE FROM bookmarks WHERE url = ?1", params![url])?;
            Ok(false)
        } else {
            self.db.execute(
                "INSERT INTO bookmarks (url, title, created) VALUES (?1, ?2, ?3)",
                params![url, title, now()],
            )?;
            Ok(true)
        }
    }

    pub fn is_bookmarked(&self, url: &str) -> rusqlite::Result<bool> {
        Ok(self
            .db
            .query_row("SELECT 1 FROM bookmarks WHERE url = ?1", params![url], |_| Ok(()))
            .optional()?
            .is_some())
    }

    pub fn bookmarks(&self) -> rusqlite::Result<Vec<SavedTab>> {
        let mut stmt = self.db.prepare("SELECT url, title FROM bookmarks ORDER BY created DESC LIMIT 200")?;
        let rows = stmt.query_map([], |r| Ok(SavedTab { url: r.get(0)?, title: r.get(1)? }))?;
        rows.collect()
    }

    /* --------------------------------------------------------- settings */

    pub fn setting(&self, key: &str) -> Option<String> {
        self.db
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.db.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// Clear history and the saved session. Bookmarks and settings are the
    /// user's deliberate choices and are kept; the engine's site data
    /// (cookies, storage) is cleared separately by the engine.
    pub fn clear_browsing_data(&self) -> rusqlite::Result<()> {
        self.db.execute_batch("DELETE FROM history; DELETE FROM tabs;")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> Store {
        Store::open(Path::new(":memory:")).unwrap()
    }

    #[test]
    fn session_round_trips() {
        let mut s = store();
        let tabs = vec![
            SavedTab { url: "https://a.example/".into(), title: "A".into() },
            SavedTab { url: "https://b.example/".into(), title: "B".into() },
        ];
        s.save_session(&tabs, 1).unwrap();
        assert_eq!(s.load_session().unwrap(), (tabs, 1));
    }

    #[test]
    fn history_counts_visits_and_skips_internal_pages() {
        let s = store();
        s.record_visit("https://servo.org/", "Servo").unwrap();
        s.record_visit("https://servo.org/", "").unwrap();
        s.record_visit("wwb://newtab/", "New tab").unwrap();
        let m = s.history_matches("servo", 10).unwrap();
        assert_eq!(m, vec![SavedTab { url: "https://servo.org/".into(), title: "Servo".into() }]);
        assert!(s.history_matches("newtab", 10).unwrap().is_empty());
    }

    #[test]
    fn like_wildcards_are_literal() {
        let s = store();
        s.record_visit("https://a.example/100%", "").unwrap();
        s.record_visit("https://b.example/", "").unwrap();
        assert_eq!(s.history_matches("%", 10).unwrap().len(), 1);
    }

    #[test]
    fn bookmarks_toggle() {
        let s = store();
        assert!(s.toggle_bookmark("https://a.example/", "A").unwrap());
        assert!(s.is_bookmarked("https://a.example/").unwrap());
        assert!(!s.toggle_bookmark("https://a.example/", "A").unwrap());
    }

    #[test]
    fn clearing_keeps_bookmarks() {
        let s = store();
        s.record_visit("https://a.example/", "A").unwrap();
        s.toggle_bookmark("https://a.example/", "A").unwrap();
        s.clear_browsing_data().unwrap();
        assert!(s.history_matches("a", 10).unwrap().is_empty());
        assert!(s.is_bookmarked("https://a.example/").unwrap());
    }
}
