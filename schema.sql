CREATE TABLE IF NOT EXISTS sedori (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  buy_price      INTEGER DEFAULT 0,
  sell_price     INTEGER DEFAULT 0,
  source         TEXT    DEFAULT '',
  status         TEXT    DEFAULT 'watching',
  condition_grade TEXT   DEFAULT '',
  sell_platform  TEXT    DEFAULT 'other',
  memo           TEXT    DEFAULT '',
  purchase_date  TEXT    DEFAULT '',
  link           TEXT    DEFAULT '',
  created_at     TEXT    DEFAULT (datetime('now')),
  updated_at     TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  link        TEXT    NOT NULL UNIQUE,
  price_yen   INTEGER,
  first_seen  TEXT    DEFAULT (datetime('now')),
  last_seen   TEXT    DEFAULT (datetime('now')),
  sold_at     TEXT,
  is_sold     INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sedori_status  ON sedori(status);
CREATE INDEX IF NOT EXISTS idx_items_link     ON items_history(link);
CREATE INDEX IF NOT EXISTS idx_items_source   ON items_history(source);
CREATE INDEX IF NOT EXISTS idx_items_sold     ON items_history(is_sold);
