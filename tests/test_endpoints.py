import pytest
from fastapi.testclient import TestClient

def test_routes_exist(mock_docker):
    from app.main import app
    client = TestClient(app)
    expected_paths = {
        "/status", "/system_stats", "/start", "/stop",
        "/models", "/models/{filename}",
        "/api/models_ini", "/api/llm/models", "/api/llm/models/load", "/api/llm/models/unload",
        "/models/vision-capabilities", "/api/chat/completions",
        "/events/status",
        "/api/generate/queue", "/api/generate/queue/{queue_id}", "/events/queue",
        "/api/gallery/browse", "/api/gallery/all_folders", "/api/gallery/mkdir",
        "/api/gallery/move", "/api/gallery/delete",
        "/api/models/search", "/api/models/details", "/api/models/download",
        "/api/models/downloads", "/api/models/scan_and_register",
        "/api/benchmarks", "/api/benchmarks/details", "/api/benchmarks/queue/run",
        "/api/benchmarks/run", "/api/benchmarks/status", "/api/benchmarks/logs",
        "/api/benchmarks/outputs", "/api/benchmarks/judge",
        "/api/logs", "/manifest.json",
    }
    actual_paths = {route.path for route in app.routes}
    for path in expected_paths:
        assert path in actual_paths, f"Route {path} is missing!"

def test_static_routes(mock_docker):
    from app.main import app
    client = TestClient(app)
    resp = client.get("/manifest.json")
    assert resp.status_code == 200
    assert resp.json()["name"] == "LLM Mobile Manager"

def test_status_endpoint(mock_docker):
    from app.main import app
    client = TestClient(app)
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "server" in data
    assert "manager" in data

def test_models_endpoints(mock_docker):
    from app.main import app
    client = TestClient(app)
    assert client.get("/models").status_code == 200
    assert client.get("/api/models_ini").status_code == 200
    assert client.delete("/models/nonexistent-model.gguf").status_code == 200

def test_chat_endpoint(mock_docker):
    from app.main import app
    client = TestClient(app)
    resp = client.post("/api/chat/completions", json={})
    assert resp.status_code in (200, 400, 422, 502)

def test_queue_endpoints(mock_docker):
    from app.main import app
    client = TestClient(app)
    assert client.get("/api/generate/queue").status_code == 200
    assert "queue" in client.get("/api/generate/queue").json()

def test_gallery_endpoints(mock_docker):
    from app.main import app
    client = TestClient(app)
    assert client.get("/api/gallery/browse").status_code in (200, 404)
    assert client.get("/api/gallery/all_folders").status_code in (200, 404)
    resp = client.post("/api/gallery/mkdir", json={"current_path": "", "folder_name": "test-verify"})
    assert resp.status_code in (200, 400, 409, 422)
    resp = client.post("/api/gallery/move", json={"current_path": "", "filenames": ["?"], "destination": "?"})
    assert resp.status_code in (200, 400, 404, 422)
    resp = client.post("/api/gallery/delete", json={"current_path": "", "filenames": [], "folders": []})
    assert resp.status_code in (200, 400, 404, 422)

def test_model_search_endpoints(mock_docker):
    from app.main import app
    client = TestClient(app)
    resp = client.get("/api/models/search", params={"q": "phi"})
    assert resp.status_code in (200, 400, 422, 500, 502)

def test_logs_endpoint(mock_docker):
    from app.main import app
    client = TestClient(app)
    resp = client.get("/api/logs")
    assert resp.status_code == 200
    assert "logs" in resp.json()

def test_benchmarks_ini_filtering(mock_docker):
    from app.main import app
    client = TestClient(app)
    # Default (all)
    resp = client.get("/api/benchmarks?show_all=true")
    assert resp.status_code == 200
    benchmarks = resp.json()["benchmarks"]
    assert len(benchmarks) > 0
    # Every returned benchmark should contain in_models_ini and in_modelg_ini flags
    for b in benchmarks:
        assert "in_models_ini" in b
        assert "in_modelg_ini" in b

    # Server = primary filter
    resp_p = client.get("/api/benchmarks?show_all=true&server=primary")
    assert resp_p.status_code == 200
    for b in resp_p.json()["benchmarks"]:
        assert b["in_models_ini"] is True

    # Server = secondary filter
    resp_s = client.get("/api/benchmarks?show_all=true&server=secondary")
    assert resp_s.status_code == 200
    for b in resp_s.json()["benchmarks"]:
        assert b["in_modelg_ini"] is True

