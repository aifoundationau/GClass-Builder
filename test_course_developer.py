"""Unit tests for course_developer. No network calls: Classroom is a recording fake, Gemini is mocked."""

import json
import unittest
from unittest import mock

import classroom_api
import course_developer as cd

# Method lists from the Classroom v1 discovery document, revision 20261006, pinned so the
# tests run offline. Refresh this table when the discovery revision changes.
DISCOVERY_REVISION = "20261006"
DISCOVERY_METHODS = {
    "courses": ("create", "delete", "get", "getGradingPeriodSettings", "list", "patch", "update", "updateGradingPeriodSettings"),
    "courses.aliases": ("create", "delete", "list"),
    "courses.announcements": ("create", "delete", "get", "getAddOnContext", "list", "modifyAssignees", "patch"),
    "courses.announcements.addOnAttachments": ("create", "delete", "get", "list", "patch"),
    "courses.courseWork": ("create", "delete", "get", "getAddOnContext", "list", "modifyAssignees", "patch", "updateRubric"),
    "courses.courseWork.addOnAttachments": ("create", "delete", "get", "list", "patch"),
    "courses.courseWork.addOnAttachments.studentSubmissions": ("get", "patch"),
    "courses.courseWork.rubrics": ("create", "delete", "get", "list", "patch"),
    "courses.courseWork.studentSubmissions": ("get", "list", "modifyAttachments", "patch", "reclaim", "return", "turnIn"),
    "courses.courseWorkMaterials": ("create", "delete", "get", "getAddOnContext", "list", "patch"),
    "courses.courseWorkMaterials.addOnAttachments": ("create", "delete", "get", "list", "patch"),
    "courses.posts": ("getAddOnContext",),
    "courses.posts.addOnAttachments": ("create", "delete", "get", "list", "patch"),
    "courses.posts.addOnAttachments.studentSubmissions": ("get", "patch"),
    "courses.studentGroups": ("create", "delete", "list", "patch"),
    "courses.studentGroups.studentGroupMembers": ("create", "delete", "list"),
    "courses.students": ("create", "delete", "get", "list"),
    "courses.teachers": ("create", "delete", "get", "list"),
    "courses.topics": ("create", "delete", "get", "list", "patch"),
    "invitations": ("accept", "create", "delete", "get", "list"),
    "registrations": ("create", "delete"),
    "userProfiles": ("get",),
    "userProfiles.guardianInvitations": ("create", "get", "list", "patch"),
    "userProfiles.guardians": ("delete", "get", "list"),
}
# Allowed here but not in revision 20261006. These are read-only checks, kept on purpose.
KNOWN_NOT_IN_DISCOVERY = {
    ("courses", "checkAddOnCreationEligibility"),
    ("courses", "checkGradingPeriodsSetupEligibility"),
    ("userProfiles", "checkUserCapability"),
}

_METHOD_NAMES = {
    "create", "get", "list", "patch", "update", "delete", "accept", "modifyAssignees",
    "updateRubric", "modifyAttachments", "reclaim", "return", "turnIn", "getAddOnContext",
    "getGradingPeriodSettings", "updateGradingPeriodSettings", "checkAddOnCreationEligibility",
    "checkGradingPeriodsSetupEligibility", "checkUserCapability",
}


class _Request:
    def __init__(self, svc, path, method, kwargs):
        self.svc = svc
        self.path = path
        self.method = method
        self.kwargs = dict(kwargs)

    def execute(self):
        resource = ".".join(self.path)
        params = {k: v for k, v in self.kwargs.items() if k != "body"}
        body = self.kwargs.get("body")
        self.svc.calls.append({"resource": resource, "method": self.method,
                               "params": params, "body": body})
        if f"{resource}.{self.method}" in self.svc.fail:
            raise RuntimeError(f"Classroom refused {resource}.{self.method}")
        if self.method == "get" and resource in self.svc.items:
            return dict(self.svc.items[resource])
        if self.method == "list":
            source = self.svc.data.get(resource, {})
            response = {}
            for key, items in source.items():
                response[key] = items(params) if callable(items) else items
            return response
        return {"id": "new-id"}


class _Node:
    def __init__(self, svc, path):
        self.svc = svc
        self.path = path

    def __call__(self, *args, **kwargs):
        return self

    def __getattr__(self, name):
        if name in _METHOD_NAMES:
            def make(**kwargs):
                return _Request(self.svc, self.path, name, kwargs)
            return make
        return _Node(self.svc, self.path + (name,))


class FakeService:
    """Records every call. data maps a dotted resource to {list_key: items or callable(params)}."""

    def __init__(self, data=None, fail=None, items=None):
        self.data = data or {}
        self.fail = set(fail or ())
        self.items = items or {}  # resource -> the item returned by its get method
        self.calls = []

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return _Node(self, (name,))

    def methods_called(self):
        return {call["method"] for call in self.calls}


class StepCatalogueTests(unittest.TestCase):
    def test_every_allowed_resource_appears_in_exactly_one_step(self):
        counts = {resource: 0 for resource in classroom_api.ALLOWED_METHODS}
        for step in cd.STEPS:
            for resource in step["resources"]:
                self.assertIn(resource, counts, f"step '{step['key']}' lists unknown resource {resource}")
                counts[resource] += 1
        missing = [r for r, n in counts.items() if n == 0]
        duplicated = [r for r, n in counts.items() if n > 1]
        self.assertEqual(missing, [], "resources missing from every step")
        self.assertEqual(duplicated, [], "resources listed in more than one step")

    def test_step_keys_are_unique(self):
        keys = [step["key"] for step in cd.STEPS]
        self.assertEqual(len(keys), len(set(keys)))

    def test_add_on_resources_are_all_in_addons_step(self):
        addons = next(s for s in cd.STEPS if s["key"] == "addons")
        self.assertTrue(classroom_api.ADDON_RESOURCES <= set(addons["resources"]))

    def test_policy_step_has_no_resources_and_lists_every_blocked_delete(self):
        listed = {(item["resource"], item["method"]) for step in cd.list_steps()
                  if step["key"] == "policy" for item in step["blocked_deletes"]}
        expected = {(r, m) for r, methods in classroom_api.BLOCKED_DELETES.items() for m in methods}
        self.assertEqual(listed, expected)
        policy = next(s for s in cd.STEPS if s["key"] == "policy")
        self.assertEqual(policy["resources"], [])

    def test_list_steps_expands_each_resource_to_its_methods(self):
        for step in cd.list_steps():
            for item in step["resources"]:
                self.assertEqual(item["methods"], sorted(classroom_api.ALLOWED_METHODS[item["resource"]]))

    def test_list_steps_never_offers_delete_as_a_method(self):
        for step in cd.list_steps():
            for item in step["resources"]:
                self.assertNotIn("delete", item["methods"], item["resource"])


class ValidateOperationsTests(unittest.TestCase):
    def validate(self, op, step_key=None, course_id="c1", known=False):
        return cd.validate_operations([op], course_id, step_key=step_key, known_ids=KNOWN if known else None)

    def test_delete_is_refused_for_every_resource_with_a_delete_method(self):
        for resource in classroom_api.BLOCKED_DELETES:
            cleaned, rejected = self.validate({"resource": resource, "method": "delete",
                                               "params": {"id": "x"}, "body": {}})
            self.assertEqual(cleaned, [], resource)
            self.assertEqual(len(rejected), 1, resource)
            self.assertIn("not allowed", rejected[0]["reason"].lower(), resource)

    def test_no_method_named_delete_is_ever_cleaned(self):
        ops = []
        for resource, methods in classroom_api.ALLOWED_METHODS.items():
            for method in list(methods) + ["delete"]:
                ops.append({"resource": resource, "method": method,
                            "params": {"id": "1", "courseWorkId": "2", "studentId": "3",
                                       "invitationId": "4", "studentGroupId": "5"},
                            "body": {"name": "x", "title": "x", "text": "x", "userId": "u",
                                     "role": "TEACHER", "state": "PUBLISHED", "alias": "a"}})
        cleaned, rejected = cd.validate_operations(ops, "c1")
        self.assertTrue(all(item["method"] != "delete" for item in cleaned))
        self.assertEqual(len(cleaned) + len(rejected), len(ops))

    def test_resource_outside_the_step_is_refused(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.announcements", "method": "create", "body": {"text": "hi"}}],
            "c1", step_key="topics")
        self.assertEqual(cleaned, [])
        self.assertIn("not part of", rejected[0]["reason"])

    def test_unknown_step_rejects_everything(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.topics", "method": "create", "body": {"name": "x"}}],
            "c1", step_key="nope")
        self.assertEqual(cleaned, [])
        self.assertEqual(len(rejected), 1)

    def test_unknown_body_fields_are_dropped(self):
        cleaned, _ = self.validate({"resource": "courses.topics", "method": "create",
                                    "body": {"name": "Week 1", "bogus": 1, "id": "x", "courseId": "other"}})
        self.assertEqual(cleaned[0]["body"], {"name": "Week 1"})

    def test_course_work_create_is_forced_to_draft(self):
        cleaned, _ = self.validate({"resource": "courses.courseWork", "method": "create",
                                    "body": {"title": "Essay", "topicId": "t1", "workType": "ASSIGNMENT", "state": "PUBLISHED"}}, known=True)
        self.assertEqual(cleaned[0]["body"]["state"], "DRAFT")
        self.assertFalse(cleaned[0]["publish"])

    def test_course_work_create_is_published_only_with_the_teacher_publish_flag(self):
        cleaned, _ = self.validate({"resource": "courses.courseWork", "method": "create",
                                    "body": {"title": "Essay", "topicId": "t1", "workType": "ASSIGNMENT"},
                                    "publish": True}, known=True)
        self.assertEqual(cleaned[0]["body"]["state"], "PUBLISHED")
        self.assertTrue(cleaned[0]["publish"])

    def test_materials_and_announcements_creates_are_forced_to_draft(self):
        for resource, body in [("courses.courseWorkMaterials", {"title": "Reading", "topicId": "t1"}),
                               ("courses.announcements", {"text": "Hello"})]:
            cleaned, _ = self.validate({"resource": resource, "method": "create", "body": dict(body)})
            self.assertEqual(cleaned[0]["body"]["state"], "DRAFT", resource)

    def test_deleted_state_is_never_sent(self):
        cleaned, rejected = self.validate({"resource": "courses.courseWork", "method": "patch",
                                           "params": {"id": "w1"}, "body": {"state": "DELETED"},
                                           "publish": True})
        self.assertEqual(cleaned, [])
        self.assertEqual(len(rejected), 1)

    def test_patch_with_publish_flag_keeps_published_state(self):
        cleaned, _ = self.validate({"resource": "courses.courseWork", "method": "patch",
                                    "params": {"id": "w1"}, "body": {"state": "PUBLISHED", "title": "T"},
                                    "publish": True})
        self.assertEqual(cleaned[0]["body"], {"state": "PUBLISHED", "title": "T"})
        self.assertEqual(cleaned[0]["params"]["updateMask"], "state,title")

    def test_patch_without_publish_flag_drops_state(self):
        cleaned, _ = self.validate({"resource": "courses.courseWork", "method": "patch",
                                    "params": {"id": "w1"}, "body": {"state": "PUBLISHED", "title": "T"}})
        self.assertEqual(cleaned[0]["body"], {"title": "T"})
        self.assertEqual(cleaned[0]["params"]["updateMask"], "title")

    def test_patch_sets_update_mask_and_path_ids(self):
        cleaned, _ = self.validate({"resource": "courses.topics", "method": "patch",
                                    "params": {"id": "t1", "updateMask": "x"},
                                    "body": {"name": "New", "bogus": 2}})
        params = cleaned[0]["params"]
        self.assertEqual(params, {"courseId": "c1", "id": "t1", "updateMask": "name"})

    def test_patch_without_a_supported_field_is_refused(self):
        cleaned, rejected = self.validate({"resource": "courses.topics", "method": "patch",
                                           "params": {"id": "t1"}, "body": {"bogus": 1}})
        self.assertEqual(cleaned, [])
        self.assertIn("No supported fields", rejected[0]["reason"])

    def test_patch_without_the_item_id_is_refused(self):
        cleaned, rejected = self.validate({"resource": "courses.topics", "method": "patch",
                                           "params": {}, "body": {"name": "X"}})
        self.assertEqual(cleaned, [])
        self.assertIn("'id'", rejected[0]["reason"])

    def test_course_id_is_always_the_requested_course(self):
        cleaned, _ = cd.validate_operations(
            [{"resource": "courses.topics", "method": "create", "params": {"courseId": "other"},
              "body": {"name": "X"}}], "c1")
        self.assertEqual(cleaned[0]["params"]["courseId"], "c1")

    def test_course_details_change_only_by_patch_and_only_the_safe_states(self):
        cleaned, rejected = self.validate({"resource": "courses", "method": "patch",
                                           "body": {"name": "Bio", "courseState": "DECLINED"}})
        self.assertEqual(cleaned[0]["body"], {"name": "Bio"})
        self.assertEqual(cleaned[0]["params"], {"id": "c1", "updateMask": "name"})
        cleaned, rejected = self.validate({"resource": "courses", "method": "create", "body": {"name": "New"}})
        self.assertEqual(cleaned, [])
        cleaned, rejected = self.validate({"resource": "courses", "method": "update", "body": {"name": "New"}})
        self.assertEqual(cleaned, [])

    def test_add_on_resources_are_refused(self):
        cleaned, rejected = self.validate({"resource": "courses.courseWork.addOnAttachments",
                                           "method": "create", "body": {"title": "x"}})
        self.assertEqual(cleaned, [])
        self.assertIn("add-on", rejected[0]["reason"].lower())

    def test_read_and_action_methods_are_refused(self):
        cases = [("courses.courseWork", "get"), ("courses.courseWork", "list"),
                 ("courses.courseWork", "modifyAssignees"), ("courses.courseWork.studentSubmissions", "reclaim"),
                 ("courses.courseWork.studentSubmissions", "turnIn")]
        for resource, method in cases:
            cleaned, rejected = self.validate({"resource": resource, "method": method,
                                               "params": {"id": "1", "courseWorkId": "2"},
                                               "body": {"title": "x", "assignedGrade": 5}})
            self.assertEqual(cleaned, [], f"{resource}.{method}")
            self.assertEqual(len(rejected), 1)

    def test_invitations_can_add_students_or_teachers_but_not_owners(self):
        cleaned, rejected = self.validate({"resource": "invitations", "method": "create",
                                           "body": {"userId": "u1", "role": "OWNER"}})
        self.assertEqual(cleaned, [])
        cleaned, _ = self.validate({"resource": "invitations", "method": "create",
                                    "body": {"userId": "u1", "role": "TEACHER", "courseId": "other"}})
        self.assertEqual(cleaned[0]["body"], {"userId": "u1", "role": "TEACHER", "courseId": "c1"})
        self.assertEqual(cleaned[0]["params"], {})

    def test_enrollment_code_is_never_sent(self):
        cleaned, _ = self.validate({"resource": "courses.students", "method": "create",
                                    "params": {"enrollmentCode": "abc"}, "body": {"userId": "u1"}})
        self.assertEqual(cleaned[0]["params"], {"courseId": "c1"})
        self.assertEqual(cleaned[0]["body"], {"userId": "u1"})

    def test_registrations_cannot_be_changed(self):
        cleaned, _ = self.validate({"resource": "registrations", "method": "create",
                                    "body": {"feed": {"feedType": "COURSE_ROSTER_CHANGES"}}})
        self.assertEqual(cleaned, [])

    def test_missing_guardian_student_id_is_refused(self):
        cleaned, rejected = self.validate({"resource": "userProfiles.guardianInvitations",
                                           "method": "create", "body": {"invitedEmailAddress": "p@x.org"}})
        self.assertEqual(cleaned, [])
        self.assertIn("studentId", rejected[0]["reason"])
        cleaned, _ = self.validate({"resource": "userProfiles.guardianInvitations", "method": "create",
                                    "params": {"studentId": "s1"}, "body": {"invitedEmailAddress": "p@x.org"}})
        self.assertEqual(cleaned[0]["params"], {"studentId": "s1"})

    def test_rejections_carry_a_reason_string(self):
        _, rejected = cd.validate_operations(["not a dict", {"resource": "nope", "method": "create"}], "c1")
        self.assertEqual(len(rejected), 2)
        for item in rejected:
            self.assertIsInstance(item["reason"], str)
            self.assertTrue(item["reason"])


class ApplyOperationsTests(unittest.TestCase):
    def test_apply_never_calls_delete(self):
        ops = []
        for resource, methods in classroom_api.ALLOWED_METHODS.items():
            ops.append({"resource": resource, "method": "delete", "params": {"id": "1"}, "body": {}})
        ops += [
            {"resource": "courses.topics", "method": "create", "body": {"name": "Week 1"}},
            {"resource": "courses.topics", "method": "patch", "params": {"id": "t1"}, "body": {"name": "X"}},
        ]
        svc = FakeService()
        results = cd.apply_operations(svc, ops, course_id="c1")
        self.assertEqual(len(results), len(ops))
        self.assertTrue(all(call["method"] != "delete" for call in svc.calls))
        self.assertFalse(any("delete" in call["resource"] for call in svc.calls))
        self.assertFalse(any(r["ok"] for r in results if r["method"] == "delete"))
        self.assertEqual([r["ok"] for r in results[-2:]], [True, True])

    def test_apply_continues_after_one_failing_item(self):
        ops = [
            {"resource": "courses.topics", "method": "create", "body": {"name": "A"}},
            {"resource": "courses.topics", "method": "create", "body": {"name": "B"}},
        ]
        svc = FakeService(fail={"courses.topics.create"})
        results = cd.apply_operations(svc, ops, course_id="c1")
        self.assertEqual(len(results), 2)
        self.assertFalse(results[0]["ok"])
        self.assertIn("refused", results[0]["error"])
        self.assertEqual([c["method"] for c in svc.calls if c["method"] != "list"], ["create", "create"])

    def test_apply_result_shape_and_id(self):
        svc = FakeService()
        results = cd.apply_operations(svc, [{"resource": "courses.topics", "method": "create",
                                             "body": {"name": "A"}}], course_id="c1")
        self.assertEqual(set(results[0]), {"resource", "method", "ok", "id", "error"})
        self.assertTrue(results[0]["ok"])
        self.assertEqual(results[0]["id"], "new-id")
        self.assertIsNone(results[0]["error"])

    def test_apply_forces_the_requested_course(self):
        svc = FakeService()
        cd.apply_operations(svc, [{"resource": "courses.topics", "method": "create",
                                   "params": {"courseId": "other"}, "body": {"name": "A"}}],
                            course_id="c1")
        self.assertEqual(svc.calls[0]["params"]["courseId"], "c1")

    def test_apply_rejects_operations_that_fail_validation(self):
        svc = FakeService()
        results = cd.apply_operations(svc, [{"resource": "courses.courseWork.addOnAttachments",
                                             "method": "create", "body": {"title": "x"}}], course_id="c1")
        self.assertFalse(results[0]["ok"])
        self.assertEqual([c for c in svc.calls if c["method"] != "list"], [])


class ReadTests(unittest.TestCase):
    def test_every_step_is_read_with_get_and_list_only(self):
        svc = FakeService(data={
            "courses.students": {"students": [{"userId": "u1"}]},
            "courses.courseWork": {"courseWork": [{"id": "w1", "courseId": "c1"}]},
            "courses.studentGroups": {"studentGroups": [{"id": "g1"}]},
        })
        for step in cd.STEPS:
            cd.load_step_data(svc, "c1", step["key"], nested=True)
        self.assertTrue(svc.calls)
        self.assertTrue(svc.methods_called() <= {"get", "list"}, svc.methods_called())

    def test_addons_step_makes_no_calls(self):
        svc = FakeService()
        data = cd.load_step_data(svc, "c1", "addons")
        self.assertEqual(svc.calls, [])
        self.assertTrue(all(v == [] for v in data.values()))

    def test_course_step_reads_the_course_under_course_key(self):
        svc = FakeService(data={"courses.topics": {"topic": []}})
        data = cd.load_step_data(svc, "c1", "course")
        self.assertEqual(data["course"], [{"id": "new-id"}])
        self.assertEqual(svc.calls[0]["resource"], "courses")
        self.assertEqual(svc.calls[0]["method"], "get")

    def test_nested_reads_use_each_parent_id(self):
        svc = FakeService(data={
            "courses.courseWork": {"courseWork": [{"id": "w1"}, {"id": "w2"}]},
            "courses.courseWork.rubrics": {"rubrics": lambda p: [{"courseWorkId": p["courseWorkId"]}]},
        })
        data = cd.load_step_data(svc, "c1", "assignments", nested=True)
        self.assertEqual([r["courseWorkId"] for r in data["courses.courseWork.rubrics"]], ["w1", "w2"])

    def test_placement_snapshot_skips_nested_reads(self):
        svc = FakeService(data={"courses.courseWork": {"courseWork": [{"id": "w1"}]}})
        cd.load_step_data(svc, "c1", "assignments", nested=False)
        self.assertNotIn("courses.courseWork.studentSubmissions",
                         {c["resource"] for c in svc.calls})


class ProposeTests(unittest.TestCase):
    def _gemini(self, payload):
        client = mock.Mock()
        client.generate_json.return_value = payload
        return client

    def test_propose_step_refuses_deletes_and_strips_publish(self):
        payload = {"summary": "Add a unit", "operations": [
            {"resource": "courses.topics", "method": "delete", "params": {"id": "t1"}, "body": {}, "reason": "x"},
            {"resource": "courses.topics", "method": "create", "body": {"name": "Unit 1"},
             "publish": True, "reason": "add"},
            {"resource": "courses.announcements", "method": "create", "body": {"text": "hi"}, "reason": "out"},
        ]}
        client = self._gemini(payload)
        with mock.patch("ai_model_router.get_gemini_client", return_value=client):
            result = cd.propose_step(FakeService(), "c1", "topics", "Add unit 1")
        self.assertEqual(result["summary"], "Add a unit")
        self.assertEqual(len(result["operations"]), 1)
        self.assertEqual(result["operations"][0]["body"], {"name": "Unit 1"})
        self.assertEqual(len(result["rejected"]), 2)
        self.assertTrue(all(r["reason"] for r in result["rejected"]))
        prompt = client.generate_json.call_args.args[0]
        self.assertIn("courses.topics", prompt)

    def test_propose_step_forces_draft_even_if_ai_asks_for_published(self):
        payload = {"summary": "s", "operations": [
            {"resource": "courses.courseWork", "method": "create",
             "body": {"title": "Essay", "topicId": "t1", "state": "PUBLISHED"}, "publish": True, "reason": "r"}]}
        with mock.patch("ai_model_router.get_gemini_client", return_value=self._gemini(payload)):
            result = cd.propose_step(FakeService(data=_course_data()), "c1", "assignments", "Add an essay")
        self.assertEqual(result["operations"][0]["body"]["state"], "DRAFT")

    def test_policy_step_never_calls_the_model(self):
        client = self._gemini({})
        with mock.patch("ai_model_router.get_gemini_client", return_value=client):
            result = cd.propose_step(FakeService(), "c1", "policy", "delete everything")
        client.generate_json.assert_not_called()
        self.assertEqual(result["operations"], [])

    def test_propose_placement_keeps_source_and_targets_only_placement_resources(self):
        payload = {"summary": "Two parts", "placements": [
            {"resource": "courses.topics", "method": "create", "body": {"name": "Week 1"},
             "reason": "heading", "source": "notes.txt: Week 1"},
            {"resource": "courses.courseWork", "method": "create",
             "body": {"title": "Quiz", "topicId": "t1", "workType": "ASSIGNMENT"}, "publish": True,
             "reason": "quiz", "source": "Pasted text: quiz"},
            {"resource": "courses", "method": "patch", "body": {"description": "x"}, "reason": "no",
             "source": "Pasted text"},
        ]}
        client = self._gemini(payload)
        with mock.patch("ai_model_router.get_gemini_client", return_value=client):
            result = cd.propose_placement(FakeService(data=_course_data()), "c1", "Week 1 notes",
                                          [{"name": "notes.txt", "text": "Week 1"}])
        self.assertEqual(result["summary"], "Two parts")
        self.assertEqual([p["resource"] for p in result["placements"]], ["courses.topics", "courses.courseWork"])
        self.assertEqual(result["placements"][0]["source"], "notes.txt: Week 1")
        self.assertEqual(result["placements"][1]["body"]["state"], "DRAFT")
        self.assertEqual(len(result["rejected"]), 1)

    def test_propose_placement_needs_some_content(self):
        with self.assertRaises(ValueError):
            cd.propose_placement(FakeService(), "c1", "  ", [])

    def test_propose_step_does_not_read_or_send_guardians_unless_the_request_is_about_them(self):
        svc = FakeService(data={
            "courses.students": {"students": [{"userId": "u1", "profile": {
                "name": {"fullName": "Sam Lee"}, "emailAddress": "sam@family.example"}}]},
            "userProfiles.guardians": {"guardians": [{"studentId": "u1", "guardianId": "g1", "guardianProfile": {
                "name": {"fullName": "Pat Lee"}, "emailAddress": "pat@family.example"}}]},
            "userProfiles.guardianInvitations": {"guardianInvitations": [{
                "invitationId": "i1", "studentId": "u1", "invitedEmailAddress": "new@family.example"}]},
        })
        client = self._gemini({"summary": "", "operations": []})
        with mock.patch("ai_model_router.get_gemini_client", return_value=client):
            cd.propose_step(svc, "c1", "people", "Add a note to the class list")
        prompt = client.generate_json.call_args.args[0]
        self.assertFalse(any(call["resource"].startswith("userProfiles.guardian") for call in svc.calls))
        self.assertNotIn("family.example", prompt)
        self.assertIn("Sam Lee", prompt)

    def test_propose_step_sends_guardian_ids_but_no_contact_details_when_asked(self):
        svc = FakeService(data={
            "courses.students": {"students": [{"userId": "u1", "profile": {"emailAddress": "sam@family.example"}}]},
            "userProfiles.guardians": {"guardians": [{"studentId": "u1", "guardianId": "g1", "guardianProfile": {
                "name": {"fullName": "Pat Lee"}, "emailAddress": "pat@family.example"}}]},
        })
        client = self._gemini({"summary": "", "operations": []})
        with mock.patch("ai_model_router.get_gemini_client", return_value=client):
            cd.propose_step(svc, "c1", "people", "Tell the parents about the trip")
        prompt = client.generate_json.call_args.args[0]
        self.assertTrue(any(call["resource"] == "userProfiles.guardians" for call in svc.calls))
        self.assertIn("g1", prompt)
        self.assertNotIn("family.example", prompt)
        self.assertNotIn("Pat Lee", prompt)


class PromptPrivacyTests(unittest.TestCase):
    def test_prompt_data_drops_contact_details_and_guardian_profiles(self):
        data = {
            "courses.students": [{"userId": "u1", "profile": {"name": {"fullName": "Sam"},
                                                              "emailAddress": "sam@x.org",
                                                              "photoUrl": "https://img.example/p"}}],
            "userProfiles.guardianInvitations": [{"invitationId": "i1", "invitedEmailAddress": "parent@x.org"}],
            "userProfiles.guardians": [{"guardianId": "g1", "guardianProfile": {"name": {"fullName": "Pat"},
                                                                                "emailAddress": "pat@x.org"}}],
        }
        text = json.dumps(cd._prompt_safe(data))
        for leaked in ("sam@x.org", "https://img.example/p", "parent@x.org", "pat@x.org", "Pat"):
            self.assertNotIn(leaked, text)
        self.assertIn("Sam", text)
        self.assertIn("i1", text)
        self.assertIn("g1", text)


class PatchMergeTests(unittest.TestCase):
    def test_announcement_text_is_appended_to_the_existing_text(self):
        svc = FakeService(items={"courses.announcements": {"text": "Office hours Tuesday"}})
        results = cd.apply_operations(svc, [{"resource": "courses.announcements", "method": "patch",
                                             "params": {"id": "a1"}, "body": {"text": "Quiz moved to Friday"}}],
                                      course_id="c1")
        self.assertTrue(results[0]["ok"])
        patch = [c for c in svc.calls if c["method"] == "patch"][0]
        self.assertEqual(patch["body"]["text"], "Office hours Tuesday\n\nQuiz moved to Friday")
        self.assertEqual(patch["params"], {"courseId": "c1", "id": "a1", "updateMask": "text"})

    def test_text_that_already_contains_the_old_text_is_sent_as_is(self):
        svc = FakeService(items={"courses.courseWork": {"description": "Read chapter 2"}})
        cd.apply_operations(svc, [{"resource": "courses.courseWork", "method": "patch",
                                   "params": {"id": "w1"},
                                   "body": {"description": "Read chapter 2 and answer the questions"}}],
                            course_id="c1")
        patch = [c for c in svc.calls if c["method"] == "patch"][0]
        self.assertEqual(patch["body"]["description"], "Read chapter 2 and answer the questions")

    def test_materials_are_added_to_the_existing_list_without_duplicates(self):
        existing = {"link": {"url": "https://a.example/one"}}
        svc = FakeService(items={"courses.courseWork": {"materials": [existing]}})
        new_link = {"link": {"url": "https://a.example/two"}}
        cd.apply_operations(svc, [{"resource": "courses.courseWork", "method": "patch",
                                   "params": {"id": "w1"},
                                   "body": {"materials": [existing, new_link]}}], course_id="c1")
        patch = [c for c in svc.calls if c["method"] == "patch"][0]
        self.assertEqual(patch["body"]["materials"], [existing, new_link])

    def test_course_description_patch_keeps_the_old_description(self):
        svc = FakeService(items={"courses": {"description": "Welcome"}})
        cd.apply_operations(svc, [{"resource": "courses", "method": "patch",
                                   "body": {"description": "Term 2 starts Monday"}}], course_id="c1")
        patch = [c for c in svc.calls if c["method"] == "patch"][0]
        self.assertEqual(patch["body"]["description"], "Welcome\n\nTerm 2 starts Monday")
        self.assertEqual(patch["params"], {"id": "c1", "updateMask": "description"})

    def test_failed_read_of_the_current_item_means_no_write(self):
        svc = FakeService(fail={"courses.announcements.get"})
        results = cd.apply_operations(svc, [{"resource": "courses.announcements", "method": "patch",
                                             "params": {"id": "a1"}, "body": {"text": "New"}}],
                                      course_id="c1")
        self.assertFalse(results[0]["ok"])
        self.assertFalse(any(c["method"] == "patch" for c in svc.calls))

    def test_patch_without_text_or_materials_makes_no_read(self):
        svc = FakeService()
        cd.apply_operations(svc, [{"resource": "courses.topics", "method": "patch",
                                   "params": {"id": "t1"}, "body": {"name": "X"}}], course_id="c1")
        self.assertEqual([c["method"] for c in svc.calls if c["method"] != "list"], ["patch"])


class PublishPathTests(unittest.TestCase):
    def test_ticked_create_reaches_classroom_as_published(self):
        svc = FakeService(data=_course_data())
        results = cd.apply_operations(svc, [{"resource": "courses.courseWork", "method": "create",
                                             "body": {"title": "Quiz 1", "topicId": "t1", "workType": "ASSIGNMENT"},
                                             "publish": True}], course_id="c1")
        self.assertTrue(results[0]["ok"])
        self.assertEqual(next(c for c in svc.calls if c["method"] == "create")["body"]["state"], "PUBLISHED")

    def test_unticked_create_is_saved_as_draft(self):
        svc = FakeService(data=_course_data())
        cd.apply_operations(svc, [{"resource": "courses.courseWork", "method": "create",
                                   "body": {"title": "Quiz 1", "topicId": "t1", "workType": "ASSIGNMENT", "state": "PUBLISHED"},
                                   "publish": False}], course_id="c1")
        self.assertEqual(next(c for c in svc.calls if c["method"] == "create")["body"]["state"], "DRAFT")


class DiscoveryParityTests(unittest.TestCase):
    def test_every_discovery_method_is_allowed_or_blocked(self):
        for resource, methods in DISCOVERY_METHODS.items():
            for method in methods:
                if method == "delete":
                    self.assertIn("delete", classroom_api.BLOCKED_DELETES.get(resource, ()), resource)
                else:
                    self.assertIn(method, classroom_api.ALLOWED_METHODS.get(resource, ()),
                                  f"{resource}.{method} missing from ALLOWED_METHODS")

    def test_allowed_methods_are_in_discovery_except_known_read_only_checks(self):
        extra = {(resource, method)
                 for resource, methods in classroom_api.ALLOWED_METHODS.items()
                 for method in methods
                 if method not in DISCOVERY_METHODS.get(resource, ())}
        self.assertEqual(extra, KNOWN_NOT_IN_DISCOVERY)

    def test_blocked_deletes_are_exactly_the_discovery_deletes(self):
        discovery_deletes = {r for r, m in DISCOVERY_METHODS.items() if "delete" in m}
        self.assertEqual(set(classroom_api.BLOCKED_DELETES), discovery_deletes)

    def test_update_rubric_is_on_the_surface_but_the_engine_does_not_propose_it(self):
        classroom_api.check_call("courses.courseWork", "updateRubric")
        row = next(r for r in classroom_api.describe_surface() if r["resource"] == "courses.courseWork")
        self.assertIn("updateRubric", row["methods"])
        self.assertIn("updateRubric", row["editing_methods"])
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork", "method": "updateRubric", "params": {"id": "w1"},
              "body": {"criteria": []}}], "c1")
        self.assertEqual(cleaned, [])
        self.assertEqual(len(rejected), 1)


KNOWN = {"topics": frozenset({"t1"}), "works": frozenset({"w1"})}


def _course_data(topic_ids=("t1",), work_ids=("w1",)):
    """Fake course contents: the topics and assignments the id lookups should find."""
    return {
        "courses.topics": {"topic": [{"topicId": t, "name": t} for t in topic_ids]},
        "courses.courseWork": {"courseWork": [{"id": w, "title": w} for w in work_ids]},
    }


class TopicPlacementRuleTests(unittest.TestCase):
    def test_course_work_create_without_topic_is_refused(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork", "method": "create", "body": {"title": "Quiz", "workType": "ASSIGNMENT"}}],
            "c1", known_ids=KNOWN)
        self.assertEqual(cleaned, [])
        self.assertIn("topic", rejected[0]["reason"])

    def test_material_create_without_topic_is_refused_even_without_known_ids(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWorkMaterials", "method": "create", "body": {"title": "Reading"}}], "c1")
        self.assertEqual(cleaned, [])
        self.assertIn("topic", rejected[0]["reason"])

    def test_topic_must_be_a_topic_of_this_course(self):
        ops = [
            {"resource": "courses.courseWorkMaterials", "method": "create", "body": {"title": "A", "topicId": "t1"}},
            {"resource": "courses.courseWorkMaterials", "method": "create", "body": {"title": "B", "topicId": "other-course-topic"}},
            {"resource": "courses.courseWork", "method": "create", "body": {"title": "C", "topicId": "t9", "workType": "ASSIGNMENT"}},
        ]
        cleaned, rejected = cd.validate_operations(ops, "c1", known_ids=KNOWN)
        self.assertEqual([c["body"]["title"] for c in cleaned], ["A"])
        self.assertEqual(len(rejected), 2)
        self.assertIn("other-course-topic", rejected[0]["reason"])
        self.assertIn("does not exist", rejected[0]["reason"])

    def test_patch_cannot_clear_or_blank_the_topic(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork", "method": "patch", "params": {"id": "w1"},
              "body": {"topicId": ""}},
             {"resource": "courses.courseWork", "method": "patch", "params": {"id": "w1"},
              "body": {"topicId": None}}], "c1", known_ids=KNOWN)
        self.assertEqual(cleaned, [])
        self.assertEqual(len(rejected), 2)

    def test_patch_that_does_not_touch_the_topic_is_accepted(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork", "method": "patch", "params": {"id": "w1"},
              "body": {"title": "Renamed"}}], "c1", known_ids=KNOWN)
        self.assertEqual(rejected, [])
        self.assertEqual(cleaned[0]["body"], {"title": "Renamed"})

    def test_apply_refuses_unknown_topic_and_writes_nothing(self):
        svc = FakeService(data=_course_data(topic_ids=("t1",)))
        results = cd.apply_operations(svc, [
            {"resource": "courses.courseWorkMaterials", "method": "create", "body": {"title": "A", "topicId": "t9"}},
            {"resource": "courses.courseWorkMaterials", "method": "create", "body": {"title": "B", "topicId": "t1"}},
        ], course_id="c1")
        self.assertFalse(results[0]["ok"])
        self.assertIn("does not exist", results[0]["error"])
        self.assertTrue(results[1]["ok"])
        creates = [c for c in svc.calls if c["method"] == "create"]
        self.assertEqual(len(creates), 1)
        self.assertEqual(creates[0]["body"]["topicId"], "t1")

    def test_apply_reads_topics_and_assignments_once_per_course(self):
        svc = FakeService(data=_course_data())
        cd.apply_operations(svc, [
            {"resource": "courses.courseWork", "method": "create", "body": {"title": "A", "topicId": "t1", "workType": "ASSIGNMENT"}},
            {"resource": "courses.courseWorkMaterials", "method": "create", "body": {"title": "B", "topicId": "t1"}},
            {"resource": "courses.courseWork.rubrics", "method": "create", "params": {"courseWorkId": "w1"},
             "body": {"criteria": []}},
        ], course_id="c1")
        listed = [c["resource"] for c in svc.calls if c["method"] == "list"]
        self.assertEqual(listed.count("courses.topics"), 1)
        self.assertEqual(listed.count("courses.courseWork"), 1)

    def test_apply_writes_nothing_when_the_course_cannot_be_read(self):
        svc = FakeService(fail={"courses.topics.list"})
        results = cd.apply_operations(svc, [
            {"resource": "courses.courseWork", "method": "create", "body": {"title": "A", "topicId": "t1", "workType": "ASSIGNMENT"}},
        ], course_id="c1")
        self.assertFalse(results[0]["ok"])
        self.assertFalse(any(c["method"] == "create" for c in svc.calls))

    def test_propose_step_checks_topics_against_classroom(self):
        svc = FakeService(data=_course_data(topic_ids=("t1",)))
        raw = {"summary": "s", "operations": [
            {"resource": "courses.courseWork", "method": "create",
             "body": {"title": "Quiz", "topicId": "t9", "workType": "ASSIGNMENT"}}]}
        with mock.patch.object(cd.ai_model_router, "get_gemini_client") as client:
            client.return_value.generate_json.return_value = raw
            result = cd.propose_step(svc, "c1", "assignments", "Add a quiz in week 9")
        self.assertEqual(result["operations"], [])
        self.assertIn("does not exist", result["rejected"][0]["reason"])


class AnnouncementTopicTests(unittest.TestCase):
    def test_topic_id_is_stripped_from_announcement_body_and_params(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.announcements", "method": "create",
              "params": {"topicId": "t1"}, "body": {"text": "Welcome", "topicId": "t1"}}],
            "c1", known_ids=KNOWN)
        self.assertEqual(rejected, [])
        self.assertNotIn("topicId", cleaned[0]["body"])
        self.assertNotIn("topicId", cleaned[0]["params"])

    def test_topic_id_never_reaches_classroom_on_an_announcement(self):
        svc = FakeService(data=_course_data())
        results = cd.apply_operations(svc, [
            {"resource": "courses.announcements", "method": "create",
             "body": {"text": "Welcome", "topicId": "t1"}, "publish": True},
            {"resource": "courses.announcements", "method": "patch", "params": {"id": "a1", "topicId": "t1"},
             "body": {"text": "Updated", "topicId": "t1"}},
        ], course_id="c1")
        self.assertTrue(all(r["ok"] for r in results))
        announcement_calls = [c for c in svc.calls if c["resource"] == "courses.announcements"
                              and c["method"] in ("create", "patch")]
        self.assertEqual(len(announcement_calls), 2)
        for call in announcement_calls:
            self.assertNotIn("topicId", call["params"])
            self.assertNotIn("topicId", call["body"])


class RubricRuleTests(unittest.TestCase):
    def test_rubric_create_needs_a_courseWorkId(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork.rubrics", "method": "create", "body": {"criteria": []}}],
            "c1", known_ids=KNOWN)
        self.assertEqual(cleaned, [])
        self.assertIn("courseWorkId", rejected[0]["reason"])

    def test_rubric_create_must_name_an_existing_assignment(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork.rubrics", "method": "create", "params": {"courseWorkId": "w9"},
              "body": {"criteria": []}},
             {"resource": "courses.courseWork.rubrics", "method": "create", "params": {"courseWorkId": "w1"},
              "body": {"criteria": []}}], "c1", known_ids=KNOWN)
        self.assertEqual([c["params"]["courseWorkId"] for c in cleaned], ["w1"])
        self.assertEqual(len(rejected), 1)
        self.assertIn("does not exist", rejected[0]["reason"])

    def test_rubric_patch_needs_rubric_id_and_courseWorkId(self):
        cleaned, rejected = cd.validate_operations(
            [{"resource": "courses.courseWork.rubrics", "method": "patch", "params": {"courseWorkId": "w1"},
              "body": {"criteria": []}},
             {"resource": "courses.courseWork.rubrics", "method": "patch", "params": {"id": "r1"},
              "body": {"criteria": []}},
             {"resource": "courses.courseWork.rubrics", "method": "patch",
              "params": {"id": "r1", "courseWorkId": "w1"}, "body": {"criteria": []}}],
            "c1", known_ids=KNOWN)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned[0]["params"], {"courseId": "c1", "courseWorkId": "w1", "id": "r1",
                                                "updateMask": "criteria"})
        self.assertEqual(len(rejected), 2)

    def test_rubric_fields_are_refused_on_every_other_resource(self):
        ops = [
            {"resource": "courses.courseWork", "method": "create",
             "body": {"title": "Essay", "topicId": "t1", "workType": "ASSIGNMENT", "criteria": []}},
            {"resource": "courses.courseWorkMaterials", "method": "create",
             "body": {"title": "Reading", "topicId": "t1", "sourceSpreadsheetId": "s1"}},
            {"resource": "courses.announcements", "method": "create", "body": {"text": "Hi", "criteria": []}},
        ]
        cleaned, rejected = cd.validate_operations(ops, "c1", known_ids=KNOWN)
        self.assertEqual(cleaned, [])
        self.assertEqual(len(rejected), 3)
        self.assertTrue(all("rubric" in r["reason"].lower() for r in rejected))

    def test_apply_refuses_rubric_for_unknown_assignment(self):
        svc = FakeService(data=_course_data())
        results = cd.apply_operations(svc, [
            {"resource": "courses.courseWork.rubrics", "method": "create", "params": {"courseWorkId": "w9"},
             "body": {"criteria": []}},
        ], course_id="c1")
        self.assertFalse(results[0]["ok"])
        self.assertFalse(any(c["resource"] == "courses.courseWork.rubrics" for c in svc.calls
                             if c["method"] == "create"))


class RubricSnapshotTests(unittest.TestCase):
    def _service(self, work_count):
        works = [{"id": f"w{i}", "title": f"Task {i}"} for i in range(work_count)]
        return FakeService(data={
            "courses.courseWork": {"courseWork": works},
            "courses.courseWork.rubrics": {"rubrics": lambda params: [
                {"id": f"r-{params['courseWorkId']}", "criteria": []}]},
        })

    def test_snapshot_reads_rubrics_for_each_assignment(self):
        from course_agent import read_course_snapshot
        svc = self._service(3)
        snap = read_course_snapshot(svc, "c1")
        self.assertEqual(set(snap["rubrics"]), {"w0", "w1", "w2"})
        self.assertEqual(snap["rubrics"]["w1"], [{"id": "r-w1", "criteria": []}])
        self.assertFalse(snap["rubricsCapped"])

    def test_snapshot_caps_rubric_reads_at_25_assignments(self):
        from course_agent import MAX_RUBRIC_ASSIGNMENTS, read_course_snapshot
        self.assertEqual(MAX_RUBRIC_ASSIGNMENTS, 25)
        svc = self._service(30)
        snap = read_course_snapshot(svc, "c1")
        self.assertEqual(len(snap["rubrics"]), 25)
        self.assertTrue(snap["rubricsCapped"])
        rubric_calls = [c for c in svc.calls if c["resource"] == "courses.courseWork.rubrics"]
        self.assertEqual(len(rubric_calls), 25)
        self.assertTrue(all(c["method"] == "list" for c in rubric_calls))

    def test_snapshot_reports_failed_rubric_reads_separately(self):
        from course_agent import read_course_snapshot

        def rubrics(params):
            if params["courseWorkId"] == "w1":
                raise RuntimeError("rubric read refused")
            return [{"id": f"r-{params['courseWorkId']}", "criteria": []}]

        svc = FakeService(data={
            "courses.courseWork": {"courseWork": [{"id": "w0"}, {"id": "w1"}]},
            "courses.courseWork.rubrics": {"rubrics": rubrics},
        })
        snap = read_course_snapshot(svc, "c1")
        self.assertEqual(set(snap["rubrics"]), {"w0"})
        self.assertEqual(snap["rubricErrors"], {"w1": "rubric read refused"})

    def test_link_notebook_needs_a_topic_of_this_course(self):
        import course_agent
        svc = FakeService()
        url = "https://notebooklm.google.com/notebook/abc"
        with self.assertRaises(course_agent.AgentError):
            course_agent.link_notebook(svc, "c1", url)
        self.assertEqual(svc.calls, [])
        course_agent.link_notebook(svc, "c1", url, topic_id="t1")
        create = [c for c in svc.calls if c["method"] == "create"][0]
        self.assertEqual(create["body"]["topicId"], "t1")


if __name__ == "__main__":
    unittest.main()
