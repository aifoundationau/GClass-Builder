#!/usr/bin/env python3
"""
Google_Classroom_Course_Template.xlsx, end to end: the web app's template is uploaded
(scripts/check-course-workbook.mjs, the same code the browser runs), the result is sent to
the server's workbook writer, and the course is created in the mock Classroom and Forms.
Every field of every week must arrive: resources attached by type (Drive files, YouTube
videos, links), quizzes built as Google Forms with their answer keys, rubrics imported from
their sheets. Refused resources land in the description with their titles while the rest of
the course is still created. Students are not added; the class code is returned instead.
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest

import classroom_course_engine as engine
from classroom_course_engine import (
    create_and_populate_course,
    extract_drive_file_id,
    extract_sheet_id,
    extract_youtube_id,
    get_classroom_service,
    write_course_workbook,
)

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which("node")


def uploaded_template():
    """The template as the web app reads it after Upload .xlsx."""
    out = subprocess.run([NODE, os.path.join("scripts", "check-course-workbook.mjs"), "--json"],
                         cwd=HERE, capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        raise AssertionError("Workbook round-trip check failed:\n" + out.stderr)
    return json.loads(out.stdout)


def expected_question(q):
    """A quiz question as the server reads it back from the web app's form."""
    answers = [] if q["type"] == "PARAGRAPH" else q["answers"]
    points = q["points"] if q["points"] != "" else (1 if answers else 0)
    choices = ["True", "False"] if q["type"] == "TRUE_FALSE" else q["choices"]
    return {"question": q["question"], "type": q["type"], "choices": choices, "answers": answers,
            "points": points, "feedback": q["feedback"]}


@unittest.skipUnless(NODE, "Node.js is needed to run the web app's workbook code")
class TemplateRoundTripTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.web = uploaded_template()
        cls.course = cls.web["course"]

    def deploy(self, **store):
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            write_course_workbook(self.course["settings"], self.course["curriculum"], self.course["students"], path)
            service = get_classroom_service(use_mock=True, verbose=False)
            service._store.update(store)
            return service, create_and_populate_course(service, path, verbose=False)
        finally:
            os.remove(path)

    def test_web_app_and_server_use_the_same_columns(self):
        self.assertEqual(self.web["curriculumHeaders"], [h for h, _ in engine.CURRICULUM_COLUMNS])
        self.assertEqual(self.web["curriculumKeys"], [k for _, k in engine.CURRICULUM_COLUMNS])
        self.assertEqual(self.web["quizHeaders"], [h for h, _ in engine.QUIZ_QUESTION_COLUMNS])
        self.assertEqual(self.web["quizKeys"], [k for _, k in engine.QUIZ_QUESTION_COLUMNS])
        self.assertEqual(self.web["settingsKeys"], engine.SETTINGS_KEYS)

    def test_server_reads_back_every_field_the_web_app_sends(self):
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            write_course_workbook(self.course["settings"], self.course["curriculum"], self.course["students"], path)
            data = engine.parse_course_spreadsheet(path)
        finally:
            os.remove(path)
        settings = self.course["settings"]
        for key in ("class_name", "section", "subject", "level", "room", "welcome_announcement", "teachers"):
            self.assertEqual(data.settings[key], settings[key], key)
        self.assertEqual(data.students, self.course["students"])
        for sent, read in zip(self.course["curriculum"], data.curriculum):
            self.assertEqual(read["sequence"], sent["sequence"])
            self.assertEqual(read["topic_name"], sent["stream_topic"])
            self.assertEqual(read["title"], sent["title"])
            self.assertEqual(read["overview"], sent["overview"])
            self.assertEqual(read["presentation_urls"], [u for u in sent["presentation_urls"] if u])
            self.assertEqual(read["youtube_urls"], [u for u in sent["youtube_urls"] if u])
            self.assertEqual(read["notebook_url"], sent["notebook_url"] or None)
            self.assertEqual(read["assignment_title"], sent["assignment_title"])
            self.assertEqual(read["assignment_instructions"], sent["assignment_instructions"])
            self.assertEqual(read["rubric_url"], sent["rubric_url"])
            self.assertEqual(read["points"], sent["points"])
            self.assertEqual(read["due_text"], sent["due_date"])
            self.assertEqual(read["quiz_title"], sent["quiz_title"])
            self.assertEqual(read["quiz_url"], sent["quiz_url"] or None)
            self.assertEqual(read["quiz_points"], sent["quiz_points"] if sent["quiz_points"] != "" else 50)
            self.assertEqual(read["quiz_questions"], [expected_question(q) for q in sent["quiz_questions"]])
            self.assertEqual(read["question_prompt"], sent["question_prompt"])
            self.assertEqual(read["question_type"], sent["question_type"])
            self.assertEqual(read["question_choices"], sent["question_choices"])
            self.assertEqual(read["question_points"], sent["question_points"] if sent["question_points"] != "" else 20)

    def test_template_creates_the_whole_course(self):
        service, result = self.deploy()
        store = service._store
        cid = result["course"]["id"]
        self.assertEqual([e for e in result["log"] if e["status"] not in ("ok", "added")], [])

        topics = {t["topicId"]: t["name"] for t in store["topics"][cid].values()}
        self.assertEqual(sorted(topics.values()), sorted(w["stream_topic"] for w in self.course["curriculum"]))
        coursework = list(store["coursework"][cid].values())
        materials = list(store["materials"][cid].values())

        for week in self.course["curriculum"]:
            in_topic = [t for t, name in topics.items() if name == week["stream_topic"]]
            # Lecture materials: notebook as a link, Drive files as Drive files, videos as videos
            post = next(m for m in materials if m["topicId"] in in_topic)
            expected = []
            if week["notebook_url"]:
                expected.append({"link": {"url": week["notebook_url"]}})
            for url in [u for u in week["presentation_urls"] if u]:
                expected.append({"driveFile": {"driveFile": {"id": extract_drive_file_id(url)}, "shareMode": "VIEW"}})
            for url in [u for u in week["youtube_urls"] if u]:
                expected.append({"youtubeVideo": {"id": extract_youtube_id(url)}})
            self.assertEqual(post["materials"], expected, week["sequence"])
            self.assertEqual(post["description"], week["overview"])

            items = {c["title"]: c for c in coursework if c["topicId"] in in_topic}
            due = engine.parse_due_datetime(week["due_date"])
            assignment = items[week["assignment_title"]]
            self.assertEqual((assignment["maxPoints"], assignment["description"]), (week["points"], week["assignment_instructions"]))
            self.assertEqual((assignment["dueDate"], assignment["dueTime"]), (due["dueDate"], due["dueTime"]))
            if week["rubric_url"]:
                rubric = store["rubrics"][cid][assignment["id"]]
                self.assertEqual(rubric["sourceSpreadsheetId"], extract_sheet_id(week["rubric_url"]))

            quiz = items[week["quiz_title"]]
            self.assertEqual(quiz["state"], "PUBLISHED")
            if week["quiz_questions"]:
                form = next(f for f in result["forms"] if f["week"] == week["sequence"])
                self.assertEqual(quiz["materials"], [{"link": {"url": form["responderUri"]}}])
                self.assertEqual(quiz["maxPoints"], sum(expected_question(q)["points"] for q in week["quiz_questions"]))
            else:
                self.assertEqual(quiz["materials"], [{"link": {"url": week["quiz_url"]}}])
                self.assertEqual(quiz["maxPoints"], week["quiz_points"] if week["quiz_points"] != "" else 50)

            question = items[week["question_prompt"]]
            self.assertEqual(question["workType"], week["question_type"])
            self.assertEqual(question["maxPoints"], week["question_points"] if week["question_points"] != "" else 20)
            if week["question_type"] == "MULTIPLE_CHOICE_QUESTION":
                self.assertEqual(question["multipleChoiceQuestion"], {"choices": week["question_choices"]})

        self.assertEqual([a["text"] for a in store["announcements"][cid]],
                         [self.course["settings"]["welcome_announcement"]])
        self.assertEqual(sorted(t["userId"] for t in store["teachers"][cid]),
                         sorted(self.course["settings"]["teachers"]))
        self.assertEqual(store["students"][cid], [])  # students join with the class code
        self.assertTrue(result["course"]["enrollmentCode"])

    def test_quiz_form_holds_the_questions_and_answer_key(self):
        service, result = self.deploy()
        week = next(w for w in self.course["curriculum"] if w["quiz_questions"])
        made = next(f for f in result["forms"] if f["week"] == week["sequence"])
        form = service._store["forms"][made["formId"]]
        self.assertTrue(form["settings"]["quizSettings"]["isQuiz"])
        self.assertEqual(form["settings"]["emailCollectionType"], "VERIFIED")
        self.assertEqual(form["publishSettings"]["publishState"], {"isPublished": True, "isAcceptingResponses": True})
        self.assertEqual(len(form["items"]), len(week["quiz_questions"]))
        for item, q in zip(form["items"], (expected_question(q) for q in week["quiz_questions"])):
            question = item["questionItem"]["question"]
            self.assertEqual(item["title"], q["question"])
            if q["answers"]:
                self.assertEqual(question["grading"]["pointValue"], q["points"])
                self.assertEqual([a["value"] for a in question["grading"]["correctAnswers"]["answers"]], q["answers"])
            if q["type"] in engine.FORM_CHOICE_TYPES:
                self.assertEqual(question["choiceQuestion"]["type"], engine.FORM_CHOICE_TYPES[q["type"]])
                self.assertEqual([o["value"] for o in question["choiceQuestion"]["options"]], q["choices"])
            else:
                self.assertEqual(question["textQuestion"]["paragraph"], q["type"] == "PARAGRAPH")
        self.assertEqual(made["handMarked"], 1)  # the paragraph question is marked by hand

    def test_refused_resources_go_in_the_description_and_the_course_is_still_complete(self):
        everything = set()
        for week in self.course["curriculum"]:
            everything |= {u for u in week["presentation_urls"] + week["youtube_urls"] + [week["notebook_url"], week["quiz_url"]] if u}
        service, result = self.deploy(inaccessible_links=everything)
        cid = result["course"]["id"]

        self.assertEqual([e for e in result["log"] if e["status"] == "failed"], [])
        self.assertEqual(len(service._store["materials"][cid]), len(self.course["curriculum"]))
        self.assertEqual(len(service._store["coursework"][cid]), 3 * len(self.course["curriculum"]))
        for post in service._store["materials"][cid].values():
            self.assertEqual(post["materials"], [])
            self.assertIn("Resources:", post["description"])
        week1 = self.course["curriculum"][0]
        post1 = next(p for p in service._store["materials"][cid].values() if p["title"].startswith(week1["title"]))
        self.assertIn(f"- NotebookLM notebook: {week1['notebook_url']}", post1["description"])
        self.assertIn(f"- Google Slides: {week1['presentation_urls'][0]}", post1["description"])
        self.assertIn(f"- Google Drive file: {week1['presentation_urls'][1]}", post1["description"])
        self.assertIn(f"- YouTube video: {week1['youtube_urls'][0]}", post1["description"])
        week2 = self.course["curriculum"][1]
        quiz2 = next(c for c in service._store["coursework"][cid].values() if c["title"] == week2["quiz_title"])
        self.assertIn(f"- Google Form: {week2['quiz_url']}", quiz2["description"])


if __name__ == "__main__":
    unittest.main()
