#!/usr/bin/env python3
"""
Unit and Integration Test Suite for Google Classroom Course Automation Engine.
Validates:
- NO-DELETE safety policy and AST audit
- Presentation Link Attachment schema (strictly omitting 'title')
- Spreadsheet parsing and normalization
- Create, Sync, Duplicate, and Status Check actions
"""

import os
import sys
import unittest
from datetime import datetime, timezone

# Import target engine modules
from classroom_course_engine import (
    audit_codebase_safety,
    enforce_no_delete_guardrail,
    SafetyPolicyViolationError,
    sanitize_and_validate_presentation_url,
    build_link_material_attachment,
    parse_course_spreadsheet,
    generate_sample_course_template,
    get_classroom_service,
    create_and_populate_course,
    sync_existing_course,
    duplicate_course_structure,
    list_courses_and_status_check,
)


class TestClassroomCourseEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sample_excel = "unit_test_curriculum.xlsx"
        generate_sample_course_template(cls.sample_excel)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.sample_excel):
            os.remove(cls.sample_excel)

    def test_01_ast_safety_audit_no_delete(self):
        """Verifies that no delete endpoints or methods are called in the engine."""
        engine_file = os.path.join(os.path.dirname(__file__), "classroom_course_engine.py")
        is_safe, violations = audit_codebase_safety(engine_file)
        self.assertTrue(is_safe, f"Safety policy failed: {violations}")
        self.assertEqual(len(violations), 0)

    def test_02_safety_guardrail_raises_exception(self):
        """Verifies that attempting any deletion triggers SafetyPolicyViolationError."""
        with self.assertRaises(SafetyPolicyViolationError) as ctx:
            enforce_no_delete_guardrail("courses.delete")
        self.assertIn("SAFETY VIOLATION BLOCKED", str(ctx.exception))
        self.assertIn("NO-DELETE policy", str(ctx.exception))

    def test_03_link_attachment_schema_strictly_omits_title(self):
        """
        API Rule: Strictly omit 'title' inside 'link' (it is output-only in Classroom API v1).
        Verifies correct structure.
        """
        raw_url = "https://docs.google.com/presentation/d/1demo-slides/edit"
        attachment = build_link_material_attachment(raw_url)

        self.assertIn("link", attachment)
        self.assertEqual(attachment["link"]["url"], raw_url)
        self.assertNotIn("title", attachment["link"], "API Rule Violation: 'title' found inside 'link'!")

    def test_04_presentation_url_sanitization(self):
        """Tests URL trimming, scheme prepending, and invalid URL handling."""
        self.assertEqual(
            sanitize_and_validate_presentation_url("  docs.google.com/presentation/d/xyz  "),
            "https://docs.google.com/presentation/d/xyz"
        )
        self.assertEqual(
            sanitize_and_validate_presentation_url("https://slides.example.edu/course1"),
            "https://slides.example.edu/course1"
        )
        self.assertIsNone(sanitize_and_validate_presentation_url(None))
        self.assertIsNone(sanitize_and_validate_presentation_url("None"))
        self.assertIsNone(sanitize_and_validate_presentation_url("N/A"))

    def test_05_spreadsheet_parsing(self):
        """Verifies parsing of Course_Settings and Curriculum sheets."""
        data = parse_course_spreadsheet(self.sample_excel)
        settings = data.settings
        curriculum = data.curriculum

        self.assertEqual(settings["class_name"], "CS101: Introduction to Cloud Computing")
        self.assertEqual(settings["section"], "Cohort 1 - Fall")
        self.assertEqual(len(curriculum), 4)

        first_module = curriculum[0]
        self.assertEqual(first_module["sequence"], "Week 1")
        self.assertTrue(first_module["has_presentation"])
        self.assertTrue(first_module["presentation_url"].startswith("https://"))

    def test_06_create_and_populate_course(self):
        """Tests Action 1: Create & Populate Course flow."""
        service = get_classroom_service(use_mock=True, verbose=False)
        result = create_and_populate_course(service, self.sample_excel, verbose=False)

        course = result["course"]
        self.assertTrue(course["id"].startswith("mock-course-"))
        self.assertEqual(len(result["topics"]), 4)
        self.assertEqual(len(result["materials"]), 4)
        self.assertEqual(len(result["coursework"]), 12)  # assignment, quiz, question x 4 weeks

        # The sample's Google Slides links are attached as Drive files, by file ID
        for mat in result["materials"]:
            self.assertEqual(len(mat["materials"]), 1)
            drive = mat["materials"][0]["driveFile"]
            self.assertTrue(drive["driveFile"]["id"])
            self.assertEqual(drive["shareMode"], "VIEW")

    def test_07_sync_existing_course_non_destructive(self):
        """Tests Action 2: Non-Destructive Edit/Sync."""
        service = get_classroom_service(use_mock=True, verbose=False)
        create_res = create_and_populate_course(service, self.sample_excel, verbose=False)
        cid = create_res["course"]["id"]

        sync_res = sync_existing_course(service, cid, self.sample_excel, verbose=False)
        self.assertEqual(sync_res["status"], "success")

        # Verify nothing was deleted
        cw_count = len(service.courses().courseWork().list(courseId=cid).execute().get("courseWork", []))
        mat_count = len(service.courses().courseWorkMaterials().list(courseId=cid).execute().get("courseWorkMaterial", []))
        self.assertEqual(cw_count, 12)
        self.assertEqual(mat_count, 4)

    def test_08_duplicate_course_to_new_section(self):
        """Tests Action 3: Course duplication and link preservation."""
        service = get_classroom_service(use_mock=True, verbose=False)
        create_res = create_and_populate_course(service, self.sample_excel, verbose=False)
        cid = create_res["course"]["id"]

        dup_res = duplicate_course_structure(service, cid, "Cohort 2 - Spring", verbose=False)
        new_course = dup_res["new_course"]
        self.assertEqual(new_course["section"], "Cohort 2 - Spring")
        self.assertNotEqual(new_course["id"], cid)

        self.assertEqual(len(dup_res["cloned_topics"]), 4)
        self.assertEqual(len(dup_res["cloned_materials"]), 4)
        self.assertEqual(len(dup_res["cloned_coursework"]), 12)

        # Attachments are copied with their type: the Drive files stay Drive files
        for cl_mat, src_mat in zip(dup_res["cloned_materials"], create_res["materials"]):
            self.assertEqual(cl_mat["materials"], src_mat["materials"])

    def test_09_list_courses_status_check(self):
        """Tests Action 4: Course list and roster metrics."""
        service = get_classroom_service(use_mock=True, verbose=False)
        create_and_populate_course(service, self.sample_excel, verbose=False)
        courses = list_courses_and_status_check(service, verbose=False)

        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["name"], "CS101: Introduction to Cloud Computing")
        self.assertEqual(courses[0]["coursework_count"], 12)
        self.assertEqual(courses[0]["materials_count"], 4)


if __name__ == "__main__":
    unittest.main()
