from pydantic import BaseModel, field_validator
from typing import Optional, List

_ALLOWED_SERVERS = ("primary", "secondary", "strata")

class ModelsIniRequest(BaseModel):
    content: str

class ModelActionRequest(BaseModel):
    model: str

class GenerateRequest(BaseModel):
    prompt: str
    resolution: str = "1920x1088"
    num_images: int = 1
    seed: Optional[int] = None
    model: str = "zimage"
    selected_workflows: Optional[list[str]] = None
    force_generate: Optional[bool] = False
    krea_multiplier: Optional[float] = None
    enhancer_strength: Optional[float] = None


class GenerateEditRequest(BaseModel):
    prompt: str
    steps: int = 8

class MkdirRequest(BaseModel):
    current_path: str
    folder_name: str

class MoveRequest(BaseModel):
    current_path: str
    filenames: list
    destination: str

class DeleteRequest(BaseModel):
    current_path: str
    filenames: list
    folders: list

class DownloadRequest(BaseModel):
    repo_id: str
    filename: str

class BenchmarkRunRequest(BaseModel):
    judge_model_id: Optional[str] = None
    server: str = "primary"
    execution_mode: Optional[str] = "full"  # 'full', 'fast_screen', 'speed_multi'
    run_count: Optional[int] = 1
    temperature: Optional[float] = 0.7

    @field_validator("server")
    @classmethod
    def _validate_server(cls, v: str) -> str:
        if v not in _ALLOWED_SERVERS:
            raise ValueError(f"server must be one of {_ALLOWED_SERVERS}")
        return v


class BenchmarkQueueRequest(BaseModel):
    models: list[str]
    judge_model_id: str
    server: str = "primary"
    execution_mode: Optional[str] = "full"
    run_count: Optional[int] = 1
    temperature: Optional[float] = 0.7

    @field_validator("server")
    @classmethod
    def _validate_server(cls, v: str) -> str:
        if v not in _ALLOWED_SERVERS:
            raise ValueError(f"server must be one of {_ALLOWED_SERVERS}")
        return v

class TemperatureSweepRequest(BaseModel):
    judge_model_id: Optional[str] = None
    server: str = "primary"
    temperatures: Optional[list[float]] = None


class JudgeRequest(BaseModel):
    run_id: Optional[str] = None
    judge_model_id: Optional[str] = None
