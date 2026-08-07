import os
import re
import json
import time
import uuid
import asyncio
import traceback
from typing import Optional
import httpx
from fastapi import BackgroundTasks, HTTPException

from utils.db_utils import get_db_conn, _clean_model_id
from services.vram_svc import capture_and_store_vram, wait_for_idle_trigger
from utils.bench_log import BENCHMARK_LOG_DIR, BENCHMARK_EXECUTION_LOG, _rotate_benchmark_log_if_needed
from utils.common import MODES_INI_PATH, MODELS_DIR
from models.requests import JudgeRequest, BenchmarkRunRequest, BenchmarkQueueRequest
from services.chat_svc import _get_loaded_model
from services.model_svc import _get_preset_id_for_model, _list_models_from_ini, MINI_MODELS_INI
from utils.common import get_quantization_from_name

# ── Server platform labels ─────────────────────────────────────────────────────
_PLATFORM_LABELS = {
    "primary": "Tesla P100 (16GB)",
    "secondary": "GTX 1060 (6GB)",
}

def _get_platform(server: str) -> str:
    return _PLATFORM_LABELS.get(server, "Tesla P100 (16GB)")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _read_ini_models(ini_path: str) -> set:
    """Return set of lowercased model filenames found in the given INI.

    Checks both the section header name AND each section's `model = ...` line
    so that presets with logical aliases (e.g. MTP wrappers) are still marked
    as ready even if no file matching the section name exists on disk.
    """
    filenames = set()
    if not os.path.exists(ini_path):
        return filenames
    try:
        with open(ini_path) as f:
            current_section = None
            for line in f:
                line = line.strip()
                if not line or line.startswith(";"):
                    continue
                # Section header
                m = re.match(r'^\[(.+?)\]$', line)
                if m:
                    raw_name = m.group(1)
                    if raw_name == "*":
                        current_section = None
                        continue
                    current_section = raw_name
                    if raw_name.lower().endswith(".gguf"):
                        section_base = raw_name[:-5]
                    else:
                        section_base = raw_name
                    filename = section_base + ".gguf"
                    if os.path.exists(os.path.join(MODELS_DIR, filename)):
                        # Exact match: section header = filename on disk
                        filenames.add(filename.lower())
                        filenames.add(section_base.lower())
                # model= path inside a section — check if the target file exists
                elif current_section and line.startswith("model"):
                    eq_idx = line.find("=")
                    if eq_idx != -1:
                        model_path = line[eq_idx + 1:].strip()
                        model_basename = os.path.basename(model_path)
                        if model_basename.lower().endswith(".gguf"):
                            model_base = model_basename[:-5]
                        else:
                            model_base = model_basename
                        model_filename = model_base + ".gguf"
                        if os.path.exists(os.path.join(MODELS_DIR, model_filename)):
                            filenames.add(model_filename.lower())
                            filenames.add(model_base.lower())
                            # Also add the section name so presets stored in DB
                            # by their logical (section) name are found as ready.
                            if current_section:
                                cs = current_section
                                if cs.lower().endswith(".gguf"):
                                    cs_base = cs[:-5]
                                else:
                                    cs_base = cs
                                filenames.add(cs.lower())
                                filenames.add(cs_base.lower())
    except Exception as e:
        print(f"[Benchmarks API] Failed to parse {ini_path}: {e}")
    return filenames


def _db_lookup_model(filename: str) -> tuple:
    """Return (status, vram_gb) from models table, or (None, None)."""
    try:
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT LOWER(status) as status, vram_gb FROM models WHERE model_id = ?",
            (filename.lower(),)
        )
        row = cursor.fetchone()
        conn.close()
        return (row["status"], row["vram_gb"]) if row else (None, None)
    except Exception:
        return (None, None)


def _build_capabilities_lookup():
    """Build a dict mapping lowercase model filename -> {has_mmproj, has_mtp}
    by scanning both primary and secondary INI files."""
    lookup = {}
    for ini_path in [MODES_INI_PATH, MINI_MODELS_INI]:
        for m in _list_models_from_ini(ini_path):
            key = m["filename"].lower()
            if key not in lookup:
                lookup[key] = {"has_mmproj": m.get("has_mmproj", False), "has_mtp": m.get("has_mtp", False)}
            else:
                # Merge — prefer True if either is True
                if m.get("has_mmproj"):
                    lookup[key]["has_mmproj"] = True
                if m.get("has_mtp"):
                    lookup[key]["has_mtp"] = True
    return lookup


# ── Query endpoints ─────────────────────────────────────────────────────────────

def get_benchmarks(show_all: bool = False, server: Optional[str] = None) -> dict:
    """Return benchmark list (fulfills /api/benchmarks)."""
    try:
        # Gather model filenames from both INI files
        primary_ready = _read_ini_models(MODES_INI_PATH)
        secondary_ready = _read_ini_models(MINI_MODELS_INI)
        all_ready = primary_ready | secondary_ready

        # Build capabilities lookup (mmproj / mtp) from both INI files
        cap_lookup = _build_capabilities_lookup()

        conn = get_db_conn()
        cursor = conn.cursor()
        # Latest run PER (model_id, server), pulling vram_gb from test_runs
        # so models tested on both GPUs retain correct per-server VRAM.
        # COALESCE(tr.vram_gb, m.vram_gb) prefers per-run VRAM when available.
        query = """
            WITH latest_runs AS (
                SELECT tr.model_id, tr.run_id, tr.timestamp, tr.server, tr.vram_gb,
                       ROW_NUMBER() OVER (PARTITION BY tr.model_id, tr.server ORDER BY tr.timestamp DESC) as rn
                FROM test_runs tr
            ),
            run_scores_agg AS (
                SELECT lr.model_id, lr.run_id, lr.timestamp, lr.server, lr.vram_gb,
                       SUM(rs.score) as total_score,
                       MAX(CASE WHEN rs.round_name = 'speed_metric' THEN rs.speed_tps END) as avg_tps
                FROM latest_runs lr
                JOIN round_scores rs ON lr.run_id = rs.run_id
                WHERE lr.rn = 1
                GROUP BY lr.model_id, lr.run_id, lr.timestamp, lr.server, lr.vram_gb
            )
            SELECT m.model_id, m.name, m.quantization, LOWER(m.status) as status, m.notes,
                   m.vram_gb as model_vram_gb,
                   rsa.run_id, rsa.timestamp, rsa.total_score, rsa.avg_tps, rsa.server, rsa.vram_gb as run_vram_gb,
                   (SELECT COUNT(*) FROM model_hallucinations mh WHERE mh.model_id = m.model_id) as hallucination_count
            FROM models m
            LEFT JOIN run_scores_agg rsa ON m.model_id = rsa.model_id
            ORDER BY rsa.total_score DESC;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        benchmarks = []
        tested_names_lower = set()

        for r in rows:
            avg_tps = r["avg_tps"] or 0.0
            total_score = r["total_score"] or 0
            hallucinated = r["hallucination_count"] > 0
            model_name = r["name"]
            name_low = model_name.lower()
            tested_names_lower.add(name_low)
            if name_low.endswith(".gguf"):
                tested_names_lower.add(name_low[:-5])
            else:
                tested_names_lower.add(name_low + ".gguf")
            tested_names_lower.add(r["model_id"].lower())
            is_model_ready = (name_low in all_ready) or (r["model_id"].lower() in all_ready)

            # Determine server from DB or from ready map
            bench_server = r["server"] or "primary"
            if not show_all:
                if avg_tps < 20.0 or hallucinated or total_score < 50:
                    if not is_model_ready:
                        continue

            # Prefer per-run VRAM. models.vram_gb is a single value shared across
            # BOTH GPUs (last writer wins), so for a secondary/GTX row it can be a
            # value captured on the primary P100 — displaying the wrong VRAM next to
            # the 6 GB secondary total. Only fall back to it for primary rows.
            if bench_server == "secondary":
                effective_vram = r["run_vram_gb"]
            else:
                effective_vram = r["run_vram_gb"] if r["run_vram_gb"] is not None else r["model_vram_gb"]
            vram_total = 16.0 if bench_server == "primary" else 6.0

            # Look up capabilities from INI (try multiple key variants since
            # DB names may or may not have .gguf extension)
            def _lookup_caps(key_low):
                caps = cap_lookup.get(key_low) or {}
                if not caps and not key_low.endswith('.gguf'):
                    caps = cap_lookup.get(key_low + '.gguf') or {}
                if not caps and key_low.endswith('.gguf'):
                    caps = cap_lookup.get(key_low[:-5]) or {}
                return caps
            caps = _lookup_caps(name_low) or _lookup_caps(r["model_id"].lower())

            benchmarks.append({
                "model_id": r["model_id"],
                "model": model_name,
                "platform": _get_platform(bench_server),
                "server": bench_server,
                "quant": r["quantization"] or "Unknown",
                "tokens_sec": round(avg_tps, 1),
                "score": total_score,
                "vram_gb": effective_vram,
                "vram_total_gb": vram_total,
                "status": r["status"] if (r and r["status"]) else "testing",
                "is_ready": is_model_ready,
                "is_tested": True,
                "has_mmproj": caps.get("has_mmproj", False),
                "has_mtp": caps.get("has_mtp", False),
            })

        # Append untested models from both INI files
        # Build base set of already-tested names from SQL results (must remain
        # shared across both INI scans to avoid showing a tested model as untested)
        ini_tested_base = set(tested_names_lower)

        for ini_path, default_server in [(MODES_INI_PATH, "primary"), (MINI_MODELS_INI, "secondary")]:
            if not os.path.exists(ini_path):
                continue
            try:
                with open(ini_path) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith(";"):
                            continue
                        m = re.match(r'^\[(.+?)\]$', line)
                        if m:
                            raw_name = m.group(1)
                            if raw_name == "*":
                                continue
                            if raw_name.lower().endswith(".gguf"):
                                base_name = raw_name[:-5]
                            else:
                                base_name = raw_name
                            filename = base_name + ".gguf"
                            # Skip only if already benchmarked (SQL results), not if
                            # the other INI already listed it — we want dual entries.
                            if filename.lower() not in ini_tested_base:
                                db_status, db_vram = _db_lookup_model(filename)
                                vram_total = 16.0 if default_server == "primary" else 6.0
                                caps = cap_lookup.get(filename.lower(), {})
                                benchmarks.append({
                                    "model_id": filename,
                                    "model": filename,
                                    "platform": _get_platform(default_server),
                                    "server": default_server,
                                    "quant": get_quantization_from_name(filename),
                                    "tokens_sec": None,
                                    "score": None,
                                    "vram_gb": db_vram,
                                    "vram_total_gb": vram_total,
                                    "status": db_status or "testing",
                                    "is_ready": True,
                                    "is_tested": False,
                                    "has_mmproj": caps.get("has_mmproj", False),
                                    "has_mtp": caps.get("has_mtp", False),
                                })
            except Exception as e:
                print(f"[Benchmarks API] Failed to append ready models from {ini_path}: {e}")

        return {"benchmarks": benchmarks}
    except Exception as e:
        print(f"Error querying benchmarks database: {e}")
        return {"benchmarks": [], "error": str(e)}


def get_benchmark_details(model_id: str, server: str = "primary") -> dict:
    """Return detailed benchmark results for a specific model and server."""
    try:
        model_id = _clean_model_id(model_id)
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT model_id, name, quantization, LOWER(status) as status, vram_gb, notes FROM models WHERE model_id = ?", (model_id,))
        model_row = cursor.fetchone()
        if not model_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Model benchmark record not found")
        # Prefer per-run VRAM from test_runs, fallback to models.vram_gb
        cursor.execute("SELECT run_id, timestamp, server, vram_gb, raw_output_path FROM test_runs WHERE model_id = ? AND server = ? ORDER BY timestamp DESC LIMIT 1", (model_id, server))
        run_row = cursor.fetchone()
        rounds = []
        hallucinations = []
        timestamp = None
        run_id = None
        run_vram_gb = None
        server = "primary"
        if run_row:
            run_id = run_row["run_id"]
            timestamp = run_row["timestamp"]
            server = run_row["server"] or "primary"
            run_vram_gb = run_row["vram_gb"]
            cursor.execute("SELECT round_name, score, reasoning, speed_tps FROM round_scores WHERE run_id = ? ORDER BY id ASC", (run_id,))
            rounds = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT round_name, description FROM model_hallucinations WHERE model_id = ?", (model_id,))
            hallucinations = [dict(row) for row in cursor.fetchall()]
            # Fallback: if no round_scores but raw JSON exists, load round data for abort info
            if not rounds and run_row["raw_output_path"] and os.path.exists(run_row["raw_output_path"]):
                try:
                    with open(run_row["raw_output_path"], "r", encoding="utf-8") as raw_f:
                        raw_data = json.load(raw_f)
                    for rnd in raw_data.get("rounds", []):
                        error = rnd.get("error", "")
                        if error:
                            metrics = rnd.get("metrics", {}) or {}
                            rounds.append({
                                "round_name": rnd.get("round_name", "unknown"),
                                "score": 0,
                                "reasoning": error,
                                "speed_tps": metrics.get("tokens_per_second", 0.0)
                            })
                except Exception as raw_err:
                    print(f"[Benchmarks API] Failed to load raw JSON for {model_id}: {raw_err}")
        conn.close()
        # Per-run VRAM is the only server-scoped source. models.vram is shared
        # across both GPUs, so never fall back to it for the secondary server
        # (it may hold a value captured on the primary).
        if server == "secondary":
            effective_vram = run_vram_gb
        else:
            effective_vram = run_vram_gb if run_vram_gb is not None else (model_row["vram_gb"] if model_row else None)
        total_gpu = 6.0 if server == "secondary" else 16.0
        return {
            "model_id": model_row["model_id"],
            "name": model_row["name"],
            "quantization": model_row["quantization"],
            "status": model_row["status"] if (model_row and model_row["status"]) else "testing",
            "vram_gb": effective_vram,
            "vram_total_gb": total_gpu,
            "notes": model_row["notes"],
            "run_id": run_id,
            "timestamp": timestamp,
            "server": server,
            "rounds": rounds,
            "hallucinations": hallucinations,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error fetching benchmark details for {model_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_benchmark_logs(lines: int = 200) -> dict:
    """Return the persistent benchmark execution log file."""
    try:
        if not os.path.exists(BENCHMARK_EXECUTION_LOG):
            return {"logs": ""}
        with open(BENCHMARK_EXECUTION_LOG, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"logs": "".join(tail)}
    except Exception as e:
        print(f"[Logs] Error reading benchmark log file: {e}")
        return {"logs": f"Error: {str(e)}"}


def get_benchmark_outputs() -> dict:
    """List all saved raw JSON output files."""
    try:
        os.makedirs(BENCHMARK_LOG_DIR, exist_ok=True)
        outputs = []
        for f_name in sorted(os.listdir(BENCHMARK_LOG_DIR)):
            full_path = os.path.join(BENCHMARK_LOG_DIR, f_name)
            if not os.path.isfile(full_path):
                continue
            if f_name == "benchmark_execution.log":
                continue
            stat_info = os.stat(full_path)
            outputs.append({
                "filename": f_name,
                "size_bytes": stat_info.st_size,
                "modified_at": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(stat_info.st_mtime)),
            })
        return {"outputs": outputs}
    except Exception as e:
        print(f"[Outputs] Error listing benchmark outputs: {e}")
        return {"outputs": [], "error": str(e)}
