import httpx
import urllib.parse
from fastapi import HTTPException

async def search_hf_models(q: str):
    url = f"https://huggingface.co/api/models?search={urllib.parse.quote(q)}&filter=gguf&limit=10"
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=10.0)
            return r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))


async def get_hf_model_details(repo_id: str):
    url = f"https://huggingface.co/api/models/{repo_id}?blobs=true"
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=10.0)
            data = r.json()
            gguf_files = []
            for s in data.get("siblings", []):
                fname = s.get("rfilename", "")
                if fname.lower().endswith(".gguf"):
                    gguf_files.append({"filename": fname, "size": s.get("size")})
            return {
                "repo_id": repo_id,
                "gguf_files": gguf_files,
                "downloads": data.get("downloads", 0),
                "likes": data.get("likes", 0)
            }
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
