import pytest
from fastapi.testclient import TestClient

def test_routes_exist(mock_docker):
    from app.main import app
    client = TestClient(app)
    
    # List of endpoints to verify
    expected_paths = {
        "/status",
        "/system_stats",
        "/start",
        "/stop",
        "/models",
        "/models/{filename}",
        "/api/models_ini",
        "/api/llm/models",
        "/api/llm/models/load",
        "/api/llm/models/unload",
        "/models/vision-capabilities",
        "/api/chat/completions",
        "/events/status",
        "/api/generate/queue",
        "/api/generate/queue/{queue_id}",
        "/events/queue",
        "/api/gallery/browse",
        "/api/gallery/all_folders",
        "/api/gallery/mkdir",
        "/api/gallery/move",
        "/api/gallery/delete",
        "/api/models/search",
        "/api/models/details",
        "/api/models/download",
        "/api/models/downloads",
        "/api/models/scan_and_register",
        "/api/benchmarks",
        "/api/benchmarks/details",
        "/api/benchmarks/queue/run",
        "/api/benchmarks/run",
        "/api/benchmarks/status",
        "/api/benchmarks/logs",
        "/api/benchmarks/outputs",
        "/api/benchmarks/judge",
        "/api/logs",
        "/manifest.json"
    }
    
    actual_paths = {route.path for route in app.routes}
    
    for path in expected_paths:
        assert path in actual_paths, f"Route {path} is missing!"

def test_static_routes(mock_docker):
    from app.main import app
    client = TestClient(app)
    
    # Test manifest.json route
    resp = client.get("/manifest.json")
    assert resp.status_code == 200
    assert resp.json()["name"] == "LLM Server Manager Mobile"

def test_status_endpoint(mock_docker):
    from app.main import app
    client = TestClient(app)
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "server" in data
    assert "manager" in data
