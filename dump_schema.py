#!/usr/bin/env python3
"""
dump_schema.py — Dump cấu trúc DB hiện tại ra file .sql

Usage:
    python dump_schema.py
    python dump_schema.py --out shared/db/snapshot.sql
    python dump_schema.py --host localhost --port 5555 --db m1087 --user m1087

Output mặc định: shared/db/schema_YYYYMMDD_HHMMSS.sql
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / "services/worker-mapper/.env")

SCHEMAS = ["public", "enroll"]


class DBSchemaDumper:
    def __init__(self, host, port, dbname, user, password):
        self.conn = psycopg2.connect(
            host=host, port=port, dbname=dbname, user=user, password=password,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
        self.dbname = dbname
        self.lines: list[str] = []

    def _q(self, sql, params=None):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def _w(self, *parts):
        self.lines.extend(parts)

    def _section(self, title):
        self._w(
            "",
            "-- " + "=" * 60,
            f"--  {title}",
            "-- " + "=" * 60,
        )

    # ── Tables ───────────────────────────────────────────────────

    def _dump_tables(self):
        for schema in SCHEMAS:
            tables = self._q("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """, (schema,))

            if not tables:
                continue

            self._section(f"TABLES — schema: {schema}")

            for row in tables:
                tbl = row["table_name"]
                self._w("", f"-- {schema}.{tbl}")
                self._w(f'CREATE TABLE "{schema}"."{tbl}" (')

                cols = self._q("""
                    SELECT column_name, data_type, udt_name,
                           character_maximum_length, numeric_precision, numeric_scale,
                           is_nullable, column_default
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                """, (schema, tbl))

                col_lines = []
                for c in cols:
                    dtype = self._format_type(c)
                    nullable = "" if c["is_nullable"] == "YES" else " NOT NULL"
                    default = f" DEFAULT {c['column_default']}" if c["column_default"] else ""
                    col_lines.append(f'    "{c["column_name"]}" {dtype}{default}{nullable}')

                # Primary key
                pks = self._q("""
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = %s AND tc.table_name = %s
                    ORDER BY kcu.ordinal_position
                """, (schema, tbl))
                if pks:
                    pk_cols = ", ".join(f'"{p["column_name"]}"' for p in pks)
                    col_lines.append(f"    PRIMARY KEY ({pk_cols})")

                self._w(",\n".join(col_lines))
                self._w(");")

                # Row count as comment
                with self.conn.cursor() as cur:
                    cur.execute(f'SELECT COUNT(*) AS n FROM "{schema}"."{tbl}"')
                    n = cur.fetchone()["n"]
                self._w(f"-- rows: {n:,}")

    def _format_type(self, c) -> str:
        dt = c["data_type"]
        udt = c["udt_name"]
        if dt == "character varying":
            length = c["character_maximum_length"]
            return f"VARCHAR({length})" if length else "VARCHAR"
        if dt == "character":
            return f"CHAR({c['character_maximum_length']})"
        if dt in ("numeric", "decimal"):
            p, s = c["numeric_precision"], c["numeric_scale"]
            if p:
                return f"NUMERIC({p},{s})"
        if dt == "ARRAY":
            return f"{udt.lstrip('_')}[]"
        if dt == "USER-DEFINED":
            return udt
        return dt.upper()

    # ── Views ─────────────────────────────────────────────────────

    def _dump_views(self):
        for schema in SCHEMAS:
            views = self._q("""
                SELECT table_name
                FROM information_schema.views
                WHERE table_schema = %s
                ORDER BY table_name
            """, (schema,))

            if not views:
                continue

            self._section(f"VIEWS — schema: {schema}")

            for row in views:
                vname = row["table_name"]
                defn = self._q(
                    "SELECT pg_get_viewdef(%s, true) AS def",
                    (f"{schema}.{vname}",)
                )
                self._w("", f'CREATE OR REPLACE VIEW "{schema}"."{vname}" AS')
                self._w(defn[0]["def"].strip() + ";")

    # ── Indexes ───────────────────────────────────────────────────

    def _dump_indexes(self):
        self._section("INDEXES")
        rows = self._q("""
            SELECT schemaname, indexname, tablename, indexdef
            FROM pg_indexes
            WHERE schemaname = ANY(%s)
              AND indexname NOT IN (
                SELECT constraint_name FROM information_schema.table_constraints
                WHERE constraint_type IN ('PRIMARY KEY','UNIQUE')
              )
            ORDER BY schemaname, tablename, indexname
        """, (SCHEMAS,))
        for r in rows:
            self._w("", f"-- {r['schemaname']}.{r['tablename']}")
            self._w(r["indexdef"] + ";")

    # ── Triggers ──────────────────────────────────────────────────

    def _dump_triggers(self):
        self._section("TRIGGERS")
        rows = self._q("""
            SELECT trigger_schema, trigger_name, event_object_table,
                   action_timing, string_agg(event_manipulation, ' OR ') AS events,
                   action_orientation, action_statement
            FROM information_schema.triggers
            WHERE trigger_schema = ANY(%s)
            GROUP BY trigger_schema, trigger_name, event_object_table,
                     action_timing, action_orientation, action_statement
            ORDER BY event_object_table, trigger_name
        """, (SCHEMAS,))
        for r in rows:
            self._w(
                "",
                f'CREATE TRIGGER "{r["trigger_name"]}"',
                f'    {r["action_timing"]} {r["events"]}',
                f'    ON "{r["trigger_schema"]}"."{r["event_object_table"]}"',
                f'    FOR EACH {r["action_orientation"]}',
                f'    {r["action_statement"]};',
            )

    # ── Functions ─────────────────────────────────────────────────

    def _dump_functions(self):
        self._section("FUNCTIONS / PROCEDURES")
        rows = self._q("""
            SELECT n.nspname AS schema, p.proname AS name,
                   pg_get_function_arguments(p.oid) AS args,
                   pg_get_functiondef(p.oid) AS def
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = ANY(%s)
              AND p.prokind IN ('f','p')
            ORDER BY n.nspname, p.proname
        """, (SCHEMAS,))
        for r in rows:
            self._w("", f"-- {r['schema']}.{r['name']}({r['args']})")
            self._w(r["def"].strip() + ";")

    # ── Entry point ───────────────────────────────────────────────

    def dump(self, out_path: Path):
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._w(
            f"-- DB Schema Dump: {self.dbname}",
            f"-- Generated   : {now}",
            f"-- Schemas     : {', '.join(SCHEMAS)}",
            "-- NOTE: DDL only — no data",
        )

        self._dump_tables()
        self._dump_views()
        self._dump_indexes()
        self._dump_triggers()
        self._dump_functions()

        self._w("", f"-- End of dump — {now}", "")

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("\n".join(self.lines), encoding="utf-8")
        print(f"Written: {out_path}  ({out_path.stat().st_size:,} bytes)")
        self.conn.close()


def main():
    parser = argparse.ArgumentParser(description="Dump DB schema to .sql")
    parser.add_argument("--host", default=os.getenv("POSTGRES_HOST", "hk.m2s.io.vn"))
    parser.add_argument("--port", type=int, default=int(os.getenv("POSTGRES_PORT", "5555")))
    parser.add_argument("--db",   default=os.getenv("POSTGRES_DB",   "m1087"))
    parser.add_argument("--user", default=os.getenv("POSTGRES_USER", "m1087"))
    parser.add_argument("--pass", dest="password",
                        default=os.getenv("POSTGRES_PASS", ""))
    parser.add_argument("--out",  default=None,
                        help="Output path (default: shared/db/schema_YYYYMMDD_HHMMSS.sql)")
    args = parser.parse_args()

    if args.out:
        out = Path(args.out)
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = Path(__file__).parent / "shared" / "db" / f"schema_{ts}.sql"

    dumper = DBSchemaDumper(args.host, args.port, args.db, args.user, args.password)
    dumper.dump(out)


if __name__ == "__main__":
    main()
