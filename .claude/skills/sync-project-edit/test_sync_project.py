"""Focused tests for the pure project-selection and cache decisions."""

import unittest

from sync_project import download_needed, find_project, parse_token


class SyncProjectTests(unittest.TestCase):
    def test_parse_token_from_set_command(self):
        self.assertEqual(
            parse_token('set OPENREEL_SYNC_TOKEN=secret-value\n'),
            "secret-value",
        )

    def test_parse_token_ignores_comments_and_other_variables(self):
        self.assertIsNone(
            parse_token("rem set OPENREEL_SYNC_TOKEN=comment\nset OTHER=value\n")
        )

    def test_match_exact_id_before_substring_name(self):
        projects = [
            {"id": "pasta-1", "name": "Pasta"},
            {"id": "other", "name": "Pasta backup"},
        ]
        self.assertEqual(find_project(projects, "pasta-1")["id"], "pasta-1")

    def test_match_unique_case_insensitive_substring(self):
        projects = [{"id": "pasta", "name": "Pasta Project"}]
        self.assertEqual(find_project(projects, "PASTA")["id"], "pasta")

    def test_match_errors_for_no_or_ambiguous_results(self):
        projects = [
            {"id": "pasta", "name": "Pasta"},
            {"id": "pasta-backup", "name": "Pasta backup"},
        ]
        with self.assertRaisesRegex(ValueError, "No project matches"):
            find_project(projects, "missing")
        with self.assertRaisesRegex(ValueError, "More than one project matches"):
            find_project(projects, "past")

    def test_cache_version_decides_whether_download_is_needed(self):
        self.assertTrue(download_needed(None, 1))
        self.assertFalse(download_needed(4, 4))
        self.assertTrue(download_needed(3, 4))


if __name__ == "__main__":
    unittest.main()
