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
            
            # Get all runs for all duplicate model_ids
            cursor.execute(f"SELECT * FROM test_runs WHERE model_id IN ({placeholders})", model_ids)
            runs = [dict(row) for row in cursor.fetchall()]
            
            # Sort runs by timestamp descending to find the latest
            runs.sort(key=lambda x: x['timestamp'], reverse=True)
            
            if runs:
                latest_run = runs[0]
                older_runs = runs[1:]
                
                # Delete older runs and their scores
                for old_run in older_runs:
                    cursor.execute("DELETE FROM round_scores WHERE run_id = ?", (old_run['run_id'],))
                    cursor.execute("DELETE FROM test_runs WHERE run_id = ?", (old_run['run_id'],))
                
                # Update latest run's model_id to clean_id
                cursor.execute("UPDATE test_runs SET model_id = ? WHERE run_id = ?", (clean_id, latest_run['run_id']))
                
                # Re-map hallucinations for the latest run's model to clean_id, delete others
                latest_model_id = latest_run['model_id']
                cursor.execute("SELECT round_name, description, severity FROM model_hallucinations WHERE model_id = ?", (latest_model_id,))
                latest_halls = [dict(row) for row in cursor.fetchall()]
                
                cursor.execute(f"DELETE FROM model_hallucinations WHERE model_id IN ({placeholders})", model_ids)
                
                for h in latest_halls:
                    cursor.execute("""
                        INSERT INTO model_hallucinations (model_id, round_name, description, severity)
                        VALUES (?, ?, ?, ?)
                    """, (clean_id, h['round_name'], h['description'], h['severity']))
            else:
                # No runs. Just delete all hallucinations
                cursor.execute(f"DELETE FROM model_hallucinations WHERE model_id IN ({placeholders})", model_ids)
                
            # Update rounds table if anyone is using it
            cursor.execute(f"DELETE FROM rounds WHERE model_id IN ({placeholders})", model_ids)
            
            # Keep the "best" duplicate model record
            best_dup = dups[0]
            if runs:
                for d in dups:
                    if d['model_id'] == latest_run['model_id']:
                        best_dup = d
                        break
                        
            # Delete duplicate model rows
            cursor.execute(f"DELETE FROM models WHERE model_id IN ({placeholders})", model_ids)
            
            # Insert consolidated model row
            cursor.execute("""
                INSERT INTO models (model_id, name, quantization, vram_fit, status, notes, vram_gb)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (clean_id, best_dup['name'], best_dup['quantization'], best_dup['vram_fit'],
                  best_dup.get('status', 'testing'), best_dup.get('notes', ''),
                  best_dup.get('vram_gb', None)))
            
        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.close()
        print("[DB consolidation] Database consolidation complete!")
    except Exception as e:
        print(f"[DB consolidation] Error consolidating database: {e}")
