from pydantic import BaseModel
from typing import Optional, List

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
    force_generate: Optional[bool] = False

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

class BenchmarkQueueRequest(BaseModel):
    models: list[str]
    judge_model_id: str

class JudgeRequest(BaseModel):
    run_id: Optional[str] = None
    judge_model_id: Optional[str] = None
