import os
import sqlite3
from collections import defaultdict

DB_PATH = "/app/llm_bench.db"
if not os.path.exists(DB_PATH):
    DB_PATH = "/home/nui/llmaCPP/llm_bench.db"

def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def _clean_model_id(mid: str) -> str:
    if not mid:
        return ""
    return os.path.basename(mid).lower().replace(".gguf", "")

def run_migrations():
    """Apply any outstanding schema migrations."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check test_runs columns
        cursor.execute("PRAGMA table_info(test_runs)")
        test_runs_cols = [col["name"] for col in cursor.fetchall()]
        if "server" not in test_runs_cols:
            cursor.execute("ALTER TABLE test_runs ADD COLUMN server TEXT DEFAULT 'primary'")
            print("[Migration] Added 'server' column to test_runs (default 'primary')")

        if "vram_gb" not in test_runs_cols:
            cursor.execute("ALTER TABLE test_runs ADD COLUMN vram_gb REAL")
            print("[Migration] Added 'vram_gb' column to test_runs")

        if "run_number" not in test_runs_cols:
            cursor.execute("ALTER TABLE test_runs ADD COLUMN run_number INTEGER DEFAULT 1")
            print("[Migration] Added 'run_number' column to test_runs (default 1)")

        if "run_group_id" not in test_runs_cols:
            cursor.execute("ALTER TABLE test_runs ADD COLUMN run_group_id TEXT")
            print("[Migration] Added 'run_group_id' column to test_runs")

        if "execution_mode" not in test_runs_cols:
            cursor.execute("ALTER TABLE test_runs ADD COLUMN execution_mode TEXT DEFAULT 'full'")
            print("[Migration] Added 'execution_mode' column to test_runs (default 'full')")

        if "temperature" not in test_runs_cols:
            cursor.execute("ALTER TABLE test_runs ADD COLUMN temperature REAL DEFAULT 0.7")
            print("[Migration] Added 'temperature' column to test_runs (default 0.7)")

        # Check models columns
        cursor.execute("PRAGMA table_info(models)")
        models_cols = [col["name"] for col in cursor.fetchall()]
        if "category" not in models_cols:
            cursor.execute("ALTER TABLE models ADD COLUMN category TEXT DEFAULT 'unclassified'")
            print("[Migration] Added 'category' column to models (default 'unclassified')")

        if "avg_total_score" not in models_cols:
            cursor.execute("ALTER TABLE models ADD COLUMN avg_total_score REAL")
            print("[Migration] Added 'avg_total_score' column to models")

        if "avg_tps" not in models_cols:
            cursor.execute("ALTER TABLE models ADD COLUMN avg_tps REAL")
            print("[Migration] Added 'avg_tps' column to models")

        if "score_stddev" not in models_cols:
            cursor.execute("ALTER TABLE models ADD COLUMN score_stddev REAL")
            print("[Migration] Added 'score_stddev' column to models")

        if "runs_count" not in models_cols:
            cursor.execute("ALTER TABLE models ADD COLUMN runs_count INTEGER DEFAULT 0")
            print("[Migration] Added 'runs_count' column to models (default 0)")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Migration] Error: {e}")


def prune_old_runs(model_id: str, server: str = "primary", max_keep: int = 5):
    """Keep the latest `max_keep` runs for a (model_id, server) pair and prune older runs."""
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT run_id FROM test_runs
            WHERE model_id = ? AND server = ?
            ORDER BY timestamp DESC
            LIMIT -1 OFFSET ?
        """, (model_id, server, max_keep))
        old_runs = cursor.fetchall()
        for r in old_runs:
            cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (r["run_id"],))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Prune] Error pruning old runs for {model_id} ({server}): {e}")



def consolidate_database():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = OFF;")
        cursor = conn.cursor()
        
        # 1. Fetch all models
        cursor.execute("SELECT * FROM models")
        models_rows = [dict(row) for row in cursor.fetchall()]
        
        # Group models by their clean ID
        grouped = defaultdict(list)
        for row in models_rows:
            clean_id = _clean_model_id(row['model_id'])
            grouped[clean_id].append(row)
            
        for clean_id, dups in grouped.items():
            model_ids = [r['model_id'] for r in dups]
            placeholders = ",".join(["?"] * len(model_ids))

            # Re-assign ALL runs (including those from duplicate model_id variants like
            # "model.gguf" vs "model") to the canonical clean_id — never delete them here.
            # prune_old_runs() below enforces the 5-run retention window instead.
            cursor.execute(
                f"UPDATE test_runs SET model_id = ? WHERE model_id IN ({placeholders})",
                [clean_id] + model_ids,
            )

            # Prune to the last 5 runs per (model, server) pair — inline, using the same
            # cursor so this sees the UPDATE above without needing a commit first.
            for server_val in ("primary", "secondary"):
                cursor.execute("""
                    SELECT run_id FROM test_runs
                    WHERE model_id = ? AND server = ?
                    ORDER BY timestamp DESC
                    LIMIT -1 OFFSET 5
                """, (clean_id, server_val))
                old_run_ids = [r["run_id"] for r in cursor.fetchall()]
                for rid in old_run_ids:
                    cursor.execute("DELETE FROM round_scores WHERE run_id = ?", (rid,))
                    cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (rid,))

            # Get all surviving runs to find the most recent one (for hallucination mapping)
            cursor.execute(
                "SELECT * FROM test_runs WHERE model_id = ? ORDER BY timestamp DESC",
                (clean_id,),
            )
            runs = [dict(row) for row in cursor.fetchall()]

            if runs:
                latest_run = runs[0]
                latest_model_id = latest_run['model_id']  # already clean_id after UPDATE

                # Re-map hallucinations: merge from all duplicate variants → clean_id
                cursor.execute(
                    f"SELECT round_name, description, severity FROM model_hallucinations "
                    f"WHERE model_id IN ({placeholders})",
                    model_ids,
                )
                existing_halls = [dict(row) for row in cursor.fetchall()]

                cursor.execute(
                    f"DELETE FROM model_hallucinations WHERE model_id IN ({placeholders})",
                    model_ids,
                )

                for h in existing_halls:
                    cursor.execute(
                        "INSERT OR IGNORE INTO model_hallucinations "
                        "(model_id, round_name, description, severity) VALUES (?, ?, ?, ?)",
                        (clean_id, h['round_name'], h['description'], h['severity']),
                    )
            else:
                # No runs at all — clear hallucinations
                cursor.execute(
                    f"DELETE FROM model_hallucinations WHERE model_id IN ({placeholders})",
                    model_ids,
                )

            # Update rounds table if anyone is using it
            cursor.execute(f"DELETE FROM rounds WHERE model_id IN ({placeholders})", model_ids)

            # Keep the model row from the duplicate that matches the latest run's original id,
            # falling back to the first duplicate if no match.
            best_dup = dups[0]
            if runs:
                latest_orig_id = runs[0].get('model_id', clean_id)
                for d in dups:
                    if d['model_id'] == latest_orig_id:
                        best_dup = d
                        break

            # Delete all duplicate model rows, then re-insert a single consolidated row
            cursor.execute(f"DELETE FROM models WHERE model_id IN ({placeholders})", model_ids)

            cursor.execute(
                """
                INSERT INTO models (model_id, name, quantization, vram_fit, status, notes, vram_gb,
                                    category, avg_total_score, avg_tps, score_stddev, runs_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_id, best_dup['name'], best_dup['quantization'], best_dup['vram_fit'],
                    best_dup.get('status', 'testing'), best_dup.get('notes', ''),
                    best_dup.get('vram_gb', None),
                    best_dup.get('category', 'unclassified'),
                    best_dup.get('avg_total_score', None),
                    best_dup.get('avg_tps', None),
                    best_dup.get('score_stddev', None),
                    best_dup.get('runs_count', 0),
                ),
            )
            
        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.close()
        print("[DB consolidation] Database consolidation complete!")
    except Exception as e:
        print(f"[DB consolidation] Error consolidating database: {e}")
