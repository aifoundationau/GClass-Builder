#!/usr/bin/env python3
"""
Tests for the Classroom provisioning order in create_and_populate_course:
course shell -> aliases -> activation -> co-teachers -> topics -> coursework -> students,
with invitation fallback for users Classroom refuses to add directly.
"""

import os
import tempfile
import time
import unittest
from datetime import datetime, timezone

import pandas as pd

from classroom_course_engine import (
    ROSTER_SCOPE_MESSAGE,
    _enroll_or_invite,
    _mock_http_error,
    build_topic_attachments,
    course_join_link,
    create_and_populate_course,
    extract_sheet_id,
    extract_youtube_id,
    get_classroom_service,
    is_notebook_url,
    make_attachment,
    parse_course_spreadsheet,
    parse_due_datetime,
)

DOMAIN = "school.edu"


def write_workbook(path, aliases="SIS-2026-BIO101, d:bio101-taken"):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame([
            {"Setting": "class_name", "Value": "Biology 101"},
            {"Setting": "section", "Value": "Period 3"},
            {"Setting": "teachers", "Value": f"co.teacher@{DOMAIN}, guest.lecturer@partner.org"},
            {"Setting": "aliases", "Value": aliases},
        ]).to_excel(writer, sheet_name="Course_Settings", index=False)
        pd.DataFrame([
            {"Classroom Stream Topic": "Unit 1: Cells", "Module Title": "Cells",
             "Lecture Presentation URL": "https://docs.google.com/presentation/d/cells/edit",
             "Assignment Title": "Cell diagram", "Points": 50, "Due Date": "2026-11-02"},
            {"Classroom Stream Topic": "Unit 2: Genetics", "Module Title": "Genetics",
             "Assignment Title": "Punnett squares", "Points": 100, "Due Date": ""},
        ]).to_excel(writer, sheet_name="Curriculum", index=False)
        pd.DataFrame([
            {"Student Email": f"ada@{DOMAIN}"},
            {"Student Email": "grace@home.example.com"},
        ]).to_excel(writer, sheet_name="Students", index=False)


class ProvisioningSequenceTests(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        write_workbook(self.path)
        self.service = get_classroom_service(use_mock=True, verbose=False)
        self.store = self.service._store
        self.store["direct_add_domain"] = DOMAIN
        # Another course already holds this alias.
        self.store["aliases"] = {"d:bio101-taken": "mock-course-other"}

    def tearDown(self):
        os.remove(self.path)

    def run_build(self):
        return create_and_populate_course(self.service, self.path, verbose=False)

    def test_steps_run_in_dependency_order(self):
        log = self.run_build()["log"]
        steps = [e["step"] for e in log]
        first = {s: steps.index(s) for s in set(steps)}
        last = {s: len(steps) - 1 - steps[::-1].index(s) for s in set(steps)}
        order = ["course", "alias", "activate", "teacher", "topic"]
        for before, after in zip(order, order[1:]):
            self.assertLess(last[before], first[after], f"{before} must finish before {after}")
        self.assertNotIn("student", steps)  # students join with the class code

        # Each material and coursework item comes after the topic it is anchored to.
        seen_topics = set()
        for entry in log:
            if entry["step"] == "topic":
                seen_topics.add(entry["detail"])
            elif entry["step"] in ("material", "coursework"):
                self.assertIn(entry["detail"].split()[1].rstrip(","), seen_topics)

    def test_course_ends_active(self):
        course = self.run_build()["course"]
        self.assertEqual(self.store["courses"][course["id"]]["courseState"], "ACTIVE")

    def test_coursework_is_anchored_to_its_topic(self):
        result = self.run_build()
        topic_ids = set(result["topics"].values())
        self.assertEqual(len(result["coursework"]), 2)
        for item in result["coursework"] + result["materials"]:
            self.assertIn(item["topicId"], topic_ids)

    def test_co_teachers_added_or_invited_and_students_left_to_the_class_code(self):
        result = self.run_build()
        self.assertEqual([t["userId"] for t in result["teachers"]], [f"co.teacher@{DOMAIN}"])
        invited = {(i["userId"], i["role"]) for i in result["invitations"]}
        self.assertEqual(invited, {("guest.lecturer@partner.org", "TEACHER")})
        self.assertEqual(result["students"], [])
        self.assertEqual(self.store["students"][result["course"]["id"]], [])
        self.assertTrue(result["course"]["enrollmentCode"])

    def test_bare_alias_gets_project_prefix_and_taken_alias_does_not_stop_build(self):
        result = self.run_build()
        aliases = {e["target"]: e["status"] for e in result["log"] if e["step"] == "alias"}
        self.assertEqual(aliases, {"p:SIS-2026-BIO101": "ok", "d:bio101-taken": "failed"})
        self.assertEqual(self.store["aliases"]["p:SIS-2026-BIO101"], result["course"]["id"])
        self.assertEqual(len(result["topics"]), 2)

    def test_only_the_taken_alias_is_reported_as_failed(self):
        failed = [e for e in self.run_build()["log"] if e["status"] == "failed"]
        self.assertEqual([(e["step"], e["target"]) for e in failed], [("alias", "d:bio101-taken")])

    def test_mock_refuses_topics_on_provisioned_course(self):
        course = self.service.courses().create(body={"name": "Shell only"}).execute()
        with self.assertRaises(Exception) as ctx:
            self.service.courses().topics().create(courseId=course["id"], body={"name": "Too early"}).execute()
        self.assertEqual(ctx.exception.resp.status, 403)


class StubRoster:
    """Raises a preset error for direct adds, records invitation calls."""
    def __init__(self, direct_status, invite_status=None):
        self.direct_status = direct_status
        self.invite_status = invite_status
        self.invites = []

    def courses(self):
        return self

    def students(self):
        return self

    def teachers(self):
        return self

    def invitations(self):
        stub = self

        class Invitations:
            def create(self, body):
                class Req:
                    def execute(self):
                        if stub.invite_status:
                            raise _mock_http_error(stub.invite_status, "invite refused")
                        stub.invites.append(body)
                        return {"id": "inv-1", **body}
                return Req()
        return Invitations()

    def create(self, courseId, body):
        stub = self

        class Req:
            def execute(self):
                raise _mock_http_error(stub.direct_status, "direct add refused")
        return Req()


class EnrollOrInviteTests(unittest.TestCase):
    def test_already_enrolled_is_not_a_failure(self):
        log = []
        status, _ = _enroll_or_invite(StubRoster(409), "c1", "a@x.org", "STUDENT", log, verbose=False)
        self.assertEqual(status, "existing")

    def test_server_error_is_not_retried_as_invitation(self):
        stub, log = StubRoster(500), []
        status, _ = _enroll_or_invite(stub, "c1", "a@x.org", "STUDENT", log, verbose=False)
        self.assertEqual(status, "failed")
        self.assertEqual(stub.invites, [])

    def test_precondition_error_falls_back_to_invitation(self):
        stub, log = StubRoster(400), []
        status, _ = _enroll_or_invite(stub, "c1", "a@x.org", "TEACHER", log, verbose=False)
        self.assertEqual(status, "invited")
        self.assertEqual(stub.invites, [{"courseId": "c1", "userId": "a@x.org", "role": "TEACHER"}])

    def test_existing_invitation_is_not_a_failure(self):
        log = []
        status, _ = _enroll_or_invite(StubRoster(403, 409), "c1", "a@x.org", "STUDENT", log, verbose=False)
        self.assertEqual(status, "existing")

    def test_both_paths_refused_is_logged_with_both_errors(self):
        log = []
        status, _ = _enroll_or_invite(StubRoster(403, 403), "c1", "a@x.org", "STUDENT", log, verbose=False)
        self.assertEqual(status, "failed")
        self.assertIn("direct add", log[-1]["detail"])
        self.assertIn("invitation", log[-1]["detail"])


class TopicAttachmentTests(unittest.TestCase):
    def test_youtube_ids_from_every_url_form(self):
        for url in ["https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
                    "https://youtu.be/dQw4w9WgXcQ?t=42",
                    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
                    "https://www.youtube.com/embed/dQw4w9WgXcQ"]:
            self.assertEqual(extract_youtube_id(url), "dQw4w9WgXcQ", url)
        self.assertIsNone(extract_youtube_id("https://vimeo.com/123"))

    def test_notebook_then_links_then_videos(self):
        mod = {"notebook_url": "https://notebooklm.google.com/notebook/abc",
               "presentation_urls": ["https://docs.google.com/presentation/d/1AbCdEfGhIjKlMn/edit", ""],
               "youtube_urls": ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]}
        self.assertEqual(build_topic_attachments(mod), [
            {"link": {"url": "https://notebooklm.google.com/notebook/abc"}},
            {"driveFile": {"driveFile": {"id": "1AbCdEfGhIjKlMn"}, "shareMode": "VIEW"}},
            {"youtubeVideo": {"id": "dQw4w9WgXcQ"}},  # duplicate video attached once
        ])

    def test_each_resource_uses_its_classroom_attach_type(self):
        cases = {
            "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit?usp=sharing": ("drive", "Google Doc"),
            "https://docs.google.com/presentation/u/0/d/1AbCdEfGhIjKlMn/edit": ("drive", "Google Slides"),
            "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit#gid=0": ("drive", "Google Sheet"),
            "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view": ("drive", "Google Drive file"),
            "https://drive.google.com/open?id=1AbCdEfGhIjKlMn": ("drive", "Google Drive file"),
            "https://docs.google.com/forms/d/e/1FAIpQLSf-abc/viewform": ("link", "Google Form"),
            "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn": ("link", "Google Drive folder"),
            "https://notebook.google.com/notebook/abc": ("link", "Gemini notebook"),
            "https://notebooklm.google.com/notebook/abc": ("link", "NotebookLM notebook"),
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ": ("youtube", "YouTube video"),
            "https://www.example.org/reading": ("link", "Link (example.org)"),
        }
        for url, (kind, label) in cases.items():
            attachment = make_attachment(url)
            self.assertEqual((attachment.kind, attachment.label), (kind, label), url)
        self.assertEqual(make_attachment("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view").material,
                         {"driveFile": {"driveFile": {"id": "1AbCdEfGhIjKlMn"}, "shareMode": "VIEW"}})

    def test_notebook_hosts(self):
        for url in ["https://notebooklm.google.com/notebook/a",
                    "https://notebook.google.com/notebook/a",
                    "https://gemini.google.com/notebook/a"]:
            self.assertTrue(is_notebook_url(url), url)
        for url in ["http://notebook.google.com/notebook/a",
                    "https://evil.example.com/notebook.google.com",
                    "https://notebook.google.com.evil.example/a"]:
            self.assertFalse(is_notebook_url(url), url)

    def _build_one_topic(self, inaccessible, notebook, links):
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                pd.DataFrame([{"Setting": "class_name", "Value": "Links"}]).to_excel(
                    writer, sheet_name="Course_Settings", index=False)
                pd.DataFrame([{"Module Title": "One", "Notebook URL": notebook,
                               "Lecture Presentation URL": "\n".join(links)}]).to_excel(
                    writer, sheet_name="Curriculum", index=False)
            service = get_classroom_service(use_mock=True, verbose=False)
            service._store["inaccessible_links"] = set(inaccessible)
            result = create_and_populate_course(service, path, verbose=False)
            return result["materials"][0], [e for e in result["log"] if e["step"] == "material"][0]
        finally:
            os.remove(path)

    def test_refused_drive_files_go_in_the_description_with_titles(self):
        notebook = "https://notebook.google.com/notebook/b9dbff37"
        bad = ["https://docs.google.com/presentation/d/1demo-cloud-slides/edit",
               "https://docs.google.com/document/d/1demo-cloud-paper/edit"]
        post, entry = self._build_one_topic(bad, notebook, bad)
        self.assertEqual(post["materials"], [{"link": {"url": notebook}}])
        self.assertIn("Resources:\n- Google Slides: " + bad[0] + "\n- Google Doc: " + bad[1], post["description"])
        self.assertNotIn(notebook, post["description"])
        self.assertEqual(entry["status"], "partial")
        self.assertIn("1 of 3 attachment(s)", entry["detail"])

    def test_one_bad_drive_file_costs_only_that_file(self):
        notebook = "https://notebooklm.google.com/notebook/n1"
        good = "https://docs.google.com/presentation/d/1RealSlidesFileId/edit"
        bad = "https://docs.google.com/document/d/1GoneDocumentFileId/edit"
        post, entry = self._build_one_topic([bad], notebook, [good, bad])
        self.assertEqual(post["materials"], [
            {"link": {"url": notebook}},
            {"driveFile": {"driveFile": {"id": "1RealSlidesFileId"}, "shareMode": "VIEW"}},
        ])
        self.assertIn("- Google Doc: " + bad, post["description"])
        self.assertEqual(entry["status"], "partial")

    def test_drive_file_refused_as_a_file_is_attached_as_a_link(self):
        url = "https://docs.google.com/presentation/d/1SharedWithMeOnly/edit"
        with TempWorkbook() as path:
            write_curriculum(path, [{"Module Title": "One", "Lecture Presentation URL": url}])
            service = get_classroom_service(use_mock=True, verbose=False)
            service._store["refuse_native_only"] = {url}
            result = create_and_populate_course(service, path, verbose=False)
        post = result["materials"][0]
        self.assertEqual(post["materials"], [{"link": {"url": url}}])
        self.assertNotIn("Resources:", post.get("description", ""))
        entry = [e for e in result["log"] if e["step"] == "material"][0]
        self.assertEqual(entry["status"], "ok")
        self.assertIn("attached as a plain link instead", entry["detail"])

    def test_more_than_20_resources_overflow_into_the_description(self):
        links = [f"https://www.example.org/reading-{i}" for i in range(23)]
        post, entry = self._build_one_topic([], None, links)
        self.assertEqual(len(post["materials"]), 20)
        for url in links[20:]:
            self.assertIn(f"- Link (example.org): {url}", post["description"])
        self.assertEqual(entry["status"], "partial")

    def test_youtube_link_in_the_links_list_becomes_a_video(self):
        mod = {"presentation_urls": ["https://youtu.be/dQw4w9WgXcQ"]}
        self.assertEqual(build_topic_attachments(mod), [{"youtubeVideo": {"id": "dQw4w9WgXcQ"}}])

    def test_spreadsheet_columns_reach_the_course(self):
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                pd.DataFrame([{"Setting": "class_name", "Value": "Video course"}]).to_excel(
                    writer, sheet_name="Course_Settings", index=False)
                pd.DataFrame([{"Classroom Stream Topic": "Unit 1", "Module Title": "One",
                               "Lecture Presentation URL": "https://docs.google.com/document/d/doc/edit",
                               "YouTube Video URLs": "https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/9bZkp7q19f0",
                               "Notebook URL": "https://notebooklm.google.com/notebook/n1"}]).to_excel(
                    writer, sheet_name="Curriculum", index=False)
            service = get_classroom_service(use_mock=True, verbose=False)
            result = create_and_populate_course(service, path, verbose=False)
            kinds = [next(iter(m)) for m in result["materials"][0]["materials"]]
            self.assertEqual(kinds, ["link", "link", "youtubeVideo", "youtubeVideo"])
        finally:
            os.remove(path)

    def test_non_notebook_url_in_notebook_column_is_rejected(self):
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                pd.DataFrame([{"Setting": "class_name", "Value": "X"}]).to_excel(
                    writer, sheet_name="Course_Settings", index=False)
                pd.DataFrame([{"Module Title": "One", "Notebook URL": "https://example.com/notes"}]).to_excel(
                    writer, sheet_name="Curriculum", index=False)
            with self.assertRaisesRegex(ValueError, "not a notebook link.*notebook.google.com"):
                parse_course_spreadsheet(path)
        finally:
            os.remove(path)


class RosterPermissionTests(unittest.TestCase):
    def test_missing_roster_scope_gives_sign_in_advice_without_inviting(self):
        class ScopeError(StubRoster):
            def create(self, courseId, body):
                class Req:
                    def execute(self):
                        raise _mock_http_error(403, "Request had insufficient authentication scopes.")
                return Req()
        stub, log = ScopeError(403), []
        status, _ = _enroll_or_invite(stub, "c1", "a@x.org", "STUDENT", log, verbose=False)
        self.assertEqual(status, "failed")
        self.assertEqual(log[-1]["detail"], ROSTER_SCOPE_MESSAGE)
        self.assertEqual(stub.invites, [])

    def test_exhausted_invitation_quota_points_to_the_join_link(self):
        class QuotaStub(StubRoster):
            def invitations(self):
                class Invitations:
                    def create(self, body):
                        class Req:
                            def execute(self):
                                raise _mock_http_error(429, "@UserInvitationQuotaExhausted The user does not have enough quota.")
                        return Req()
                return Invitations()
        log = []
        status, _ = _enroll_or_invite(QuotaStub(400), "c1", "a@x.org", "STUDENT", log, verbose=False)
        self.assertEqual(status, "failed")
        self.assertIn("join link", log[-1]["detail"])
        self.assertIn("UserInvitationQuotaExhausted", log[-1]["detail"])

    def test_join_link_needs_link_and_code(self):
        self.assertEqual(course_join_link({"alternateLink": "https://classroom.google.com/c/AbC", "enrollmentCode": "x7k2p"}),
                         "https://classroom.google.com/c/AbC?cjc=x7k2p")
        self.assertIsNone(course_join_link({"alternateLink": "https://classroom.google.com/c/AbC"}))

    def test_caller_log_fills_during_the_build(self):
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        write_workbook(path)
        try:
            watched = []
            result = create_and_populate_course(get_classroom_service(use_mock=True, verbose=False),
                                                path, verbose=False, log=watched)
            self.assertIs(result["log"], watched)
            self.assertGreater(len(watched), 5)
        finally:
            os.remove(path)


def write_curriculum(path, rows, settings=None):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame([{"Setting": k, "Value": v} for k, v in (settings or {"class_name": "Fixes"}).items()]).to_excel(
            writer, sheet_name="Course_Settings", index=False)
        pd.DataFrame(rows).to_excel(writer, sheet_name="Curriculum", index=False)


class TempWorkbook:
    def __enter__(self):
        fd, self.path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        return self.path

    def __exit__(self, *exc):
        os.remove(self.path)


def local_end_of_day_utc(y, m, d, hh=23, mm=59):
    utc = datetime(y, m, d, hh, mm).astimezone(timezone.utc)
    return {"dueDate": {"year": utc.year, "month": utc.month, "day": utc.day},
            "dueTime": {"hours": utc.hour, "minutes": utc.minute}}


class DueDateTests(unittest.TestCase):
    def test_offsets_convert_to_utc(self):
        self.assertEqual(parse_due_datetime("2026-11-05T17:00+11:00"),
                         {"dueDate": {"year": 2026, "month": 11, "day": 5}, "dueTime": {"hours": 6, "minutes": 0}})
        self.assertEqual(parse_due_datetime("2026-11-05T23:59Z"),
                         {"dueDate": {"year": 2026, "month": 11, "day": 5}, "dueTime": {"hours": 23, "minutes": 59}})
        self.assertEqual(parse_due_datetime("2026-11-05T20:00-05:00"),
                         {"dueDate": {"year": 2026, "month": 11, "day": 6}, "dueTime": {"hours": 1, "minutes": 0}})

    def test_browser_offset_ignores_server_time_zone(self):
        # The browser sends "17:00 Brisbane" as 2026-10-15T17:00+10:00 (withBrowserOffset).
        # It must land on 07:00 UTC the same day even on a server running on UTC or elsewhere.
        expected = {"dueDate": {"year": 2026, "month": 10, "day": 15}, "dueTime": {"hours": 7, "minutes": 0}}
        original = os.environ.get("TZ")
        try:
            for tz in ("UTC", "America/New_York", "Australia/Brisbane"):
                os.environ["TZ"] = tz
                if hasattr(time, "tzset"):
                    time.tzset()
                self.assertEqual(parse_due_datetime("2026-10-15T17:00+10:00"), expected, tz)
                self.assertEqual(parse_due_datetime("2026-10-15T23:59+10:00"),
                                 {"dueDate": {"year": 2026, "month": 10, "day": 15},
                                  "dueTime": {"hours": 13, "minutes": 59}}, tz)
        finally:
            if original is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = original
            if hasattr(time, "tzset"):
                time.tzset()

    def test_date_only_is_end_of_day_local_time(self):
        self.assertEqual(parse_due_datetime("2026-11-05"), local_end_of_day_utc(2026, 11, 5))

    def test_time_without_offset_is_local_time(self):
        self.assertEqual(parse_due_datetime("2026-11-05T17:00"), local_end_of_day_utc(2026, 11, 5, 17, 0))

    def test_excel_date_cells(self):
        self.assertEqual(parse_due_datetime(datetime(2026, 11, 5)), local_end_of_day_utc(2026, 11, 5))
        self.assertEqual(parse_due_datetime(pd.Timestamp("2026-11-05")), local_end_of_day_utc(2026, 11, 5))
        self.assertEqual(parse_due_datetime(datetime(2026, 11, 5, 9, 30)), local_end_of_day_utc(2026, 11, 5, 9, 30))

    def test_empty_values_mean_no_due_date(self):
        for empty in (None, "", "   ", float("nan"), pd.NaT):
            self.assertIsNone(parse_due_datetime(empty), repr(empty))

    def test_ambiguous_or_non_dates_are_refused(self):
        for bad in ("05/11/2026", "5 Nov 2026", "2026-13-01", 46331):
            with self.assertRaisesRegex(ValueError, "ISO 8601"):
                parse_due_datetime(bad, "Row 3: due date")

    def test_bad_date_stops_the_build_before_anything_is_created(self):
        with TempWorkbook() as path:
            write_curriculum(path, [{"Module Title": "One", "Assignment Title": "A1", "Due Date": "2026-11-05"},
                                    {"Module Title": "Two", "Assignment Title": "A2", "Due Date": "05/11/2026"}])
            service = get_classroom_service(use_mock=True, verbose=False)
            with self.assertRaisesRegex(ValueError, "Row 3: due date '05/11/2026'"):
                create_and_populate_course(service, path, verbose=False)
            self.assertEqual(service._store["courses"], {})

    def test_due_date_reaches_every_item_of_the_week(self):
        with TempWorkbook() as path:
            write_curriculum(path, [{"Module Title": "One", "Assignment Title": "A1", "Quiz Title": "Q1",
                                     "Question Prompt": "Why?", "Due Date": "2026-11-05T17:00+11:00"}])
            result = create_and_populate_course(get_classroom_service(use_mock=True, verbose=False), path, verbose=False)
            self.assertEqual(len(result["coursework"]), 3)
            for item in result["coursework"]:
                self.assertEqual((item["dueDate"], item["dueTime"]),
                                 ({"year": 2026, "month": 11, "day": 5}, {"hours": 6, "minutes": 0}))


class WholeCourseTests(unittest.TestCase):
    """A deploy always finishes: what Classroom refuses is logged, the rest is still built."""

    def build(self, rows, **store):
        with TempWorkbook() as path:
            write_curriculum(path, rows)
            service = get_classroom_service(use_mock=True, verbose=False)
            service._store.update(store)
            return service, create_and_populate_course(service, path, verbose=False)

    def test_weeks_with_the_same_topic_name_share_the_topic(self):
        rows = [{"Classroom Stream Topic": "Revision", "Module Title": f"M{i}", "Assignment Title": f"A{i}"}
                for i in range(3)]
        service, result = self.build(rows)
        topics = list(service._store["topics"][result["course"]["id"]].values())
        self.assertEqual([t["name"] for t in topics], ["Revision"])
        self.assertEqual(len(result["coursework"]), 3)
        self.assertTrue(all(cw["topicId"] == topics[0]["topicId"] for cw in result["coursework"]))
        self.assertEqual([e for e in result["log"] if e["status"] == "failed"], [])

    def test_long_topic_name_is_shortened_to_classroom_limit(self):
        service, result = self.build([{"Classroom Stream Topic": "Week 1: " + "x" * 200, "Assignment Title": "A1"}])
        name = list(service._store["topics"][result["course"]["id"]].values())[0]["name"]
        self.assertEqual(len(name), 100)
        self.assertTrue(name.endswith("…"))

    def test_a_refused_post_does_not_stop_the_rest_of_the_course(self):
        rows = [{"Module Title": "One", "Assignment Title": "Broken", "Quiz Title": "Quiz 1", "Question Prompt": "Why?"},
                {"Module Title": "Two", "Assignment Title": "A2"}]
        _, result = self.build(rows, refuse_titles={"Broken"})
        self.assertEqual(sorted(c["title"] for c in result["coursework"]), ["A2", "Quiz 1", "Why?"])
        failed = [e for e in result["log"] if e["status"] == "failed"]
        self.assertEqual([(e["step"], e["target"]) for e in failed], [("coursework", "Broken")])

    def test_refused_due_date_moves_into_the_description(self):
        _, result = self.build([{"Module Title": "One", "Assignment Title": "A1", "Due Date": "2026-11-05T17:00"}],
                               refuse_due_dates=True)
        item = result["coursework"][0]
        self.assertIsNone(item["dueDate"])
        self.assertIn("Due: 2026-11-05T17:00", item["description"])
        entry = [e for e in result["log"] if e["step"] == "coursework"][0]
        self.assertEqual(entry["status"], "partial")
        self.assertIn("refused the due date", entry["detail"])


QUIZ_ROWS = [
    {"Week": "Week 1", "Question": "2 + 2 =", "Question Type": "MULTIPLE_CHOICE", "Choices": "3\n4", "Correct Answers": "4", "Points": 2},
    {"Week": "Week 1", "Question": "Pick the primes", "Question Type": "CHECKBOXES", "Choices": "2;3;4", "Correct Answers": "2;3", "Points": 3},
    {"Week": "Week 1", "Question": "Explain why", "Question Type": "PARAGRAPH", "Choices": "", "Correct Answers": "", "Points": 5},
]


def write_quiz_course(path, quiz_rows=QUIZ_ROWS, rubric="https://docs.google.com/spreadsheets/d/1RubricSheetId1234/edit", weeks=1):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        pd.DataFrame([{"Setting": "class_name", "Value": "Maths"}]).to_excel(writer, sheet_name="Course_Settings", index=False)
        pd.DataFrame([{"Week": f"Week {i}", "Module Title": f"Numbers {i}", "Assessment / Knowledge Check": f"Worksheet {i}",
                       "Assignment Rubric (Google Sheet URL)": rubric, "Quiz assignment": f"Quiz {i}"}
                      for i in range(1, weeks + 1)]).to_excel(writer, sheet_name="Curriculum", index=False)
        pd.DataFrame(quiz_rows).to_excel(writer, sheet_name="Quiz_Questions", index=False)


class QuizAndRubricTests(unittest.TestCase):
    def build(self, weeks=1, **store):
        with TempWorkbook() as path:
            write_quiz_course(path, weeks=weeks)
            service = get_classroom_service(use_mock=True, verbose=False)
            service._store.update(store)
            return service, create_and_populate_course(service, path, verbose=False)

    def entry(self, result, step, target):
        return next(e for e in result["log"] if e["step"] == step and e["target"] == target)

    def test_quiz_is_a_published_google_form_with_its_answer_key(self):
        service, result = self.build()
        form = service._store["forms"][result["forms"][0]["formId"]]
        self.assertTrue(form["settings"]["quizSettings"]["isQuiz"])
        keys = [[a["value"] for a in i["questionItem"]["question"].get("grading", {}).get("correctAnswers", {}).get("answers", [])]
                for i in form["items"]]
        self.assertEqual(keys, [["4"], ["2", "3"], []])
        quiz = next(c for c in result["coursework"] if c["title"] == "Quiz 1")
        self.assertEqual((quiz["state"], quiz["maxPoints"]), ("PUBLISHED", 10))
        self.assertEqual(quiz["materials"], [{"link": {"url": result["forms"][0]["responderUri"]}}])
        self.assertEqual(self.entry(result, "form", "Quiz 1")["status"], "ok")

    def test_without_forms_permission_the_quiz_waits_as_a_draft(self):
        _, result = self.build(refuse_forms=(403, "Request had insufficient authentication scopes."))
        quiz = next(c for c in result["coursework"] if c["title"] == "Quiz 1")
        self.assertEqual((quiz["state"], quiz["materials"]), ("DRAFT", []))
        entry = self.entry(result, "form", "Quiz 1")
        self.assertEqual(entry["status"], "failed")
        self.assertIn("Sign out, sign in again, and allow access to Google Forms", entry["detail"])
        self.assertTrue(any(c["title"] == "Worksheet 1" for c in result["coursework"]))  # the rest is built

    def test_forms_api_switched_off_is_explained(self):
        _, result = self.build(refuse_forms=(403, "Google Forms API has not been used in project 123 before or it is disabled."))
        self.assertIn("Google Cloud Console", self.entry(result, "form", "Quiz 1")["detail"])

    def test_unpublished_form_is_still_attached_with_advice(self):
        _, result = self.build(refuse_publish=(400, "Publishing is not available."))
        quiz = next(c for c in result["coursework"] if c["title"] == "Quiz 1")
        self.assertEqual(len(quiz["materials"]), 1)
        entry = self.entry(result, "form", "Quiz 1")
        self.assertEqual(entry["status"], "partial")
        self.assertIn("press Publish", entry["detail"])

    def test_rubric_is_imported_from_its_sheet(self):
        service, result = self.build()
        assignment = next(c for c in result["coursework"] if c["title"] == "Worksheet 1")
        rubric = service._store["rubrics"][result["course"]["id"]][assignment["id"]]
        self.assertEqual(rubric["sourceSpreadsheetId"], "1RubricSheetId1234")
        self.assertEqual(result["rubrics"][0]["status"], "created")

    def test_refused_rubric_goes_in_the_description_and_is_not_retried(self):
        service, result = self.build(weeks=3, refuse_rubrics=(403, "The caller does not have permission"))
        for i in (1, 2, 3):
            item = service._store["coursework"][result["course"]["id"]]
            assignment = next(c for c in item.values() if c["title"] == f"Worksheet {i}")
            self.assertIn("Rubric (Google Sheet): https://docs.google.com/spreadsheets/d/1RubricSheetId1234/edit",
                          assignment["description"])
            entry = self.entry(result, "rubric", f"Worksheet {i}")
            self.assertEqual(entry["status"], "partial")
            self.assertIn("licence", entry["detail"])
        self.assertEqual(service._store["rubric_calls"], 1)  # the licence answer is not asked again

    def test_wrong_answer_key_stops_the_build_before_anything_is_created(self):
        with TempWorkbook() as path:
            write_quiz_course(path, quiz_rows=[{"Week": "Week 1", "Question": "2 + 2 =", "Choices": "3\n4", "Correct Answers": "5"}])
            service = get_classroom_service(use_mock=True, verbose=False)
            with self.assertRaisesRegex(ValueError, "Quiz_Questions row 2: the correct answer '5' is not one of the choices"):
                create_and_populate_course(service, path, verbose=False)
            self.assertEqual(service._store["courses"], {})

    def test_question_for_an_unknown_week_is_refused(self):
        with TempWorkbook() as path:
            write_quiz_course(path, quiz_rows=[{"Week": "Week 7", "Question": "Lost", "Correct Answers": "x"}])
            with self.assertRaisesRegex(ValueError, "week 'Week 7' is not in the Curriculum sheet"):
                parse_course_spreadsheet(path)

    def test_duplicate_week_in_curriculum_sheet_is_refused(self):
        with TempWorkbook() as path:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                pd.DataFrame([{"Setting": "class_name", "Value": "Maths"}]).to_excel(writer, sheet_name="Course_Settings", index=False)
                pd.DataFrame([
                    {"Week": "Week 1", "Module Title": "Numbers 1"},
                    {"Week": "Week 1", "Module Title": "Numbers 2"},
                ]).to_excel(writer, sheet_name="Curriculum", index=False)
            with self.assertRaisesRegex(ValueError, "duplicate Week 'Week 1'"):
                parse_course_spreadsheet(path)

    def test_duplicate_week_in_attach_quiz_questions_is_refused(self):
        import classroom_course_engine
        curriculum = [
            {"sequence": "Week 4", "title": "Module A", "quiz_questions": []},
            {"sequence": "Week 4", "title": "Module B", "quiz_questions": []},
        ]
        df_quiz = pd.DataFrame([{"Week": "Week 4", "Question": "Q1", "Choices": "A\nB", "Correct Answers": "A"}])
        with self.assertRaisesRegex(ValueError, "duplicate week 'Week 4'"):
            classroom_course_engine._attach_quiz_questions(df_quiz, curriculum, "Quiz_Questions")

    def test_full_drive_website_links_attach_as_drive_files(self):
        url = "https://drive.google.com/file/d/1Ry05DVSSEQxKwV-_PZdn7KPbWmmZKUwA/view"
        self.assertEqual(make_attachment(url).material,
                         {"driveFile": {"driveFile": {"id": "1Ry05DVSSEQxKwV-_PZdn7KPbWmmZKUwA"}, "shareMode": "VIEW"}})
        self.assertEqual(extract_sheet_id(url), "1Ry05DVSSEQxKwV-_PZdn7KPbWmmZKUwA")


class QuestionAndPointsTests(unittest.TestCase):
    def build(self, row, settings=None):
        with TempWorkbook() as path:
            write_curriculum(path, [{"Module Title": "One", **row}], settings)
            service = get_classroom_service(use_mock=True, verbose=False)
            return service, create_and_populate_course(service, path, verbose=False)

    def by_title(self, result, title):
        return next(c for c in result["coursework"] if c["title"] == title)

    def test_multiple_choice_question_gets_its_choices(self):
        _, result = self.build({"Question Prompt": "Pick one", "Question Type": "Multiple choice",
                                "Question Choices": "Alpha; Beta\nGamma;Beta"})
        question = self.by_title(result, "Pick one")
        self.assertEqual(question["workType"], "MULTIPLE_CHOICE_QUESTION")
        self.assertEqual(question["multipleChoiceQuestion"], {"choices": ["Alpha", "Beta", "Gamma"]})

    def test_multiple_choice_without_two_choices_is_refused_up_front(self):
        with TempWorkbook() as path:
            write_curriculum(path, [{"Module Title": "One", "Question Prompt": "Pick one",
                                     "Question Type": "MULTIPLE_CHOICE_QUESTION", "Question Choices": "Only"}])
            service = get_classroom_service(use_mock=True, verbose=False)
            with self.assertRaisesRegex(ValueError, "Row 2: the multiple-choice question 'Pick one' needs at least 2 choices"):
                create_and_populate_course(service, path, verbose=False)
            self.assertEqual(service._store["courses"], {})

    def test_choices_are_ignored_for_short_answer(self):
        _, result = self.build({"Question Prompt": "Explain", "Question Type": "SHORT_ANSWER_QUESTION",
                                "Question Choices": "A;B"})
        question = self.by_title(result, "Explain")
        self.assertEqual(question["workType"], "SHORT_ANSWER_QUESTION")
        self.assertNotIn("multipleChoiceQuestion", question)

    def test_quiz_and_question_points_come_from_the_sheet(self):
        _, result = self.build({"Quiz Title": "Q1", "Quiz Points": 30, "Question Prompt": "Why?",
                                "Question Points": 0, "Assignment Title": "A1", "Points": 80})
        self.assertEqual(self.by_title(result, "Q1")["maxPoints"], 30)
        self.assertEqual(self.by_title(result, "Why?")["maxPoints"], 0)  # 0 means ungraded
        self.assertEqual(self.by_title(result, "A1")["maxPoints"], 80)

    def test_points_default_when_columns_are_missing_or_blank(self):
        _, result = self.build({"Quiz Title": "Q1", "Question Prompt": "Why?", "Question Points": None})
        self.assertEqual(self.by_title(result, "Q1")["maxPoints"], 50)
        self.assertEqual(self.by_title(result, "Why?")["maxPoints"], 20)

    def test_invalid_points_are_refused(self):
        with TempWorkbook() as path:
            write_curriculum(path, [{"Module Title": "One", "Quiz Title": "Q1", "Quiz Points": "ten"}])
            with self.assertRaisesRegex(ValueError, "'ten' is not a number of points"):
                parse_course_spreadsheet(path)

    def test_welcome_announcement_is_posted_last(self):
        service, result = self.build({"Assignment Title": "A1"},
                                     {"class_name": "Fixes", "welcome_announcement": "Welcome, everyone!"})
        posts = service._store["announcements"][result["course"]["id"]]
        self.assertEqual([(p["text"], p["state"]) for p in posts], [("Welcome, everyone!", "PUBLISHED")])
        self.assertEqual(result["log"][-1]["step"], "announcement")
        self.assertEqual(result["announcement"]["text"], "Welcome, everyone!")

    def test_no_announcement_without_a_welcome_message(self):
        service, result = self.build({"Assignment Title": "A1"})
        self.assertEqual(service._store["announcements"][result["course"]["id"]], [])
        self.assertIsNone(result["announcement"])


if __name__ == "__main__":
    unittest.main()
