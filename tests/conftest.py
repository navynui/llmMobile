import sys
import os
from unittest.mock import MagicMock, patch
import pytest

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def pytest_collection_modifyitems(config, items):
    for item in items:
        if "needs_docker" in item.keywords:
            item.add_marker(pytest.mark.xfail(
                os.environ.get("CI_SKIP_DOCKER_TESTS", "") == "1",
                reason="Docker daemon not available"
            ))

@pytest.fixture(scope="module")
def mock_docker():
    """Patch docker_client to simulate both containers running."""
    docker_mock = MagicMock()
    container_mock = MagicMock()
    container_mock.logs.return_value = b"container log output\n"
    container_mock.status = "running"
    container_mock.image.tags = ["llama-server:latest"]
    container_mock.image.id = "sha256:mockimage"
    container_mock.attrs = {"State": {"StartedAt": "2021-01-01T00:00:00Z"}}
    docker_mock.containers.get.return_value = container_mock
    with patch.dict(sys.modules, {'docker': MagicMock(DockerClient=lambda *a, **k: docker_mock)}):
        yield docker_mock
