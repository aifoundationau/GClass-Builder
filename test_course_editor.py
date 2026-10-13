#!/usr/bin/env python3
"""The course editor (Courses tab): every edit Classroom allows after a course is created."""

import unittest
from datetime import datetime, timezone

import course_editor
from course_editor import EditError, NOT_OURS, apply_edit, load_course
from classroom_course_engine import get_classroom_service


class CourseEditorTests(unittest.TestCase):
    def setUp(self):
        self.service = get_classroom_service(use_mock=True, verbose=False)
        self.store = self.service._store
        course = self.service.courses().create(body={"name": "Biology", "ownerId": "me"}).execute()
        self.cid = course["id"]
        self.service.courses().patch(id=self.cid, updateMask="courseState", body={"courseState": "ACTIVE"}).execute()
        self.topic = self.service.courses().topics().create(courseId=self.cid, body={"name": "Week 1"}).execute()
        self.work = self.service.courses().courseWork().create(courseId=self.cid, body={
            "title": "Lab 1", "workType": "ASSIGNMENT", "state": "DRAFT", "maxPoints": 10,
            "topicId": self.topic["topicId"]}).execute()
        self.material = self.service.courses().courseWorkMaterials().create(courseId=self.cid, body={
            "title": "Slides", "state": "PUBLISHED"}).execute()

    def edit(self, kind, fields, action="update", item_id=""):
        return apply_edit(self.service, {"courseId": self.cid, "kind": kind, "action": action,
                                         "id": item_id, "fields": fields})

    def test_load_includes_drafts(self):
        data = load_course(self.service, self.cid)
        self.assertEqual([w["title"] for w in data["courseWork"]], ["Lab 1"])
        self.assertEqual(data["courseWork"][0]["state"], "DRAFT")
        self.assertEqual([t["name"] for t in data["topics"]], ["Week 1"])

    def test_course_details_and_archiving(self):
        item = self.edit("course", {"name": "Biology 2026", "section": "Term 1", "room": "B12",
                                    "descriptionHeading": "Welcome", "description": "Cells and genes"})["item"]
        self.assertEqual((item["name"], item["section"], item["room"]), ("Biology 2026", "Term 1", "B12"))
        self.assertEqual(self.edit("course", {"courseState": "ARCHIVED"})["item"]["courseState"], "ARCHIVED")
        with self.assertRaisesRegex(EditError, "name cannot be empty"):
            self.edit("course", {"name": "  "})
        with self.assertRaisesRegex(EditError, "Active or Archived"):
            self.edit("course", {"courseState": "DELETED"})
        with self.assertRaisesRegex(EditError, "cannot be changed here: ownerId"):
            self.edit("course", {"ownerId": "someone@else.org"})

    def test_topics_can_be_added_and_renamed(self):
        added = self.edit("topic", {"name": "  Week   2 "}, action="create")["item"]
        self.assertEqual(added["name"], "Week 2")
        renamed = self.edit("topic", {"name": "Week 1: Cells"}, item_id=self.topic["topicId"])["item"]
        self.assertEqual(renamed["name"], "Week 1: Cells")

    def test_assignment_points_due_date_topic_and_publishing(self):
        wid = self.work["id"]
        item = self.edit("assignment", {"title": "Lab 1: Microscopes", "maxPoints": 20,
                                        "due": "2026-11-05T17:00+11:00"}, item_id=wid)["item"]
        self.assertEqual((item["title"], item["maxPoints"]), ("Lab 1: Microscopes", 20))
        self.assertEqual((item["dueDate"], item["dueTime"]),
                         ({"year": 2026, "month": 11, "day": 5}, {"hours": 6, "minutes": 0}))
        cleared = self.edit("assignment", {"due": "", "topicId": ""}, item_id=wid)["item"]
        self.assertNotIn("dueDate", {k for k, v in cleared.items() if v}, cleared)
        self.assertFalse(cleared.get("topicId"))
        self.assertEqual(self.edit("assignment", {"state": "PUBLISHED"}, item_id=wid)["item"]["state"], "PUBLISHED")
        with self.assertRaisesRegex(EditError, "cannot go back to a draft"):
            self.edit("assignment", {"state": "DRAFT"}, item_id=wid)
        with self.assertRaisesRegex(EditError, "whole number"):
            self.edit("assignment", {"maxPoints": 2.5}, item_id=wid)
        with self.assertRaisesRegex(ValueError, "ISO 8601"):
            self.edit("assignment", {"due": "05/11/2026"}, item_id=wid)

    def test_material_details(self):
        item = self.edit("material", {"title": "Week 1 slides", "description": "Read before class",
                                      "topicId": self.topic["topicId"]}, item_id=self.material["id"])["item"]
        self.assertEqual((item["title"], item["description"], item["topicId"]),
                         ("Week 1 slides", "Read before class", self.topic["topicId"]))
        with self.assertRaisesRegex(EditError, "cannot be changed here: maxPoints"):
            self.edit("material", {"maxPoints": 5}, item_id=self.material["id"])

    def test_new_posts_attach_resources_by_type(self):
        made = self.edit("material", {"title": "Extra reading", "topicId": self.topic["topicId"], "links": [
            "https://drive.google.com/file/d/1Ry05DVSSEQxKwV-_PZdn7KPbWmmZKUwA/view",
            "https://youtu.be/dQw4w9WgXcQ", "https://example.org/article"]}, action="create")["item"]
        self.assertEqual([next(iter(m)) for m in made["materials"]], ["driveFile", "youtubeVideo", "link"])
        self.store["inaccessible_links"] = {"https://docs.google.com/document/d/1MissingDocument99/edit"}
        result = self.edit("assignment", {"title": "Essay", "maxPoints": 30, "due": "2026-11-20", "links": [
            "https://docs.google.com/document/d/1MissingDocument99/edit"]}, action="create")
        self.assertIn("- Google Doc: https://docs.google.com/document/d/1MissingDocument99/edit", result["item"]["description"])
        self.assertTrue(result["notes"])

    def test_new_questions(self):
        q = self.edit("question", {"title": "Which organelle makes energy?", "maxPoints": 2,
                                   "questionType": "MULTIPLE_CHOICE_QUESTION",
                                   "choices": ["Mitochondria", "Ribosome"]}, action="create")["item"]
        self.assertEqual(q["multipleChoiceQuestion"], {"choices": ["Mitochondria", "Ribosome"]})
        with self.assertRaisesRegex(EditError, "at least 2 choices"):
            self.edit("question", {"title": "Pick", "questionType": "MULTIPLE_CHOICE_QUESTION", "choices": ["A"]},
                      action="create")

    def test_announcements(self):
        post = self.edit("announcement", {"text": "Welcome!"}, action="create")["item"]
        self.assertEqual(self.edit("announcement", {"text": "Welcome, everyone!"}, item_id=post["id"])["item"]["text"],
                         "Welcome, everyone!")

    def test_items_made_in_classroom_are_explained(self):
        self.store["coursework"][self.cid][self.work["id"]]["associatedWithDeveloper"] = False
        with self.assertRaises(EditError) as ctx:
            self.edit("assignment", {"title": "Renamed"}, item_id=self.work["id"])
        self.assertEqual(str(ctx.exception), NOT_OURS)

    def test_nothing_can_be_deleted(self):
        with self.assertRaisesRegex(EditError, "never deletes"):
            apply_edit(self.service, {"courseId": self.cid, "kind": "assignment", "action": "delete",
                                      "id": self.work["id"], "fields": {}})
        self.assertIn(self.work["id"], self.store["coursework"][self.cid])


if __name__ == "__main__":
    unittest.main()
