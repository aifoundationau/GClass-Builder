"""
Google Classroom API v1 access layer.

Every method in the official Classroom v1 list is either allowed here or
explicitly blocked as a delete. Deletes are never callable from this app:
check_call() refuses them, and BLOCKED_DELETES documents which resources
have a delete method so the UI can point teachers to the Classroom dashboard.

Discovery reference: classroom.v1 revision 20260825.
"""

import keyword
from typing import Any, Dict, List, Optional

# Non-delete methods per resource, grouped as in the official method list.
# Anything not listed is refused. No resource allows "delete".
ALLOWED_METHODS: Dict[str, frozenset] = {
    "courses": frozenset({"checkAddOnCreationEligibility", "checkGradingPeriodsSetupEligibility",
                          "create", "get", "getGradingPeriodSettings", "list", "patch", "update",
                          "updateGradingPeriodSettings"}),
    "courses.aliases": frozenset({"create", "list"}),
    "courses.announcements": frozenset({"create", "get", "getAddOnContext", "list",
                                        "modifyAssignees", "patch"}),
    "courses.announcements.addOnAttachments": frozenset({"create", "get", "list", "patch"}),
    "courses.courseWork": frozenset({"create", "get", "getAddOnContext", "list",
                                     "modifyAssignees", "patch", "updateRubric"}),
    "courses.courseWork.addOnAttachments": frozenset({"create", "get", "list", "patch"}),
    "courses.courseWork.addOnAttachments.studentSubmissions": frozenset({"get", "patch"}),
    "courses.courseWork.rubrics": frozenset({"create", "get", "list", "patch"}),
    "courses.courseWork.studentSubmissions": frozenset({"get", "list", "modifyAttachments",
                                                        "patch", "reclaim", "return", "turnIn"}),
    "courses.courseWorkMaterials": frozenset({"create", "get", "getAddOnContext", "list", "patch"}),
    "courses.courseWorkMaterials.addOnAttachments": frozenset({"create", "get", "list", "patch"}),
    "courses.posts": frozenset({"getAddOnContext"}),
    "courses.posts.addOnAttachments": frozenset({"create", "get", "list", "patch"}),
    "courses.posts.addOnAttachments.studentSubmissions": frozenset({"get", "patch"}),
    "courses.studentGroups": frozenset({"create", "list", "patch"}),
    "courses.studentGroups.studentGroupMembers": frozenset({"create", "list"}),
    "courses.students": frozenset({"create", "get", "list"}),
    "courses.teachers": frozenset({"create", "get", "list"}),
    "courses.topics": frozenset({"create", "get", "list", "patch"}),
    "invitations": frozenset({"accept", "create", "get", "list"}),
    "registrations": frozenset({"create"}),
    "userProfiles": frozenset({"checkUserCapability", "get"}),
    "userProfiles.guardianInvitations": frozenset({"create", "get", "list", "patch"}),
    "userProfiles.guardians": frozenset({"get", "list"}),
}

# Resources that have a delete method. Delete is never callable. Each value
# contains only "delete".
BLOCKED_DELETES: Dict[str, frozenset] = {
    "courses": frozenset({"delete"}),
    "courses.aliases": frozenset({"delete"}),
    "courses.announcements": frozenset({"delete"}),
    "courses.announcements.addOnAttachments": frozenset({"delete"}),
    "courses.courseWork": frozenset({"delete"}),
    "courses.courseWork.addOnAttachments": frozenset({"delete"}),
    "courses.courseWork.rubrics": frozenset({"delete"}),
    "courses.courseWorkMaterials": frozenset({"delete"}),
    "courses.courseWorkMaterials.addOnAttachments": frozenset({"delete"}),
    "courses.posts.addOnAttachments": frozenset({"delete"}),
    "courses.studentGroups": frozenset({"delete"}),
    "courses.studentGroups.studentGroupMembers": frozenset({"delete"}),
    "courses.students": frozenset({"delete"}),
    "courses.teachers": frozenset({"delete"}),
    "courses.topics": frozenset({"delete"}),
    "invitations": frozenset({"delete"}),
    "registrations": frozenset({"delete"}),
    "userProfiles.guardians": frozenset({"delete"}),
}

# Resources whose names contain "addOnAttachments". These need a registered
# Classroom add-on.
ADDON_RESOURCES = frozenset({
    "courses.announcements.addOnAttachments",
    "courses.courseWork.addOnAttachments",
    "courses.courseWork.addOnAttachments.studentSubmissions",
    "courses.courseWorkMaterials.addOnAttachments",
    "courses.posts.addOnAttachments",
    "courses.posts.addOnAttachments.studentSubmissions",
})

# Methods that change data. The AI editor may only propose these.
EDIT_METHODS = frozenset({"accept", "create", "patch", "update", "modifyAssignees",
                          "updateRubric", "modifyAttachments", "reclaim", "return", "turnIn",
                          "updateGradingPeriodSettings"})

# OAuth scopes needed by the resources above, including the add-on scopes.
CLASSROOM_SCOPES: List[str] = [
    "https://www.googleapis.com/auth/classroom.courses",
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.topics",
    "https://www.googleapis.com/auth/classroom.topics.readonly",
    "https://www.googleapis.com/auth/classroom.announcements",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
    "https://www.googleapis.com/auth/classroom.courseworkmaterials",
    "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.students.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
    "https://www.googleapis.com/auth/classroom.rosters",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "https://www.googleapis.com/auth/classroom.guardianlinks.students",
    "https://www.googleapis.com/auth/classroom.guardianlinks.students.readonly",
    "https://www.googleapis.com/auth/classroom.guardianlinks.me.readonly",
    "https://www.googleapis.com/auth/classroom.profile.emails",
    "https://www.googleapis.com/auth/classroom.profile.photos",
    # Not requested: push-notifications (registrations), and the add-on scopes.
    # Google only grants these to apps with the matching feature set up, so asking
    # for them makes sign-in fail and breaks token refresh (invalid_scope).
]


class ClassroomCallError(Exception):
    """Raised when a call is refused by the allowlist or the API rejects it."""


def _split_resource(resource: str) -> str:
    if resource not in ALLOWED_METHODS and resource not in BLOCKED_DELETES:
        raise ClassroomCallError(f"Resource '{resource}' is not part of the Classroom API surface.")
    return resource


def check_call(resource: str, method: str) -> None:
    """Raise ClassroomCallError if the call is not allowed. Delete is always refused."""
    _split_resource(resource)
    if method == "delete" or method in BLOCKED_DELETES.get(resource, frozenset()):
        raise ClassroomCallError(
            f"'{resource}.{method}' is not allowed. Deletions must be made by staff in the "
            "Google Classroom dashboard (https://classroom.google.com)."
        )
    if method not in ALLOWED_METHODS.get(resource, frozenset()):
        raise ClassroomCallError(f"'{resource}.{method}' is not allowed.")


def _attr(name: str) -> str:
    # googleapiclient appends "_" to reserved words, e.g. "return" -> "return_".
    return name + "_" if keyword.iskeyword(name) else name


def call(service: Any, resource: str, method: str,
         params: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None) -> Any:
    """
    Invoke one allowed Classroom method and return the decoded response.

    resource: dotted path such as "courses.courseWork"
    method:   e.g. "list", "get", "create", "patch"
    params:   path and query parameters, e.g. {"courseId": "123", "pageSize": 50}
    body:     request body for create/patch/update calls
    """
    check_call(resource, method)
    target = service
    for part in resource.split("."):
        target = getattr(target, _attr(part))()
    request_args = dict(params or {})
    if body is not None:
        request_args["body"] = body
    return getattr(target, _attr(method))(**request_args).execute()


def list_all(service: Any, resource: str, list_key: str,
             params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Call a list method and follow nextPageToken until all pages are read."""
    items: List[Dict[str, Any]] = []
    args = dict(params or {})
    while True:
        page = call(service, resource, "list", args)
        items.extend(page.get(list_key, []))
        token = page.get("nextPageToken")
        if not token:
            return items
        args["pageToken"] = token


def describe_surface() -> List[Dict[str, Any]]:
    """Return every allowed or blocked resource with its methods, for the API explorer."""
    resources = sorted(set(ALLOWED_METHODS) | set(BLOCKED_DELETES))
    surface = []
    for resource in resources:
        methods = ALLOWED_METHODS.get(resource, frozenset())
        surface.append({
            "resource": resource,
            "methods": sorted(methods),
            "editing_methods": sorted(methods & EDIT_METHODS),
            "addon": resource in ADDON_RESOURCES,
            "delete_blocked": "delete" in BLOCKED_DELETES.get(resource, frozenset()),
        })
    return surface
