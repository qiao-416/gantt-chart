import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_site import build


class WebsiteBuildTests(unittest.TestCase):
    def test_standalone_package_contains_matching_data_and_all_assets(self):
        source = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            shutil.copytree(source / "site", root / "site")
            shutil.copyfile(source / "schedule.json", root / "schedule.json")
            output = build(root)
            html = (output / "index.html").read_text(encoding="utf-8")
            self.assertNotIn("__SCHEDULE_JSON__", html)
            self.assertNotIn("__BUILD_META__", html)
            self.assertIn('id="initialSchedule"', html)
            self.assertEqual(json.loads((output / "schedule.json").read_text(encoding="utf-8")), json.loads((root / "schedule.json").read_text(encoding="utf-8")))
            for asset in ("app.mjs", "gantt-core.mjs", "styles.css", "favicon.svg", ".nojekyll"):
                self.assertTrue((output / asset).is_file(), asset)
