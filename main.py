from fastapi import FastAPI

app = FastAPI(title="LLM Mobile Manager")

@app.get("/")
def read_root():
    return {"message": "Hello from LLM Mobile Manager Phase 0"}

@app.get("/status")
def get_status():
    return {"status": "ok", "phase": 0}
