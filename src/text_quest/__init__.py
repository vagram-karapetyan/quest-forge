"""Text Quest — платформа для создания и прохождения текстовых квестов."""

import os


def main() -> None:
    import uvicorn

    uvicorn.run(
        "text_quest.app:app",
        host=os.environ.get("TEXT_QUEST_HOST", "127.0.0.1"),
        port=int(os.environ.get("TEXT_QUEST_PORT", "8000")),
        reload=os.environ.get("TEXT_QUEST_RELOAD") == "1",
    )
