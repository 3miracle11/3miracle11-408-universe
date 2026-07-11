from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path


API_URL = "https://models.github.ai/inference/chat/completions"
DEFAULT_MODEL = "openai/gpt-4.1-mini"


def api_call(token: str, model: str, messages: list[dict[str, str]], max_tokens: int) -> dict:
    payload = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=payload,
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2026-03-10",
        },
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                body = json.loads(response.read().decode("utf-8"))
                content = body["choices"][0]["message"]["content"].strip()
                if content.startswith("```"):
                    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.S)
                return json.loads(content)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == 5:
                raise RuntimeError(f"GitHub Models request failed: {exc}") from exc
            time.sleep(min(10 * (attempt + 1), 50))
    raise AssertionError("unreachable")


def appears(text: str, word: str) -> bool:
    normalized = re.sub(r"\s+", " ", text.casefold())
    target = word.casefold().strip()
    if re.fullmatch(r"[a-z]+(?:[-'][a-z]+)*", target):
        return re.search(rf"(?<![a-z]){re.escape(target)}(?![a-z])", normalized) is not None
    return target in normalized


def prompt_for(unit: dict) -> str:
    section_zh = "必考词" if unit["section"] == "required" else "基础词"
    words = json.dumps(unit["words"], ensure_ascii=False)
    long_unit = unit["section"] == "basic" and unit["unit"] == 31
    length = "3500-6500" if long_unit else "650-1100"
    return f"""
Create one original bilingual English-learning article for 红宝书 {section_zh} Unit {unit['unit']}.

Raw OCR vocabulary list:
{words}

Requirements:
1. First normalize the vocabulary. Correct only obvious OCR mistakes (for example a non-word one-letter substitution), expand forms such as favo(u)r into favor and favour, and remove OCR fragments that are clearly phonetic symbols or labels. Do not drop rare but valid English words. Record every change.
2. Write one coherent news feature or narrative story of about {length} English words. Unit 31 may use titled sections but must remain one article.
3. Use every item in normalized_vocabulary naturally in the English article. Include each target in its exact normalized spelling at least once. Bold each first occurrence with Markdown **word**.
4. Follow with a complete, fluent Simplified Chinese translation. Do not shorten or summarize it.
5. Do not reproduce dictionary definitions or sentences from the source book.
6. Return strict JSON only with keys: title_en, title_zh, english, translation, normalized_vocabulary, corrections. corrections is an array of objects with raw, normalized, reason. English and translation are Markdown strings.
""".strip()


def repair_prompt(result: dict, missing: list[str]) -> str:
    return f"""
Revise the following JSON article so every missing vocabulary item appears naturally and in exact spelling in the English article. Preserve the full Chinese translation and update it to match the revised English. Keep all existing vocabulary. Return the same strict JSON schema only.

Missing vocabulary:
{json.dumps(missing, ensure_ascii=False)}

Current JSON:
{json.dumps(result, ensure_ascii=False)}
""".strip()


def validate_result(result: dict, raw_count: int) -> list[str]:
    required = {
        "title_en", "title_zh", "english", "translation",
        "normalized_vocabulary", "corrections",
    }
    absent_keys = sorted(required - set(result))
    if absent_keys:
        raise ValueError(f"Missing JSON keys: {absent_keys}")
    vocab = result["normalized_vocabulary"]
    if not isinstance(vocab, list) or len(vocab) < max(1, int(raw_count * 0.88)):
        raise ValueError(f"Vocabulary normalization dropped too many items: {len(vocab)}/{raw_count}")
    return [word for word in vocab if not appears(result["english"], word)]


def render_markdown(unit: dict, result: dict) -> str:
    section_zh = "必考词" if unit["section"] == "required" else "基础词"
    vocab = result["normalized_vocabulary"]
    corrections = result["corrections"]
    correction_lines = (
        "\n".join(
            f"- `{item.get('raw', '')}` -> `{item.get('normalized', '')}`：{item.get('reason', '')}"
            for item in corrections
        )
        if corrections
        else "- 无"
    )
    return f"""# {section_zh} Unit {unit['unit']:02d}: {result['title_en']}

中文标题：{result['title_zh']}

## English Article

{result['english'].strip()}

## 中文译文

{result['translation'].strip()}

## 词汇覆盖

- 规范化词汇数：{len(vocab)}
- 覆盖率：{len(vocab)}/{len(vocab)}（100%）
- 词表：{', '.join(f'`{word}`' for word in vocab)}

## OCR 修正记录

{correction_lines}
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--start", type=int, default=1, help="1-based global unit index")
    parser.add_argument("--end", type=int, default=57, help="inclusive global unit index")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GITHUB_TOKEN is required")
    units = json.loads(args.source.read_text(encoding="utf-8"))
    selected = units[args.start - 1 : args.end]
    for global_index, unit in enumerate(selected, start=args.start):
        destination = args.output / unit["section"] / f"unit-{unit['unit']:02d}.md"
        destination.parent.mkdir(parents=True, exist_ok=True)
        print(f"[{global_index}/57] generating {unit['section']} unit {unit['unit']:02d}", flush=True)
        result = api_call(
            token,
            args.model,
            [
                {"role": "system", "content": "You are a meticulous bilingual English-learning editor. Output valid JSON only."},
                {"role": "user", "content": prompt_for(unit)},
            ],
            30000 if global_index == 57 else 7000,
        )
        missing = validate_result(result, len(unit["words"]))
        for repair in range(4):
            if not missing:
                break
            print(f"  repairing {len(missing)} missing words", flush=True)
            previous = result
            repaired = api_call(
                token,
                args.model,
                [
                    {"role": "system", "content": "You are a meticulous bilingual editor. Output valid JSON only."},
                    {"role": "user", "content": repair_prompt(result, missing)},
                ],
                30000 if global_index == 57 else 8000,
            )
            # A repair response occasionally omits metadata that did not
            # change. Preserve those fields from the last complete result.
            for key in (
                "title_en", "title_zh", "english", "translation",
                "normalized_vocabulary", "corrections",
            ):
                if key not in repaired:
                    repaired[key] = previous[key]
            result = repaired
            missing = validate_result(result, len(unit["words"]))
        if missing:
            raise RuntimeError(f"Coverage failed for unit {global_index}: {missing}")
        destination.write_text(render_markdown(unit, result), encoding="utf-8", newline="\n")
        print(f"  wrote {destination}", flush=True)


if __name__ == "__main__":
    main()
