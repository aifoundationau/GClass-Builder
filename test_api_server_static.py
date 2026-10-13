#!/usr/bin/env python3
"""The web server only hands out files from dist/, never project files such as .env."""

import os
import tempfile
import unittest
from unittest import mock

import api_server


class DistFileTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.dist = os.path.join(self.root, "dist")
        os.makedirs(os.path.join(self.dist, "assets"))
        for path in ("dist/index.html", "dist/assets/app.js", ".env", "credentials.json"):
            with open(os.path.join(self.root, path), "w", encoding="utf-8") as f:
                f.write("x")
        patcher = mock.patch.object(api_server, "_dist_dir", return_value=self.dist)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_built_files_are_served(self):
        self.assertEqual(api_server._dist_file("/assets/app.js"), os.path.realpath(os.path.join(self.dist, "assets", "app.js")))
        self.assertEqual(api_server._dist_file("index.html"), os.path.realpath(os.path.join(self.dist, "index.html")))

    def test_paths_outside_dist_are_refused(self):
        for path in ("/../.env", "/assets/../../.env", "/..%2f.env", "/%2e%2e/credentials.json",
                     "/..\\credentials.json", os.path.join(self.root, ".env")):
            self.assertIsNone(api_server._dist_file(path), path)

    def test_missing_files_and_directories_are_refused(self):
        self.assertIsNone(api_server._dist_file("/assets/missing.js"))
        self.assertIsNone(api_server._dist_file("/assets"))


if __name__ == "__main__":
    unittest.main()
