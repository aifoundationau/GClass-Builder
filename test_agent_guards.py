"""Guard tests: deletions are refused, edits are limited to allowed fields, and only NotebookLM links are accepted."""
import unittest
from unittest import mock

import agent_routes
import classroom_api
import course_agent
import teacher_auth
from classroom_api import ClassroomCallError
from course_agent import AgentError

SNAPSHOT = {
    "course": {"id": "c1"},
    "topics": [{"topicId": "t1", "name": "Week 1"}],
    "courseWork": [{"id": "w1", "title": "Quiz"}],
    "courseWorkMaterials": [{"id": "m1", "title": "Reading"}],
    "announcements": [{"id": "a1", "text": "Hello"}],
}


class TestNoDeletePolicy(unittest.TestCase):

    def test_no_resource_allows_delete(self):
        for resource, methods in classroom_api.ALLOWED_METHODS.items():
            self.assertNotIn("delete", methods, resource)

    def test_delete_is_refused_on_allowed_resource(self):
        with self.assertRaises(ClassroomCallError):
            classroom_api.check_call("courses.courseWork", "delete")

    def test_unknown_resource_is_refused(self):
        with self.assertRaises(ClassroomCallError):
            classroom_api.check_call("courses.bogus", "list")

    def test_edit_methods_are_subset_of_allowed(self):
        for resource, methods in classroom_api.ALLOWED_METHODS.items():
            self.assertTrue(classroom_api.EDIT_METHODS.issuperset(methods & classroom_api.EDIT_METHODS))


class TestOperationValidation(unittest.TestCase):

    def test_keeps_allowed_edit_to_real_item(self):
        ops = [{"resource": "courses.courseWork", "id": "w1", "fields": {"title": "New title"}}]
        cleaned = course_agent.validate_operations(ops, SNAPSHOT, "c1")
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned[0]["fields"], {"title": "New title"})

    def test_drops_unknown_item_id(self):
        ops = [{"resource": "courses.courseWork", "id": "nope", "fields": {"title": "x"}}]
        self.assertEqual(course_agent.validate_operations(ops, SNAPSHOT, "c1"), [])

    def test_drops_disallowed_field_such_as_state(self):
        # Publishing or changing state is not editable by the agent.
        ops = [{"resource": "courses.courseWork", "id": "w1", "fields": {"state": "DELETED"}}]
        self.assertEqual(course_agent.validate_operations(ops, SNAPSHOT, "c1"), [])

    def test_drops_unknown_resource(self):
        ops = [{"resource": "courses.students", "id": "s1", "fields": {"fullName": "x"}}]
        self.assertEqual(course_agent.validate_operations(ops, SNAPSHOT, "c1"), [])


class TestNotebookLinks(unittest.TestCase):

    def test_accepts_notebooklm_https(self):
        url = "https://notebooklm.google.com/notebook/abc123"
        self.assertEqual(course_agent.validate_notebook_url(url), url)

    def test_accepts_notebook_and_gemini_hosts(self):
        for url in ("https://notebook.google.com/notebook/abc123", "https://gemini.google.com/notebook/abc123"):
            self.assertEqual(course_agent.validate_notebook_url(url), url)

    def test_rejects_other_hosts(self):
        with self.assertRaises(AgentError):
            course_agent.validate_notebook_url("https://evil.example.com/notebooklm.google.com")

    def test_rejects_http(self):
        with self.assertRaises(AgentError):
            course_agent.validate_notebook_url("http://notebooklm.google.com/notebook/x")

    def test_empty_is_none(self):
        self.assertIsNone(course_agent.validate_notebook_url(""))


class TestPlanMapping(unittest.TestCase):

    def test_plan_maps_units_to_curriculum_rows(self):
        plan = course_agent._normalise_plan({
            "course": {"name": "Intro", "notebook_url": None},
            "units": [{"title": "Basics", "overview": "o", "outcomes": ["Explain X"],
                       "notebook_url": "https://notebooklm.google.com/notebook/n1",
                       "lessons": [{"title": "L1", "url": None}],
                       "assessments": [{"title": "Quiz 1", "instructions": "i", "question": "q?",
                                        "question_type": "SHORT_ANSWER_QUESTION", "points": 10}]}],
        })
        settings, curriculum = course_agent.plan_to_curriculum(plan)
        self.assertEqual(settings["class_name"], "Intro")
        self.assertEqual(curriculum[0]["presentation_urls"], ["https://notebooklm.google.com/notebook/n1"])
        self.assertEqual(curriculum[0]["assignment_title"], "Quiz 1")
        self.assertIn("Explain X", curriculum[0]["overview"])

    def _plan_with(self, **assessment):
        return course_agent._normalise_plan({
            "course": {"name": "Intro"},
            "units": [{"title": "Basics", "assessments": [{"title": "A", "question": "q?", **assessment}]}],
        })

    def test_ai_due_date_that_is_not_iso_is_dropped(self):
        plan = self._plan_with(due_date="next Friday")
        self.assertIsNone(plan["units"][0]["assessments"][0]["due_date"])
        plan = self._plan_with(due_date="2026-11-05")
        self.assertEqual(plan["units"][0]["assessments"][0]["due_date"], "2026-11-05")

    def test_ai_multiple_choice_needs_two_choices(self):
        plan = self._plan_with(question_type="MULTIPLE_CHOICE_QUESTION", choices=["Only one"])
        self.assertEqual(plan["units"][0]["assessments"][0]["question_type"], "SHORT_ANSWER_QUESTION")
        plan = self._plan_with(question_type="MULTIPLE_CHOICE_QUESTION", choices=["Yes", "No"])
        _, curriculum = course_agent.plan_to_curriculum(plan)
        self.assertEqual(curriculum[0]["question_type"], "MULTIPLE_CHOICE_QUESTION")
        self.assertEqual(curriculum[0]["question_choices"], ["Yes", "No"])


class TestRoutes(unittest.TestCase):

    def test_generic_classroom_call_post_is_removed(self):
        # A raw passthrough would skip validate_operations, the DRAFT default and the add-on gate.
        handler = mock.Mock()
        self.assertFalse(agent_routes.handle_post(handler, "/api/classroom/call"))
        handler._read_json_body.assert_not_called()
        handler._send_json.assert_not_called()


class TestTeacherSessions(unittest.TestCase):

    def test_parse_session_cookie(self):
        self.assertEqual(teacher_auth.parse_session_cookie("a=1; lms_sid=abc; b=2"), "abc")
        self.assertIsNone(teacher_auth.parse_session_cookie("a=1"))
        self.assertIsNone(teacher_auth.parse_session_cookie(None))

    def test_token_path_is_per_account(self):
        self.assertNotEqual(teacher_auth.token_path_for("a@x.edu"), teacher_auth.token_path_for("b@x.edu"))
        self.assertEqual(teacher_auth.token_path_for("A@x.edu"), teacher_auth.token_path_for("a@x.edu"))


if __name__ == "__main__":
    unittest.main()
