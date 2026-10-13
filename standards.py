"""
Course design standards the AI agent can apply.

Each standard is guidance written into the agent's prompt. Applying one does not
certify a course against it. Certification comes from the issuing body.
"""

from typing import Dict, List

STANDARDS: Dict[str, Dict[str, str]] = {
    "blooms_taxonomy": {
        "name": "Bloom's Taxonomy (revised)",
        "guidance": (
            "Write each unit's learning outcomes with a measurable verb from the revised Bloom's "
            "levels: remember, understand, apply, analyse, evaluate, create. Spread assessments "
            "across at least three levels and say which level each assessment targets."
        ),
    },
    "iso_21001_2018": {
        "name": "ISO 21001:2018 (Educational organizations management systems)",
        "guidance": (
            "State the intended learner outcomes and who the course serves. Record how each "
            "assessment checks those outcomes. Include a feedback step after every assessment, "
            "and make sure every learner has equal access to the materials."
        ),
    },
    "wcag_2_2_aa": {
        "name": "WCAG 2.2 AA (Web accessibility)",
        "guidance": (
            "Give every image and slide a text alternative. Use descriptive link text. Avoid "
            "relying on colour alone. Write short sentences, put headings in order, and give "
            "video or audio content a transcript or captions."
        ),
    },
    "udl": {
        "name": "Universal Design for Learning (UDL 3.0)",
        "guidance": (
            "Offer more than one way to engage, represent, and show learning. Each unit should "
            "give at least one alternative format and one assessment option for learners with "
            "different needs."
        ),
    },
    "addie": {
        "name": "ADDIE instructional design",
        "guidance": (
            "Structure the course as Analysis (audience and need), Design (outcomes and "
            "assessments), Development (materials), Implementation (schedule), and Evaluation "
            "(feedback questions). Put the Evaluation items in the final unit."
        ),
    },
}


def list_standards() -> List[Dict[str, str]]:
    return [{"key": k, "name": v["name"]} for k, v in STANDARDS.items()]


def guidance_for(keys: List[str]) -> str:
    """Build the prompt text for the selected standards. Unknown keys are ignored."""
    chosen = [STANDARDS[k] for k in keys if k in STANDARDS]
    if not chosen:
        return ""
    lines = ["Apply these course design standards. This is guidance, not certification:"]
    lines += [f"- {s['name']}: {s['guidance']}" for s in chosen]
    return "\n".join(lines)
