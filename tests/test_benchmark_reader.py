"""Tests for services/benchmark/reader.py — preset alias readiness.

Regression coverage for preset blocks whose section header (the llama-server
preset id) differs from the model/draft files they reference, e.g.:

    [gemma-4-E4B-it-dspark.gguf]
    model = /models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf
    md = /models/gemma-4-E4B-it-dspark-Q8_0.gguf
"""
import asyncio

import pytest

import services.benchmark.reader as reader


class _FakeCursor:
    def execute(self, *args, **kwargs):
        return self

    def fetchall(self):
        return []

    def fetchone(self):
        return None


class _FakeConn:
    def cursor(self):
        return _FakeCursor()

    def close(self):
        pass


def test_parse_ini_sections_captures_referenced_files(tmp_path):
    ini = tmp_path / "modelg.ini"
    ini.write_text(
        "version = 1\n"
        "\n"
        "[*]\n"
        "c = 65536\n"
        "\n"
        "[alias-preset.gguf]\n"
        "model = /models/base.gguf\n"
        'md = "/models/draft.gguf"\n'
        ";mmproj = /models/mmproj.gguf\n"
        "spec-type = draft-dspark\n"
    )

    assert reader._parse_ini_sections(str(ini)) == [{
        "section": "alias-preset.gguf",
        "model": "/models/base.gguf",
        "md": "/models/draft.gguf",
        "mmproj": None,
    }]


def test_section_is_ready_uses_referenced_files(tmp_path, monkeypatch):
    monkeypatch.setattr(reader, "MODELS_DIR", str(tmp_path))
    (tmp_path / "base.gguf").write_bytes(b"")
    (tmp_path / "draft.gguf").write_bytes(b"")

    section = {
        "section": "alias.gguf",
        "model": "/models/base.gguf",
        "md": "/models/draft.gguf",
        "mmproj": None,
    }
    assert reader._section_is_ready(section) is True

    (tmp_path / "draft.gguf").unlink()
    assert reader._section_is_ready(section) is False
    assert reader._section_is_ready(
        {"section": "empty.gguf", "model": None, "md": None, "mmproj": None}
    ) is False


@pytest.fixture
def alias_ini_env(tmp_path, monkeypatch):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    (models_dir / "base-model.gguf").write_bytes(b"")
    (models_dir / "draft-model.gguf").write_bytes(b"")

    ini = models_dir / "modelg.ini"
    ini.write_text(
        "[*]\n"
        "c = 65536\n"
        "\n"
        "[my-preset.gguf]\n"
        "model = /models/base-model.gguf\n"
        "md = /models/draft-model.gguf\n"
        "spec-type = draft-dspark\n"
    )

    monkeypatch.setattr(reader, "MODELS_DIR", str(models_dir))
    monkeypatch.setattr(reader, "MODES_INI_PATH", str(models_dir / "models.ini"))
    monkeypatch.setattr(reader, "MINI_MODELS_INI", str(ini))
    monkeypatch.setattr(reader, "get_db_conn", lambda: _FakeConn())

    async def _no_strata():
        return {"models": []}

    monkeypatch.setattr(reader, "list_strata_models", _no_strata)
    return models_dir


def test_untested_alias_preset_is_marked_ready(alias_ini_env):
    data = asyncio.run(reader.get_benchmarks(show_all=False))
    entry = next(b for b in data["benchmarks"] if b["model_id"] == "my-preset.gguf")

    assert entry["server"] == "secondary"
    assert entry["is_ready"] is True
    assert entry["in_modelg_ini"] is True
    assert entry["is_tested"] is False


def test_untested_preset_not_ready_when_draft_file_missing(alias_ini_env):
    (alias_ini_env / "draft-model.gguf").unlink()

    data = asyncio.run(reader.get_benchmarks(show_all=False))
    entry = next(b for b in data["benchmarks"] if b["model_id"] == "my-preset.gguf")

    assert entry["is_ready"] is False


# ── Block identity / retirement ────────────────────────────────────────────────

class _Row(dict):
    """sqlite3.Row-like mapping."""

    def __getitem__(self, key):
        return self.get(key)


class _RowsCursor(_FakeCursor):
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _RowsConn:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self):
        return _RowsCursor(self._rows)

    def close(self):
        pass


def _bench_row(model_id, name=None, server="secondary", **overrides):
    row = {
        "model_id": model_id,
        "name": name or model_id,
        "quantization": "Unknown",
        "status": "good",
        "notes": None,
        "model_vram_gb": None,
        "category": None,
        "run_id": f"run-{model_id}",
        "timestamp": "2026-01-01 00:00:00",
        "total_score": 70,
        "tps": 30.0,
        "server": server,
        "run_vram_gb": None,
        "runs_count": 1,
        "scoped_avg_score": 70.0,
        "scoped_avg_tps": 30.0,
        "sum_score": 70,
        "sum_sq": 4900,
        "avg_reasoning": 14.0,
        "avg_code": 14.0,
        "hallucination_count": 0,
    }
    row.update(overrides)
    return _Row(row)


def test_build_block_index_uses_section_and_model_target(alias_ini_env):
    index = reader._build_block_index(str(alias_ini_env / "modelg.ini"))

    block = reader._lookup_block(index, "my-preset.gguf")
    assert block is not None
    assert block["base_name"] == "my-preset"
    assert block["quant"] == "Unknown"  # base-model.gguf has no quant token
    assert block["is_ready"] is True

    # Lookup by base name (no .gguf) resolves the same block.
    assert reader._lookup_block(index, "MY-PRESET") is block


def test_tested_row_without_block_is_retired(alias_ini_env, monkeypatch):
    row = _bench_row("legacy-model")
    monkeypatch.setattr(reader, "get_db_conn", lambda: _RowsConn([row]))

    data = asyncio.run(reader.get_benchmarks(show_all=False))
    entry = next(b for b in data["benchmarks"] if b["model_id"] == "legacy-model")

    assert entry["is_retired"] is True
    assert entry["is_ready"] is False
    assert entry["in_modelg_ini"] is False
    assert entry["runs_count"] == 1


def test_tested_row_matching_block_is_ranked_with_model_quant(alias_ini_env, monkeypatch, tmp_path):
    # Give the referenced weights a recognizable quantization token.
    (alias_ini_env / "base-Q4_K_XL.gguf").write_bytes(b"")
    (alias_ini_env / "modelg.ini").write_text(
        "[*]\n"
        "\n"
        "[my-preset.gguf]\n"
        "model = /models/base-Q4_K_XL.gguf\n"
    )
    row = _bench_row("my-preset.gguf")
    monkeypatch.setattr(reader, "get_db_conn", lambda: _RowsConn([row]))

    data = asyncio.run(reader.get_benchmarks(show_all=False))
    entry = next(b for b in data["benchmarks"] if b["model_id"] == "my-preset.gguf")

    assert entry["is_retired"] is False
    assert entry["is_ready"] is True
    assert entry["in_modelg_ini"] is True
    assert entry["quant"] == "Q4_K_XL"

