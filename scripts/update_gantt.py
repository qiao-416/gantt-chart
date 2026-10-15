"""Generate a Mermaid Gantt chart from schedule.json, using only the standard library."""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

START = "<!-- GANTT:START -->"
END = "<!-- GANTT:END -->"
STATUSES = {"planned": "", "active": "active, ", "done": "done, "}


@dataclass(frozen=True)
class Task:
    name: str
    start: date
    end: date
    status: str

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


def label(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field}: expected non-empty text")
    if any(char in value for char in "\r\n:;`<>") or "%%" in value:
        raise ValueError(f"{field}: text contains a Mermaid delimiter")
    return value.strip()


def parse_date(value: object, field: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{field}: expected YYYY-MM-DD")
    return date.fromisoformat(value)


def load_schedule(path: Path) -> tuple[str, list[Task]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("schedule.json must contain an object")
    title = label(data.get("title"), "title")
    raw_tasks = data.get("tasks")
    if not isinstance(raw_tasks, list) or not raw_tasks:
        raise ValueError("tasks must be a non-empty list")
    tasks = []
    for index, raw in enumerate(raw_tasks, 1):
        field = f"task {index}"
        if not isinstance(raw, dict):
            raise ValueError(f"{field}: expected an object")
        name = label(raw.get("name"), field + " name")
        start = parse_date(raw.get("start"), field + " start")
        end = parse_date(raw.get("end"), field + " end")
        if end < start:
            raise ValueError(f"{field}: end must not be before start")
        status = raw.get("status", "planned")
        if not isinstance(status, str) or status not in STATUSES:
            raise ValueError(f"{field}: status must be planned, active, or done")
        tasks.append(Task(name, start, end, status))
    return title, tasks


def render_mermaid(title: str, tasks: list[Task]) -> str:
    lines = [
        "gantt", f"    title {title}", "    dateFormat YYYY-MM-DD",
        "    axisFormat %m/%d", "    tickInterval 1week", "    section 项目开发",
    ]
    for index, task in enumerate(tasks, 1):
        lines.append(
            f"    {task.name} : {STATUSES[task.status]}t{index}, {task.start.isoformat()}, {task.days}d"
        )
    return "\n".join(lines) + "\n"


def generated_content(title: str, tasks: list[Task], today: date) -> str:
    planned_today = [task.name for task in tasks if task.start <= today <= task.end]
    today_text = "、".join(planned_today) if planned_today else "无"
    # This describes the planned date windows; it does not infer actual progress.
    return (
        f"更新日期：**{today.isoformat()}（UTC）**。今日处于计划日期内的任务：{today_text}。\n\n"
        f"```mermaid\n{render_mermaid(title, tasks)}```\n\n"
        "任务状态来自 `schedule.json`；每日更新不会自动认定任务已完成。\n"
    )


def replace_generated(readme: str, content: str) -> str:
    if readme.count(START) != 1 or readme.count(END) != 1:
        raise ValueError("README.md must have exactly one GANTT:START and GANTT:END marker")
    start = readme.index(START) + len(START)
    end = readme.index(END)
    if start > end:
        raise ValueError("README.md generation markers are out of order")
    return readme[:start] + "\n\n" + content.rstrip() + "\n\n" + readme[end:]


def update(root: Path, today: date) -> list[str]:
    title, tasks = load_schedule(root / "schedule.json")
    readme_path = root / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    outputs = {
        readme_path: replace_generated(readme, generated_content(title, tasks, today)),
        root / "docs" / "gantt.mmd": render_mermaid(title, tasks),
    }
    changed = []
    # Validate and render everything before writing either output.
    for path, content in outputs.items():
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", encoding="utf-8", newline="\n") as stream:
                stream.write(content)
            changed.append(path.relative_to(root).as_posix())
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", type=date.fromisoformat, help="Override the UTC date (YYYY-MM-DD)")
    args = parser.parse_args()
    today = args.date or datetime.now(timezone.utc).date()
    root = Path(__file__).resolve().parents[1]
    try:
        changed = update(root, today)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Cannot update Gantt: {error}\n")
    print("Updated: " + ", ".join(changed) if changed else "Gantt is already up to date.")


if __name__ == "__main__":
    main()
