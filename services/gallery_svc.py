import os
import json
import shutil
import urllib.parse
from fastapi import HTTPException

from utils.common import IMAGE_GEN_OUTPUT, safe_join
from models.requests import MkdirRequest, MoveRequest, DeleteRequest

def _read_sidecar(image_path: str) -> dict:
    base = os.path.splitext(image_path)[0]
    sidecar = base + ".json"
    if os.path.exists(sidecar):
        try:
            with open(sidecar) as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def browse_gallery(path: str = "", page: int = 1, limit: int = 24):
    if not os.path.exists(IMAGE_GEN_OUTPUT):
        return {"current_path": "", "folders": [], "images": [],
                "total_images": 0, "page": 1, "limit": limit, "total_pages": 0}

    target_dir = safe_join(IMAGE_GEN_OUTPUT, path)
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Directory not found")

    folders, images = [], []

    for name in os.listdir(target_dir):
        if name.startswith(".") or name.endswith(".json"):
            continue
        full = os.path.join(target_dir, name)
        rel  = os.path.relpath(full, IMAGE_GEN_OUTPUT)
        if os.path.isdir(full):
            folders.append({"name": name, "relative_path": rel})
        elif name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            mtime    = os.path.getmtime(full)
            url_path = "/".join(urllib.parse.quote(p) for p in rel.split(os.sep))
            sidecar  = _read_sidecar(full)
            images.append({
                "filename":      name,
                "relative_path": rel,
                "url":           f"/images/{url_path}",
                "mtime":         mtime,
                "prompt":        sidecar.get("prompt"),
                "seed":          sidecar.get("seed"),
                "model":         sidecar.get("model"),
                "timestamp":     sidecar.get("timestamp"),
                "generation_id": sidecar.get("generation_id"),
            })

    folders.sort(key=lambda x: x["name"].lower())
    images.sort(key=lambda x: x["mtime"], reverse=True)

    # Orphan sidecar cleanup (delete .json with no matching image)
    for name in os.listdir(target_dir):
        if name.endswith(".json"):
            img_base = os.path.join(target_dir, os.path.splitext(name)[0])
            has_image = any(os.path.exists(img_base + ext) for ext in [".png", ".jpg", ".jpeg", ".webp"])
            if not has_image:
                try:
                    os.remove(os.path.join(target_dir, name))
                except Exception:
                    pass

    total   = len(images)
    pages   = max(1, (total + limit - 1) // limit) if total > 0 else 0
    start   = (page - 1) * limit
    paged   = images[start:start + limit]

    return {"current_path": path, "folders": folders, "images": paged,
            "total_images": total, "page": page, "limit": limit, "total_pages": pages}

def get_all_folders():
    if not os.path.exists(IMAGE_GEN_OUTPUT):
        return []
    folders = [""]
    for root, dirs, _ in os.walk(IMAGE_GEN_OUTPUT):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for d in dirs:
            rel = os.path.relpath(os.path.join(root, d), IMAGE_GEN_OUTPUT)
            folders.append(rel)
    folders.sort(key=str.lower)
    return folders

def gallery_mkdir(req: MkdirRequest):
    target = safe_join(IMAGE_GEN_OUTPUT, req.current_path, req.folder_name)
    os.makedirs(target, exist_ok=True)
    return {"detail": "Folder created"}

def gallery_move(req: MoveRequest):
    dest_dir = safe_join(IMAGE_GEN_OUTPUT, req.destination)
    if not os.path.isdir(dest_dir):
        raise HTTPException(status_code=400, detail="Destination does not exist")
    moved, errors = [], []
    for rel in req.filenames:
        src = safe_join(IMAGE_GEN_OUTPUT, req.current_path, rel)
        dst = os.path.join(dest_dir, os.path.basename(src))
        try:
            shutil.move(src, dst)
            # Also move sidecar if exists
            sidecar_src = os.path.splitext(src)[0] + ".json"
            if os.path.exists(sidecar_src):
                shutil.move(sidecar_src, os.path.join(dest_dir, os.path.basename(sidecar_src)))
            moved.append(rel)
        except Exception as e:
            errors.append(str(e))
    if errors:
        raise HTTPException(status_code=500, detail=f"Moved {len(moved)}, errors: {errors}")
    return {"detail": f"Moved {len(moved)} files", "moved": moved}

def gallery_delete(req: DeleteRequest):
    deleted, errors = [], []
    for rel in req.filenames:
        path = safe_join(IMAGE_GEN_OUTPUT, req.current_path, rel)
        try:
            os.remove(path)
            sidecar = os.path.splitext(path)[0] + ".json"
            if os.path.exists(sidecar):
                os.remove(sidecar)
            deleted.append(rel)
        except Exception as e:
            errors.append(str(e))
    for rel_dir in req.folders:
        path = safe_join(IMAGE_GEN_OUTPUT, req.current_path, rel_dir)
        try:
            shutil.rmtree(path)
        except Exception as e:
            errors.append(str(e))
    if errors:
        raise HTTPException(status_code=500, detail=str(errors))
    return {"detail": f"Deleted {len(deleted)} files"}
