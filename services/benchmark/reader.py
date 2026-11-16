import os
import re
import json
import math
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
from services.model_svc import _get_preset_id_for_model, _list_models_from_ini, MINI_MODELS_INI, list_strata_models
from utils.common import get_quantization_from_name

# ── Server platform labels ─────────────────────────────────────────────────────
_PLATFORM_LABELS = {
    "primary": "Tesla P100 (16GB)",
    "secondary": "GTX 1060 (6GB)",
    "strata": "Strata (Pascal CUDA12)",
}

# Total VRAM (GB) per server. Strata shares GPU 0 with the Primary P100.
_VRAM_TOTALS = {
    "primary": 16.0,
    "secondary": 6.0,
    "strata": 16.0,
}


def _get_vram_total(server: str) -> float:
    return _VRAM_TOTALS.get(server, 16.0)

def _get_platform(server: str) -> str:
    return _PLATFORM_LABELS.get(server, "Tesla P100 (16GB)")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_ini_sections(ini_path: str) -> list:
    """Parse an INI into sections plus the files they reference (model/md/mmproj).

    Preset blocks often use a logical section name that does not match a file on
    disk, e.g.::

        [gemma-4-E4B-it-dspark.gguf]
        model = /models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf
        md = /models/gemma-4-E4B-it-dspark-Q8_0.gguf

    Readiness must therefore be derived from the referenced files, not from the
    section header.
    """
    sections = []
    if not os.path.exists(ini_path):
        return sections
    current = None
    try:
        with open(ini_path) as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith(";") or stripped.startswith("#"):
                    continue
                header = re.match(r'^\[(.+?)\]$', stripped)
                if header:
                    if current is not None:
                        sections.append(current)
                    sec_name = header.group(1).strip()
                    current = None if sec_name == "*" else {
                        "section": sec_name, "model": None, "md": None, "mmproj": None,
                    }
                    continue
                if current is None or "=" not in stripped:
                    continue
                key, value = stripped.split("=", 1)
                key = key.strip().lower()
                value = value.strip().strip('"').strip("'")
                if key in ("model", "md", "mmproj") and value:
                    current[key] = value
        if current is not None:
            sections.append(current)
    except Exception as e:
        print(f"[Benchmarks API] Failed to parse sections from {ini_path}: {e}")
    return sections


def _section_is_ready(section: dict) -> bool:
    """True when every file referenced by a preset section exists under MODELS_DIR."""
    refs = [section.get("model"), section.get("md"), section.get("mmproj")]
    if not any(refs):
        return False
    for ref in refs:
        if not ref:
            continue
        filename = os.path.basename(ref)
        if not os.path.exists(os.path.join(MODELS_DIR, filename)):
            return False
    return True


def _build_block_index(ini_path: str) -> dict:
    """Map lowercased block identifiers -> block metadata for one INI file.

    A benchmark entry is identified by its INI *block* (section header), not by
    the ``model=`` / ``md=`` files it references. Each block is indexed under
    its section name, base name, and ``<base>.gguf`` so DB model ids can be
    matched to it. The referenced ``model=`` file supplies display metadata
    (quantization) even when the section uses a logical preset alias.
    """
    index = {}
    for sec in _parse_ini_sections(ini_path):
        raw_name = sec["section"]
        base_name = raw_name[:-5] if raw_name.lower().endswith(".gguf") else raw_name
        filename = base_name + ".gguf"
        model_ref = sec.get("model")
        quant_source = os.path.basename(model_ref) if model_ref else filename
        info = {
            "filename": filename,
            "base_name": base_name,
            "section": raw_name,
            "model": model_ref,
            "md": sec.get("md"),
            "mmproj": sec.get("mmproj"),
            "is_ready": _section_is_ready(sec),
            "quant": get_quantization_from_name(quant_source),
        }
        for key in {raw_name.lower(), base_name.lower(), filename.lower()}:
            index[key] = info
    return index


def _lookup_block(block_index: dict, *names) -> Optional[dict]:
    """Find a block by any of the supplied model names / ids (case-insensitive)."""
    for name in names:
        if not name:
            continue
        key = name.lower()
        for candidate in (key, key[:-5] if key.endswith(".gguf") else key):
            block = block_index.get(candidate)
            if block:
                return block
    return None


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
    """Build a dict mapping lowercase model filename -> capability flags
    (mmproj / MTP / DFLASH / DSPARK) by scanning both primary and secondary INI files."""
    lookup = {}
    for ini_path in [MODES_INI_PATH, MINI_MODELS_INI]:
        for m in _list_models_from_ini(ini_path):
            key = m["filename"].lower()
            if key not in lookup:
                lookup[key] = {"has_mmproj": m.get("has_mmproj", False), "has_mtp": m.get("has_mtp", False), "has_dflash": m.get("has_dflash", False), "has_dspark": m.get("has_dspark", False)}
            else:
                # Merge — prefer True if either is True
                if m.get("has_mmproj"):
                    lookup[key]["has_mmproj"] = True
                if m.get("has_mtp"):
                    lookup[key]["has_mtp"] = True
                if m.get("has_dflash"):
                    lookup[key]["has_dflash"] = True
                if m.get("has_dspark"):
                    lookup[key]["has_dspark"] = True
    return lookup


# ── Query endpoints ─────────────────────────────────────────────────────────────

async def get_benchmarks(show_all: bool = False, server: Optional[str] = None) -> dict:
    """Return benchmark list (fulfills /api/benchmarks)."""
    try:
        # Benchmark identity is the INI *block* (section header) per server —
        # never the `model=` target it references. Strata has no INI, so its
        # discovered model ids are the identity.
        block_indexes = {
            "primary": _build_block_index(MODES_INI_PATH),
            "secondary": _build_block_index(MINI_MODELS_INI),
        }

        # Build capabilities lookup (mmproj / mtp / dflash / dspark)
        cap_lookup = _build_capabilities_lookup()

        conn = get_db_conn()
        cursor = conn.cursor()
        # Per-(model_id, server) statistics over the retention window (last 5
        # runs) so a model ranked on the GTX is not contaminated by P100 runs.
        query = """
            WITH run_totals AS (
                SELECT tr.model_id,
                       COALESCE(tr.server, 'primary') AS server,
                       tr.run_id, tr.timestamp, tr.vram_gb,
                       SUM(rs.score) AS total_score,
                       MAX(CASE WHEN rs.round_name = 'speed_metric' THEN rs.speed_tps END) AS tps
                FROM test_runs tr
                LEFT JOIN round_scores rs ON rs.run_id = tr.run_id
                GROUP BY tr.model_id, COALESCE(tr.server, 'primary'), tr.run_id
            ),
            ranked AS (
                SELECT rt.*,
                       ROW_NUMBER() OVER (
                           PARTITION BY model_id, server ORDER BY timestamp DESC
                       ) AS rn
                FROM run_totals rt
            ),
            latest AS (
                SELECT * FROM ranked WHERE rn = 1
            ),
            last5 AS (
                SELECT * FROM ranked WHERE rn <= 5
            ),
            stats AS (
                SELECT model_id, server,
                       COUNT(total_score) AS runs_count,
                       AVG(total_score) AS avg_score,
                       AVG(tps) AS avg_tps,
                       SUM(total_score) AS sum_score,
                       SUM(total_score * total_score) AS sum_sq
                FROM last5
                GROUP BY model_id, server
            ),
            round_stats AS (
                SELECT l.model_id, l.server,
                       AVG(CASE WHEN rs.round_name IN ('abstract_logic', 'technical_reasoning')
                                THEN rs.score END) AS avg_reasoning,
                       AVG(CASE WHEN rs.round_name = 'code_generation'
                                THEN rs.score END) AS avg_code
                FROM last5 l
                JOIN round_scores rs ON rs.run_id = l.run_id
                GROUP BY l.model_id, l.server
            )
            SELECT m.model_id, m.name, m.quantization, LOWER(m.status) as status, m.notes,
                   m.vram_gb as model_vram_gb, m.category,
                   l.run_id, l.timestamp, l.total_score, l.tps, l.server, l.vram_gb as run_vram_gb,
                   st.runs_count, st.avg_score as scoped_avg_score, st.avg_tps as scoped_avg_tps,
                   st.sum_score, st.sum_sq,
                   rstat.avg_reasoning, rstat.avg_code,
                   (SELECT COUNT(*) FROM model_hallucinations mh WHERE mh.model_id = m.model_id) as hallucination_count
            FROM models m
            JOIN latest l ON l.model_id = m.model_id
            LEFT JOIN stats st ON st.model_id = l.model_id AND st.server = l.server
            LEFT JOIN round_stats rstat ON rstat.model_id = l.model_id AND rstat.server = l.server
            ORDER BY COALESCE(st.avg_score, l.total_score) DESC;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        from .aggregation import CATEGORY_LABELS, classify_model

        benchmarks = []
        primary_tested_names = set()
        secondary_tested_names = set()
        strata_tested_names = set()

        for r in rows:
            model_name = r["name"] or r["model_id"]
            name_low = model_name.lower()
            model_id_low = r["model_id"].lower()
            bench_server = r["server"] or "primary"

            # Per-server stats over the retention window (last 5 runs).
            scoped_runs = r["runs_count"] or 0
            scoped_avg_score = r["scoped_avg_score"]
            scoped_avg_tps = r["scoped_avg_tps"]
            variance = 0.0
            if scoped_runs > 1 and r["sum_score"] is not None and r["sum_sq"] is not None:
                # Sample variance (n-1), matching aggregation.calculate_and_store_model_aggregates.
                variance = (r["sum_sq"] - r["sum_score"] ** 2 / scoped_runs) / (scoped_runs - 1)
            score_stddev = math.sqrt(variance) if variance > 0 else 0.0
            latest_score = r["total_score"] or 0
            score = scoped_avg_score if scoped_avg_score is not None else latest_score
            avg_tps = scoped_avg_tps if scoped_avg_tps is not None else (r["tps"] or 0.0)
            hallucinated = r["hallucination_count"] > 0

            # Identity = INI block (section), never its model= target.
            block = None
            if bench_server in block_indexes:
                block = _lookup_block(block_indexes[bench_server], model_name, r["model_id"])

            if bench_server == "strata":
                strata_tested_names.add(name_low)
                strata_tested_names.add(model_id_low)
                strata_tested_names.add(_clean_model_id(r["model_id"]))
                if name_low.endswith(".gguf"):
                    strata_tested_names.add(name_low[:-5])
                else:
                    strata_tested_names.add(name_low + ".gguf")
                # Strata models are served dynamically (no INI); mark ready when tested.
                is_model_ready = True
                in_models_ini = False
                in_modelg_ini = False
                in_strata = True
                is_retired = False
            else:
                tested_names = (
                    primary_tested_names if bench_server == "primary"
                    else secondary_tested_names
                )
                tested_names.add(name_low)
                tested_names.add(model_id_low)
                if name_low.endswith(".gguf"):
                    tested_names.add(name_low[:-5])
                else:
                    tested_names.add(name_low + ".gguf")
                in_models_ini = block is not None and bench_server == "primary"
                in_modelg_ini = block is not None and bench_server == "secondary"
                in_strata = False
                # A tested model with no current INI block is retired/historical.
                is_retired = block is None
                is_model_ready = bool(block and block["is_ready"])

            if not show_all:
                if avg_tps < 20.0 or hallucinated or score < 50:
                    # Keep retired rows available so the UI can reveal them on demand.
                    if not is_model_ready and not is_retired:
                        continue

            if bench_server == "secondary":
                # Prefer per-run VRAM (server-scoped). Fall back to models.vram_gb
                # ONLY if it is plausibly a GTX reading (≤ 6 GB). A value > 6 GB
                # would mean it was captured on the primary P100 and would be
                # misleading when shown against the 6 GB secondary total.
                run_vram = r["run_vram_gb"]
                model_vram = r["model_vram_gb"]
                if run_vram is not None:
                    effective_vram = run_vram
                elif model_vram is not None and model_vram <= 6.0:
                    effective_vram = model_vram
                else:
                    effective_vram = None
            else:
                effective_vram = r["run_vram_gb"] if r["run_vram_gb"] is not None else r["model_vram_gb"]
            vram_total = _get_vram_total(bench_server)

            def _lookup_caps(key_low):
                caps = cap_lookup.get(key_low) or {}
                if not caps and not key_low.endswith('.gguf'):
                    caps = cap_lookup.get(key_low + '.gguf') or {}
                if not caps and key_low.endswith('.gguf'):
                    caps = cap_lookup.get(key_low[:-5]) or {}
                return caps
            caps_key = block["filename"].lower() if block else name_low
            caps = _lookup_caps(caps_key) or _lookup_caps(name_low) or _lookup_caps(model_id_low)

            # Category is computed from this server's runs, not the global model row.
            if scoped_runs and (r["avg_reasoning"] is not None or r["avg_code"] is not None):
                cat_key = classify_model(
                    avg_tps,
                    r["avg_reasoning"] or 0.0,
                    r["avg_code"] or 0.0,
                    effective_vram,
                )
            else:
                cat_key = r["category"] or "unclassified"

            # Quantization comes from the block's referenced weights file so
            # preset aliases (e.g. `-dspark.gguf`) don't render as "Unknown".
            quant = block["quant"] if block else (r["quantization"] or "Unknown")

            benchmarks.append({
                "model_id": r["model_id"],
                "model": model_name,
                "platform": _get_platform(bench_server),
                "server": bench_server,
                "quant": quant,
                "tokens_sec": round(avg_tps, 1),
                "score": score,
                "avg_score": score,
                "score_stddev": round(score_stddev, 2),
                "runs_count": scoped_runs or 1,
                "category": cat_key,
                "category_label": CATEGORY_LABELS.get(cat_key, "❓ Unclassified"),
                "vram_gb": effective_vram,
                "vram_total_gb": vram_total,
                "status": r["status"] if (r and r["status"]) else "testing",
                "is_ready": is_model_ready,
                "is_tested": True,
                "is_retired": is_retired,
                "in_models_ini": in_models_ini,
                "in_modelg_ini": in_modelg_ini,
                "in_strata": in_strata,
                "has_mmproj": caps.get("has_mmproj", False),
                "has_mtp": caps.get("has_mtp", False),
                "has_dflash": caps.get("has_dflash", False),
                "has_dspark": caps.get("has_dspark", False),
            })

        # Append untested models from both INI files
        for ini_path, default_server in [(MODES_INI_PATH, "primary"), (MINI_MODELS_INI, "secondary")]:
            if not os.path.exists(ini_path):
                continue
            tested_set = primary_tested_names if default_server == "primary" else secondary_tested_names
            try:
                for sec in _parse_ini_sections(ini_path):
                    raw_name = sec["section"]
                    if raw_name.lower().endswith(".gguf"):
                        base_name = raw_name[:-5]
                    else:
                        base_name = raw_name
                    filename = base_name + ".gguf"
                    if filename.lower() in tested_set or base_name.lower() in tested_set:
                        continue
                    db_status, db_vram = _db_lookup_model(filename)
                    vram_total = _get_vram_total(default_server)
                    caps = cap_lookup.get(filename.lower(), {})
                    file_ready = _section_is_ready(sec)
                    model_ref = sec.get("model")
                    quant_source = os.path.basename(model_ref) if model_ref else filename
                    benchmarks.append({
                        "model_id": filename,
                        "model": filename,
                        "platform": _get_platform(default_server),
                        "server": default_server,
                        "quant": get_quantization_from_name(quant_source),
                        "tokens_sec": None,
                        "score": None,
                        "avg_score": None,
                        "score_stddev": 0.0,
                        "runs_count": 0,
                        "category": "unclassified",
                        "category_label": "❓ Unclassified",
                        "vram_gb": db_vram,
                        "vram_total_gb": vram_total,
                        "status": db_status or "testing",
                        "is_ready": file_ready,
                        "is_tested": False,
                        "is_retired": False,
                        "in_models_ini": (default_server == "primary"),
                        "in_modelg_ini": (default_server == "secondary"),
                        "in_strata": False,
                        "has_mmproj": caps.get("has_mmproj", False),
                        "has_mtp": caps.get("has_mtp", False),
                        "has_dflash": caps.get("has_dflash", False),
                        "has_dspark": caps.get("has_dspark", False),
                    })
            except Exception as e:
                print(f"[Benchmarks API] Failed to append ready models from {ini_path}: {e}")

        # Append untested models served by Strata (no INI — discovered dynamically).
        try:
            strata_models = await list_strata_models()
            for sm in strata_models.get("models", []):
                mid = sm.get("filename")
                if not mid:
                    continue
                mid_low = mid.lower()
                if mid_low in strata_tested_names or _clean_model_id(mid) in strata_tested_names:
                    continue
                benchmarks.append({
                    "model_id": mid,
                    "model": mid,
                    "platform": _get_platform("strata"),
                    "server": "strata",
                    "quant": get_quantization_from_name(mid),
                    "tokens_sec": None,
                    "score": None,
                    "avg_score": None,
                    "score_stddev": 0.0,
                    "runs_count": 0,
                    "category": "unclassified",
                    "category_label": "❓ Unclassified",
                    "vram_gb": None,
                    "vram_total_gb": _get_vram_total("strata"),
                    "status": "testing",
                    "is_ready": True,
                    "is_tested": False,
                    "is_retired": False,
                    "in_models_ini": False,
                    "in_modelg_ini": False,
                    "in_strata": True,
                    "has_mmproj": False,
                    "has_mtp": False,
                    "has_dflash": False,
                    "has_dspark": False,
                })
        except Exception as e:
            print(f"[Benchmarks API] Failed to append Strata models: {e}")

        if server:
            s_low = server.lower()
            if s_low in ("primary", "secondary", "strata"):
                benchmarks = [b for b in benchmarks if b.get("server") == s_low]

        return {"benchmarks": benchmarks}
    except Exception as e:
        print(f"Error querying benchmarks database: {e}")
        return {"benchmarks": [], "error": str(e)}


def get_benchmark_details(model_id: str, server: str = "primary") -> dict:
    """Return detailed benchmark results for a specific model and server, including run history and aggregates."""
    try:
        model_id = _clean_model_id(model_id)
        conn = get_db_conn()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT model_id, name, quantization, LOWER(status) as status, vram_gb, notes,
                   category, avg_total_score, avg_tps, score_stddev, runs_count
            FROM models WHERE model_id = ?
        """, (model_id,))
        model_row = cursor.fetchone()
        if not model_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Model benchmark record not found")

        # Fetch latest run
        cursor.execute("SELECT run_id, timestamp, server, vram_gb, raw_output_path, execution_mode, temperature FROM test_runs WHERE model_id = ? AND server = ? ORDER BY timestamp DESC LIMIT 1", (model_id, server))
        run_row = cursor.fetchone()

        # Fetch all historical runs for this model & server
        cursor.execute("""
            SELECT tr.run_id, tr.timestamp, tr.server, tr.vram_gb, tr.execution_mode, tr.temperature,
                   SUM(rs.score) as total_score,
                   MAX(CASE WHEN rs.round_name = 'speed_metric' THEN rs.speed_tps END) as speed_tps
            FROM test_runs tr
            LEFT JOIN round_scores rs ON tr.run_id = rs.run_id
            WHERE tr.model_id = ? AND tr.server = ?
            GROUP BY tr.run_id
            ORDER BY tr.timestamp DESC
        """, (model_id, server))
        history_rows = cursor.fetchall()
        runs_history = [dict(r) for r in history_rows]

        # Server-scoped statistics over the retention window (last 5 runs).
        scoped_history = [h for h in runs_history if h["total_score"] is not None][:5]
        scoped_scores = [h["total_score"] for h in scoped_history]
        scoped_tps = [h["speed_tps"] for h in scoped_history if h["speed_tps"]]
        n_runs = len(scoped_scores)
        avg_total_score = (sum(scoped_scores) / n_runs) if n_runs else None
        if n_runs > 1:
            score_stddev = math.sqrt(
                sum((s - avg_total_score) ** 2 for s in scoped_scores) / (n_runs - 1)
            )
        else:
            score_stddev = 0.0
        avg_tps = (sum(scoped_tps) / len(scoped_tps)) if scoped_tps else None

        avg_reasoning = avg_code = None
        last5_ids = [h["run_id"] for h in runs_history[:5]]
        if last5_ids:
            placeholders = ",".join(["?"] * len(last5_ids))
            cursor.execute(f"""
                SELECT AVG(CASE WHEN round_name IN ('abstract_logic', 'technical_reasoning')
                                THEN score END) AS avg_reasoning,
                       AVG(CASE WHEN round_name = 'code_generation'
                                THEN score END) AS avg_code
                FROM round_scores WHERE run_id IN ({placeholders})
            """, last5_ids)
            round_avgs = cursor.fetchone()
            if round_avgs:
                avg_reasoning = round_avgs["avg_reasoning"]
                avg_code = round_avgs["avg_code"]

        rounds = []
        hallucinations = []
        timestamp = None
        run_id = None
        run_vram_gb = None
        if run_row:
            run_id = run_row["run_id"]
            timestamp = run_row["timestamp"]
            server = run_row["server"] or "primary"
            run_vram_gb = run_row["vram_gb"]
            cursor.execute("SELECT round_name, score, reasoning, speed_tps FROM round_scores WHERE run_id = ? ORDER BY id ASC", (run_id,))
            rounds = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT round_name, description FROM model_hallucinations WHERE model_id = ?", (model_id,))
            hallucinations = [dict(row) for row in cursor.fetchall()]
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

        from .aggregation import CATEGORY_LABELS, classify_model

        if server == "secondary":
            # Only fall back to models.vram_gb if it's plausibly a GTX reading (≤ 6 GB).
            if run_vram_gb is not None:
                effective_vram = run_vram_gb
            elif model_row and model_row["vram_gb"] is not None and model_row["vram_gb"] <= 6.0:
                effective_vram = model_row["vram_gb"]
            else:
                effective_vram = None
        else:
            effective_vram = run_vram_gb if run_vram_gb is not None else (model_row["vram_gb"] if model_row else None)
        total_gpu = _get_vram_total(server)

        if n_runs and (avg_reasoning is not None or avg_code is not None):
            cat_key = classify_model(
                avg_tps or 0.0,
                avg_reasoning or 0.0,
                avg_code or 0.0,
                effective_vram,
            )
        else:
            cat_key = model_row["category"] or "unclassified"

        return {
            "model_id": model_row["model_id"],
            "name": model_row["name"],
            "quantization": model_row["quantization"],
            "status": model_row["status"] if (model_row and model_row["status"]) else "testing",
            "category": cat_key,
            "category_label": CATEGORY_LABELS.get(cat_key, "❓ Unclassified"),
            "avg_total_score": round(avg_total_score, 2) if avg_total_score is not None else None,
            "avg_tps": round(avg_tps, 2) if avg_tps is not None else None,
            "score_stddev": round(score_stddev, 2),
            "runs_count": n_runs or len(runs_history) or 1,
            "vram_gb": effective_vram,
            "vram_total_gb": total_gpu,
            "notes": model_row["notes"],
            "run_id": run_id,
            "timestamp": timestamp,
            "server": server,
            "rounds": rounds,
            "hallucinations": hallucinations,
            "runs_history": runs_history,
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
