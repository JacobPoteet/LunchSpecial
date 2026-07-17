-- Lunch Special — initial schema
-- Courses: breakfast | appetizer | entree | dessert | drink
-- Temperatures: hot | cold
-- Proteins: beef | pork | poultry | seafood | lamb | vegetarian
-- Regions (used for "near" country matches):
--   north-america | latin-america | europe | middle-east | africa |
--   south-asia | east-asia | southeast-asia | oceania

CREATE TABLE dishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  course TEXT NOT NULL CHECK (course IN ('breakfast','appetizer','entree','dessert','drink')),
  temperature TEXT NOT NULL CHECK (temperature IN ('hot','cold')),
  protein TEXT NOT NULL CHECK (protein IN ('beef','pork','poultry','seafood','lamb','vegetarian')),
  -- JSON array of canonical lowercase ingredient names, e.g. '["tomato","onion"]'
  ingredients TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  -- 1..5, revealed after the 1st..5th missed guess
  order_index INTEGER NOT NULL CHECK (order_index BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  UNIQUE (dish_id, order_index)
);

CREATE TABLE schedule (
  -- Player-local calendar date, YYYY-MM-DD
  date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  dish_id INTEGER NOT NULL REFERENCES dishes(id)
);

CREATE INDEX idx_clues_dish ON clues(dish_id);
CREATE INDEX idx_schedule_dish ON schedule(dish_id);
