"""Build the standalone static interface from the same schedule as the README."""
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from update_gantt import load_schedule


def build(root: Path) -> Path:
    load_schedule(root / "schedule.json")
    schedule = json.loads((root / "schedule.json").read_text(encoding="utf-8"))
    output = root / "dist"
    output.mkdir(exist_ok=True)
    for name in ("styles.css", "app.mjs", "gantt-core.mjs", "favicon.svg"):
        shutil.copyfile(root / "site" / name, output / name)
    def safe_json(value):
        return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")
    template = (root / "site" / "index.html").read_text(encoding="utf-8")
    html = template.replace("__SCHEDULE_JSON__", safe_json(schedule)).replace(
        "__BUILD_META__", safe_json({"published_at": datetime.now(timezone.utc).isoformat()})
    )
    with (output / "index.html").open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(html)
    with (output / "schedule.json").open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(schedule, ensure_ascii=False, indent=2) + "\n")
    (output / ".nojekyll").touch()
    return output


if __name__ == "__main__":
    print("Built: " + str(build(Path(__file__).resolve().parents[1])))
