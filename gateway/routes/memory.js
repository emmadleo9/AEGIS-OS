/**
 * AEGIS gateway memory — SQLite persistence (better-sqlite3).
 * Stores messages, devices, logs, sessions, whatsapp_session, telegram_session, system_stats.
 */
const fs = require('node:fs');
const path = require('node:path');

let db = null;

function getDb() {
  if (db) return db;
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'aegis.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, sender TEXT, text TEXT, outgoing INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, platform TEXT, status TEXT, meta TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, message TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, payload TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS whatsapp_session (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS telegram_session (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT, updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS system_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, cpu REAL, memory REAL, disk REAL, created_at TEXT DEFAULT (datetime('now')));
  `);
  return db;
}

function registerMemoryRoutes(app) {
  app.get('/api/memory/stats', (_req, res) => {
    try {
      const database = getDb();
      const tables = ['messages', 'devices', 'logs', 'sessions', 'whatsapp_session', 'telegram_session', 'system_stats'];
      const counts = {};
      for (const table of tables) {
        counts[table] = database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      }
      res.json({ db: 'sqlite', tables: counts, baileysAuthDir: fs.existsSync(path.join(__dirname, '..', 'data', 'baileys_auth')) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/memory/message', (req, res) => {
    try {
      const { chatId, sender, text, outgoing } = req.body ?? {};
      if (!chatId || !text) return res.status(400).json({ error: 'chatId and text are required.' });
      const info = getDb().prepare('INSERT INTO messages (chat_id, sender, text, outgoing) VALUES (?, ?, ?, ?)')
        .run(String(chatId).slice(0, 200), String(sender ?? 'unknown').slice(0, 120), String(text).slice(0, 4096), outgoing ? 1 : 0);
      res.json({ saved: true, id: info.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/memory/messages/:chatId', (req, res) => {
    try {
      const rows = getDb().prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 200').all(String(req.params.chatId));
      res.json({ chatId: req.params.chatId, messages: rows.reverse() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/memory/logs', (_req, res) => {
    try {
      res.json({ logs: getDb().prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 200').all() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/memory/log', (req, res) => {
    try {
      const { level, message } = req.body ?? {};
      if (!message) return res.status(400).json({ error: 'message is required.' });
      getDb().prepare('INSERT INTO logs (level, message) VALUES (?, ?)').run(String(level ?? 'info').slice(0, 20), String(message).slice(0, 2000));
      res.json({ saved: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/memory/session/:name', (req, res) => {
    try {
      const payload = JSON.stringify(req.body ?? {});
      getDb().prepare(`
        INSERT INTO sessions (name, payload) VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = datetime('now')
      `).run(String(req.params.name).slice(0, 80), payload);
      res.json({ saved: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/memory/session/:name', (req, res) => {
    try {
      const row = getDb().prepare('SELECT payload FROM sessions WHERE name = ?').get(String(req.params.name));
      res.json({ name: req.params.name, payload: row ? JSON.parse(row.payload) : null });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

module.exports = { registerMemoryRoutes, getDb };
