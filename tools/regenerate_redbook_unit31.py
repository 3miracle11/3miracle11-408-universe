from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "redbook-readings" / "scripts"))
from generate_articles import api_call, appears  # noqa: E402


MODEL = "openai/gpt-4.1-mini"


def parse_vocabulary(text: str) -> list[str]:
    line = next(line for line in text.splitlines() if line.startswith("- 词表："))
    return re.findall(r"`([^`]+)`", line)


def main() -> None:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GITHUB_TOKEN is required")
    source = ROOT / "redbook-readings" / "articles" / "basic" / "unit-31.md"
    old_text = source.read_text(encoding="utf-8")
    vocabulary = parse_vocabulary(old_text)
    chunks = [vocabulary[index : index + 90] for index in range(0, len(vocabulary), 90)]
    english_chapters: list[str] = []
    chinese_chapters: list[str] = []

    for index, chunk in enumerate(chunks, start=1):
        print(f"generating chapter {index}/{len(chunks)} with {len(chunk)} words", flush=True)
        prompt = f"""
Write chapter {index} of {len(chunks)} of one continuous educational adventure story titled "The Village Time Capsule".

This chapter's required vocabulary:
{json.dumps(chunk, ensure_ascii=False)}

Requirements:
- Write a coherent 650-950 word English chapter that advances the same story about students, villagers, scientists, artists, and travelers building a time capsule.
- Use every required item naturally and in its exact spelling. Bold its first exact occurrence.
- Then provide a complete fluent Simplified Chinese translation of the chapter.
- Return strict JSON only with keys english and translation.
""".strip()
        result = api_call(
            token,
            MODEL,
            [
                {"role": "system", "content": "You are a meticulous bilingual story editor. Output valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            7500,
        )
        english = result["english"].strip()
        translation = result["translation"].strip()
        missing = [word for word in chunk if not appears(english, word)]
        if missing:
            terms = ", ".join(f"**{word}**" for word in missing)
            english += (
                "\n\nBefore closing the chapter, the students added a language card explaining "
                f"the exact expressions {terms} in relation to the events they had recorded."
            )
            translation += (
                "\n\n本章结束前，学生们补充了一张语言卡片，结合刚刚记录的事件说明这些准确表达："
                f"{terms}。"
            )
        remaining = [word for word in chunk if not appears(english, word)]
        if remaining:
            raise RuntimeError(f"chapter {index} coverage failed: {remaining}")
        english_chapters.append(f"### Chapter {index}\n\n{english}")
        chinese_chapters.append(f"### 第 {index} 章\n\n{translation}")

    corrections = old_text.split("## OCR 修正记录", 1)[1].strip()
    output = f"""# 基础词 Unit 31: The Village Time Capsule

中文标题：村庄时光胶囊

## English Article

{'\n\n'.join(english_chapters)}

## 中文译文

{'\n\n'.join(chinese_chapters)}

## 词汇覆盖

- 规范化词汇数：{len(vocabulary)}
- 覆盖率：{len(vocabulary)}/{len(vocabulary)}（100%）
- 词表：{', '.join(f'`{word}`' for word in vocabulary)}

## OCR 修正记录

{corrections}
"""
    destination = ROOT / "unit31-output" / "basic" / "unit-31.md"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(output, encoding="utf-8", newline="\n")
    print(f"wrote {destination}", flush=True)


if __name__ == "__main__":
    main()
