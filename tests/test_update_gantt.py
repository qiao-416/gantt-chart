import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from update_gantt import END, START, Task, generated_content, load_schedule, render_mermaid, replace_generated, update


class GanttTests(unittest.TestCase):
    def test_end_date_is_inclusive_and_status_is_explicit(self):
        tasks = [
            Task("跨月任务", date(2026, 10, 26), date(2026, 11, 6), "planned"),
            Task("进行中", date(2026, 10, 19), date(2026, 10, 19), "active"),
            Task("完成", date(2026, 10, 20), date(2026, 10, 20), "done"),
        ]
        diagram = render_mermaid("测试计划", tasks)
        self.assertIn("t1, 2026-10-26, 12d", diagram)
        self.assertIn("active, t2, 2026-10-19, 1d", diagram)
        self.assertIn("done, t3, 2026-10-20, 1d", diagram)

    def test_daily_summary_includes_both_date_boundaries_without_completing_task(self):
        tasks = [Task("边界任务", date(2026, 10, 19), date(2026, 10, 22), "planned")]
        for day in (date(2026, 10, 19), date(2026, 10, 22)):
            content = generated_content("计划", tasks, day)
            self.assertIn("任务：边界任务", content)
            self.assertNotIn("done, t1", content)
        content = generated_content("计划", tasks, date(2026, 10, 23))
        self.assertIn("任务：无", content)
        self.assertNotIn("done, t1", content)

    def test_preserves_readme_outside_markers(self):
        readme = "用户的介绍\n" + START + "\n旧图\n" + END + "\n用户的说明\n"
        expected = "用户的介绍\n" + START + "\n\n新图\n\n" + END + "\n用户的说明\n"
        self.assertEqual(replace_generated(readme, "新图"), expected)

    def test_bad_markers_fail_instead_of_overwriting_readme(self):
        for readme in ("没有标记", END + START, START + END + START):
            with self.subTest(readme=readme), self.assertRaises(ValueError):
                replace_generated(readme, "新图")

    def test_invalid_schedule_is_rejected(self):
        base = {"name": "任务", "start": "2026-10-19", "end": "2026-10-22", "status": "planned"}
        invalid = [
            {"end": "2026-10-18"}, {"start": "2026-02-30"}, {"start": "20261019"},
            {"status": "finished"}, {"status": []}, {"name": "注入 : done"}, {"name": "换\n行"},
        ]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "schedule.json"
            for patch in invalid:
                with self.subTest(patch=patch):
                    path.write_text(json.dumps({"title": "计划", "tasks": [base | patch]}), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        load_schedule(path)
            for data in ([], {}, {"title": "计划", "tasks": []}):
                path.write_text(json.dumps(data), encoding="utf-8")
                with self.assertRaises(ValueError):
                    load_schedule(path)

    def test_repeat_runs_are_noop_and_source_changes_are_synchronized(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "schedule.json"
            data = {"title": "计划", "tasks": [{"name": "需求", "start": "2026-10-19", "end": "2026-10-22"}]}
            path.write_text(json.dumps(data), encoding="utf-8")
            (root / "README.md").write_text("介绍\n" + START + "\n" + END + "\n保留\n", encoding="utf-8")
            first = date(2026, 10, 19)
            self.assertEqual(update(root, first), ["README.md", "docs/gantt.mmd"])
            self.assertEqual(update(root, first), [])
            self.assertEqual(update(root, date(2026, 10, 20)), ["README.md"])
            data["tasks"][0]["end"] = "2026-10-23"
            data["tasks"][0]["status"] = "done"
            path.write_text(json.dumps(data), encoding="utf-8")
            self.assertEqual(update(root, first), ["README.md", "docs/gantt.mmd"])
            self.assertIn("done, t1, 2026-10-19, 5d", (root / "docs/gantt.mmd").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
