# SKILL: llm-gallery-management

## Purpose
Browse, organize, and manage generated images in the gallery. Includes safe deletion with explicit confirmation.

## MCP Tools Used
- `browse_gallery` — view images and folders
- `get_gallery_folders` — list all folders
- `create_gallery_folder` — create new folder
- `delete_gallery_images` — permanently delete images/folders

## Prerequisites
- None — gallery is always available

## Procedure

### 1. Browse Gallery
```
browse_gallery(path="", page=1, limit=24)
```
Returns:
- `folders` — subdirectories
- `images` — image files (up to 10 shown with metadata: filename, prompt preview, model, seed)
- `total_images`, `total_pages` — for pagination

Navigate by changing `path`:
```
browse_gallery(path="2024-07-24")   # Browse a date folder
browse_gallery(path="2024-07-24/experiments", page=2)  # Browse subfolder, page 2
```

### 2. List All Folders
```
get_gallery_folders()
```
Returns a flat list of all folder paths. Use this to discover the gallery structure.

### 3. Create Organization Folders
```
create_gallery_folder(folder_name="my-best-work", current_path="")
```
Creates organized folders to move images into. You can create nested folders:
```
create_gallery_folder(folder_name="portraits", current_path="2024-07-24")
```

### 4. Delete Images (⚠️ Destructive)
```
delete_gallery_images(
    filenames=["image_001.png", "image_002.png"],
    current_path="2024-07-24",
    folders=[],               # Optional: specify to delete whole folders
    confirm=True              # MUST be True to execute
)
```

⚠️ **Always browse the folder first** before deleting to confirm which files you're removing.

## Safety Checks
| Check | When | How |
|-------|------|-----|
| Confirm flag | Before delete | `delete_gallery_images` requires `confirm=True` |
| Path validation | All ops | Backend validates paths stay within gallery directory |
| Orphan cleanup | After delete | Backend auto-removes orphaned `.json` sidecar files |

## Edge Cases
- **Empty gallery**: `browse_gallery()` returns empty lists — generate some images first
- **Large galleries**: Use pagination (`page`, `limit`) rather than loading all at once
- **Sidecar file without image**: Backend auto-cleans these during browse
- **Delete non-existent file**: Returns error, other files still processed

## Recovery
- Gallery deletions are **permanent** — there is no undo. Always browse first to confirm
- If you accidentally delete something, check if it exists on the host filesystem at `/home/nui/dev/ComfyUI/output/`