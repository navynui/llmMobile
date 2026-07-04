from typing import Optional

def get_gold_key(round_name: str) -> Optional[str]:
    round_map = {
        "round 1": "knowledge_qa",
        "round 2": "technical_reasoning",
        "round 3": "code_generation",
        "round 4": "abstract_logic",
        "round 5": "creative_writing"
    }
    r_lower = round_name.lower().strip()
    if r_lower in ["knowledge_qa", "technical_reasoning", "code_generation", "abstract_logic", "creative_writing"]:
        return r_lower
    for key, val in round_map.items():
        if key in r_lower:
            return val
    return None


def get_gold_answers() -> dict:
    paths = [
        "/app/answers1.json",
        "/home/nui/llmaCPP/answers1.json",
        "/llm-server/answers1.json"
    ]
    for path in paths:
        if __import__("os").path.exists(path):
            try:
                import json
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    raise FileNotFoundError("Could not locate answers1.json")


def load_raw_json(path_str: str) -> dict:
    import os, json
    if os.path.exists(path_str):
        with open(path_str, "r", encoding="utf-8") as f:
            return json.load(f)

    basename = os.path.basename(path_str)
    alternates = [
        os.path.join("/home/nui/workspace/llmTest/model_test_output", basename),
        os.path.join("/llm-server/benchmark_results", basename),
        os.path.join("/app/benchmark_results", basename),
        os.path.join("/home/nui/llmaCPP/benchmark_results", basename),
    ]
    for alt in alternates:
        if os.path.exists(alt):
            try:
                with open(alt, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    raise FileNotFoundError(f"Could not load raw JSON for path: {path_str}")
