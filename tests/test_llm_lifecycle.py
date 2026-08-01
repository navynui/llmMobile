"""Tests for services/llm_lifecycle.py — LLM idle-unload watchdog."""
import asyncio
import time
from unittest.mock import patch, AsyncMock

import pytest

import services.llm_lifecycle as ll


@pytest.fixture(autouse=True)
def reset_state():
    """Reset per-test module state and keep the watchdog fast."""
    with ll._state_lock:
        for name in ll._last_activity:
            ll._last_activity[name] = time.time()
    ll._watchdog_task = None
    with patch.object(ll, "WATCHDOG_INTERVAL", 0.05):
        yield


def test_touch_activity_per_server():
    ll.touch_activity("llama-server")
    ll.touch_activity("llama-server-mini")
    # Both should be near zero idle right after touching.
    assert ll.get_idle_seconds("llama-server") < 1.0
    assert ll.get_idle_seconds("llama-server-mini") < 1.0
    # Unknown server is ignored, not an error.
    ll.touch_activity("nope")


def test_idle_seconds_reflects_staleness():
    with ll._state_lock:
        ll._last_activity["llama-server"] = time.time() - 500
    assert ll.get_idle_seconds("llama-server") >= 500
    assert ll.get_idle_seconds("llama-server-mini") < 1.0


def test_server_key_from_url():
    assert ll._server_key_from_url("http://llm-server:8080") == "llama-server"
    assert ll._server_key_from_url("http://llm-server-mini:8080") == "llama-server-mini"


def _run_watchdog(seconds: float) -> None:
    async def _run():
        task = asyncio.create_task(ll._llm_idle_watchdog_loop())
        await asyncio.sleep(seconds)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    asyncio.run(_run())


def test_unloads_idle_loaded_server():
    with ll._state_lock:
        ll._last_activity["llama-server"] = time.time() - 9999
        ll._last_activity["llama-server-mini"] = time.time() - 9999

    async def fake_slots():
        return [
            {"name": "llama-server", "processing": False, "error": None, "loaded_model": "preset-a"},
            {"name": "llama-server-mini", "processing": False, "error": None, "loaded_model": "preset-b"},
        ]

    unload_mock = AsyncMock(return_value=True)
    with patch("services.llm_lifecycle._unload_loaded_model", unload_mock), \
         patch("services.llm_lifecycle.get_server_slots_status", side_effect=fake_slots), \
         patch("services.llm_lifecycle.get_benchmark_running", return_value=False), \
         patch("services.llm_lifecycle.is_queue_running", return_value=False), \
         patch("services.llm_lifecycle.get_gen_queue", return_value=[]):
        _run_watchdog(0.2)

    unload_mock.assert_any_call("llama-server", "preset-a")
    unload_mock.assert_any_call("llama-server-mini", "preset-b")


def test_processing_slot_resets_timer_and_skips_unload():
    with ll._state_lock:
        ll._last_activity["llama-server"] = time.time() - 9999

    async def fake_slots():
        return [{"name": "llama-server", "processing": True, "error": None, "loaded_model": "preset-a"}]

    unload_mock = AsyncMock(return_value=True)
    with patch("services.llm_lifecycle._unload_loaded_model", unload_mock), \
         patch("services.llm_lifecycle.get_server_slots_status", side_effect=fake_slots), \
         patch("services.llm_lifecycle.get_benchmark_running", return_value=False), \
         patch("services.llm_lifecycle.is_queue_running", return_value=False), \
         patch("services.llm_lifecycle.get_gen_queue", return_value=[]):
        _run_watchdog(0.2)

    unload_mock.assert_not_called()
    assert ll.get_idle_seconds("llama-server") < 1.0


def test_benchmark_guard_blocks_unload():
    with ll._state_lock:
        ll._last_activity["llama-server"] = time.time() - 9999

    async def fake_slots():
        return [{"name": "llama-server", "processing": False, "error": None, "loaded_model": "preset-a"}]

    unload_mock = AsyncMock(return_value=True)
    with patch("services.llm_lifecycle._unload_loaded_model", unload_mock), \
         patch("services.llm_lifecycle.get_server_slots_status", side_effect=fake_slots), \
         patch("services.llm_lifecycle.get_benchmark_running", return_value=True), \
         patch("services.llm_lifecycle.is_queue_running", return_value=False), \
         patch("services.llm_lifecycle.get_gen_queue", return_value=[]):
        _run_watchdog(0.2)

    unload_mock.assert_not_called()


def test_gen_queue_guard_blocks_unload():
    with ll._state_lock:
        ll._last_activity["llama-server"] = time.time() - 9999

    async def fake_slots():
        return [{"name": "llama-server", "processing": False, "error": None, "loaded_model": "preset-a"}]

    unload_mock = AsyncMock(return_value=True)
    with patch("services.llm_lifecycle._unload_loaded_model", unload_mock), \
         patch("services.llm_lifecycle.get_server_slots_status", side_effect=fake_slots), \
         patch("services.llm_lifecycle.get_benchmark_running", return_value=False), \
         patch("services.llm_lifecycle.is_queue_running", return_value=False), \
         patch("services.llm_lifecycle.get_gen_queue", return_value=[{"status": "running"}]):
        _run_watchdog(0.2)

    unload_mock.assert_not_called()


def test_disabled_env_skips_unload():
    with ll._state_lock:
        ll._last_activity["llama-server"] = time.time() - 9999

    async def fake_slots():
        return [{"name": "llama-server", "processing": False, "error": None, "loaded_model": "preset-a"}]

    unload_mock = AsyncMock(return_value=True)
    with patch("services.llm_lifecycle._unload_loaded_model", unload_mock), \
         patch("services.llm_lifecycle.get_server_slots_status", side_effect=fake_slots), \
         patch("services.llm_lifecycle.get_benchmark_running", return_value=False), \
         patch("services.llm_lifecycle.is_queue_running", return_value=False), \
         patch("services.llm_lifecycle.get_gen_queue", return_value=[]), \
         patch.dict("os.environ", {"LLM_IDLE_UNLOAD_ENABLED": "0"}):
        _run_watchdog(0.2)

    unload_mock.assert_not_called()
