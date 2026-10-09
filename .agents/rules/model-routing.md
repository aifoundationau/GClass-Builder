# Standard AI Model Routing & Dynamic Selection Rule

## Scope & Purpose
This rule governs all AI model invocations, agent orchestration, and LLM integrations across the `google-course-builder` project.

To balance reasoning depth, latency, and cost efficiency, **all API calls must use dynamic model routing**. Hardcoding specific model strings or making ad-hoc SDK invocations without routing is strictly prohibited.

---

## Model Selection Matrix

Every AI task must be classified into one of the following canonical tiers:

| Task Tier / Category | Target Model | Primary Responsibilities in Google Course Builder |
| :--- | :--- | :--- |
| **Extensive, Multi-Step Analytical Reasoning** (`TaskCategory.ANALYTICAL_REASONING`) | `gemini-3.1-pro` | Deep curriculum architecture, multi-week pedagogical structuring, syllabus dependency graph generation, rubric scoring rationale, complex course analysis. |
| **Conversational Logic, MCP Tools & Orchestration (Default)** (`TaskCategory.CONVERSATIONAL_ORCHESTRATION` / `DEFAULT`) | `gemini-3.8-flash` | Interactive course creation dialogue, Google Classroom MCP tool execution, real-time teacher/student streaming assistance, multi-turn state management. |
| **High-Volume Text Processing & Initial Routing** (`TaskCategory.HIGH_VOLUME_PROCESSING`) | `gemini-3.5-flash-lite` | Bulk syllabus spreadsheet row extraction, course outline classification, schema mapping, prompt preprocessing, high-frequency token sanitization. |

> [!IMPORTANT]
> **Deprecated Models**: Legacy models (`gemini-2.5-*`, `gemini-2.0-*`, `gemini-1.5-*`, etc.) are prohibited. Only the current Gemini 3 model family (`gemini-3.1-pro`, `gemini-3.8-flash`, and `gemini-3.5-flash-lite`) may be utilized.

---

## Architectural Principles

1. **Single Entry Point**: All model calls must pass through the project's centralized router service (`ai_model_router.py`) or its exported factory `get_model_router()`.
2. **Resilient Fallback**: If a specialized model (`gemini-3.1-pro` or `gemini-3.5-flash-lite`) encounters quota exhaustion (HTTP 429 / `RESOURCE_EXHAUSTED`) or transient infrastructure downtime (503), the router must automatically degrade gracefully to the default workhorse model (`gemini-3.8-flash`).
3. **Explicit Overrides**: Development tests, administrative consoles, and explicit user flags may override the model using `model_override="<model_id>"`, but runtime code must default to task category routing.
4. **Streaming First for Interactive Experiences**: Live teacher/student conversational endpoints must leverage `stream=True` using `client.interactions.create` to ensure low time-to-first-token (TTFT).

---

## Canonical Python Implementation Pattern

All backend modules (including [api_server.py](file:///d:/Agy/google-course-builder/api_server.py) and [classroom_course_engine.py](file:///d:/Agy/google-course-builder/classroom_course_engine.py)) must adhere to the following implementation standard.

### 1. Router Service & Factory ([ai_model_router.py](file:///d:/Agy/google-course-builder/ai_model_router.py))

```python
from enum import Enum
from typing import Optional, Any, Union
from google import genai
from ai_model_router import get_model_router, TaskCategory

# Obtain standard singleton router
router = get_model_router()
```

### 2. Analytical Reasoning (Curriculum Planning)
```python
# Route to gemini-3.1-pro for complex pedagogical structuring
syllabus_interaction = router.execute_interaction(
    task_category=TaskCategory.ANALYTICAL_REASONING,
    user_input=(
        "Design a 10-week Computer Science curriculum for high school students. "
        "Include unit objectives, prerequisite dependencies, and project milestones."
    ),
    system_instruction="You are an expert instructional designer and curriculum architect."
)
print(syllabus_interaction.output_text)
```

### 3. Orchestration & Conversational MCP Tools (Default)
```python
# Route to gemini-3.8-flash with MCP tools and live streaming
response_stream = router.execute_interaction(
    task_category=TaskCategory.CONVERSATIONAL_ORCHESTRATION,
    user_input="Create a new course 'Advanced Biology' and publish the week 1 assignments.",
    stream=True,
    tools=[google_classroom_mcp_tool]  # Function declarations / MCP tools
)

for event in response_stream:
    if event.event_type == "step.delta" and event.delta.type == "text":
        yield event.delta.text
```

### 4. High-Volume Batch Parsing (Spreadsheets & Outlines)
```python
# Route to gemini-3.5-flash-lite for fast, cost-effective extraction
parsed_row = router.execute_interaction(
    task_category=TaskCategory.HIGH_VOLUME_PROCESSING,
    user_input=f"Extract course title, section, and due dates from this spreadsheet row: {row_text}",
    temperature=0.1
)
```

---

## Error Handling & Fallback Behavior

When invoking Gemini API via `ModelRouter.execute_interaction()`:
1. The router attempts execution with the target model determined by `task_category`.
2. If an exception matches quota depletion (e.g. `429`, `resource_exhausted`) or temporary service unavailability (`503`), the router logs a structured warning and re-attempts the request using `gemini-3.8-flash`.
3. If the fallback attempt also fails, or if fallback is explicitly disabled, the error is raised to the calling application layer.

---

## Verification & Compliance Checklist

Before committing any AI integration code, verify:
- [ ] No raw model strings (`"gemini-..."`) are hardcoded in application business logic.
- [ ] `TaskCategory` is explicitly supplied (e.g., `TaskCategory.ANALYTICAL_REASONING`).
- [ ] Dependencies include `google-genai>=2.25.0` in `requirements.txt`.
- [ ] Streaming interactions (`stream=True`) properly handle event deltas for UI responsiveness.
- [ ] Environment variable `GEMINI_API_KEY` is documented in `.env.example`.
