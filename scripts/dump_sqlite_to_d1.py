#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sqlite3

LEGACY_DB_PATH = "/Users/yogo/WebstormProjects/d1-template/legacy/market_data.db"
MIGRATIONS_DIR = "/Users/yogo/WebstormProjects/d1-template/migrations"

def find_migration_file():
    for f in os.listdir(MIGRATIONS_DIR):
        if f.endswith("_migrate_legacy_market_data.sql"):
            return os.path.join(MIGRATIONS_DIR, f)
    raise FileNotFoundError("Migration file for 'migrate_legacy_market_data' not found.")

def escape_sql_str(val):
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    # Escape single quotes
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"

def dump_table_data(cursor, table_name, columns, out_file, chunk_size=1000):
    print(f"Dumping data for {table_name}...")
    cursor.execute(f"SELECT {', '.join(columns)} FROM {table_name}")

    rows = cursor.fetchall()
    total_rows = len(rows)
    print(f"Total rows in {table_name}: {total_rows}")

    col_str = ", ".join(columns)

    # Note: Cloudflare D1 migrations execute the entire file inside a single transaction.
    # Therefore, we MUST NOT include BEGIN TRANSACTION; or COMMIT; inside the SQL file itself!
    for row in rows:
        vals = [escape_sql_str(row[col]) for col in columns]
        vals_str = ", ".join(vals)
        out_file.write(f"INSERT OR REPLACE INTO {table_name} ({col_str}) VALUES ({vals_str});\n")
    print(f"Done dumping {table_name}.")

def main():
    if not os.path.exists(LEGACY_DB_PATH):
        print(f"Error: Legacy DB not found at {LEGACY_DB_PATH}")
        return

    mig_file_path = find_migration_file()
    print(f"Target migration file: {mig_file_path}")

    conn = sqlite3.connect(LEGACY_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    with open(mig_file_path, "w", encoding="utf-8") as f:
        f.write("-- Migration number: 0002\n")
        f.write("-- Migrate Legacy Market Data to D1 (SQLite-compatible)\n\n")

        # 1. Write Table Schemas
        f.write("-- Drop existing tables if any\n")
        f.write("DROP TABLE IF EXISTS limit_up_stocks;\n")
        f.write("DROP TABLE IF EXISTS sectors;\n")
        f.write("DROP TABLE IF EXISTS daily_summary;\n\n")

        f.write("-- Create Table: daily_summary\n")
        f.write("""CREATE TABLE daily_summary (
    date TEXT PRIMARY KEY,
    stock_count INTEGER,
    upgrade_rate REAL,
    limit_broken_rate REAL,
    bidding_increase_rate REAL
);\n\n""")

        f.write("-- Create Table: sectors\n")
        f.write("""CREATE TABLE sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    UNIQUE(date, name)
);\n\n""")

        f.write("-- Create Table: limit_up_stocks\n")
        f.write("""CREATE TABLE limit_up_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    status TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    time TEXT,
    concept_reason TEXT,
    sector_id INTEGER,
    FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL,
    UNIQUE(date, code)
);\n\n""")

        # 2. Dump table data in batches
        dump_table_data(
            cursor,
            "daily_summary",
            ["date", "stock_count", "upgrade_rate", "limit_broken_rate", "bidding_increase_rate"],
            f
        )
        f.write("\n")

        dump_table_data(
            cursor,
            "sectors",
            ["id", "date", "name", "description"],
            f
        )
        f.write("\n")

        dump_table_data(
            cursor,
            "limit_up_stocks",
            ["id", "date", "status", "code", "name", "time", "concept_reason", "sector_id"],
            f
        )
        f.write("\n")

        # 3. Create Indexes
        f.write("-- Indexes for query performance\n")
        f.write("CREATE INDEX IF NOT EXISTS idx_sectors_date ON sectors(date);\n")
        f.write("CREATE INDEX IF NOT EXISTS idx_stocks_date ON limit_up_stocks(date);\n")
        f.write("CREATE INDEX IF NOT EXISTS idx_stocks_code ON limit_up_stocks(code);\n")
        f.write("CREATE INDEX IF NOT EXISTS idx_stocks_sector ON limit_up_stocks(sector_id);\n")

    conn.close()
    print("Database migration SQL generated successfully!")

if __name__ == "__main__":
    main()
