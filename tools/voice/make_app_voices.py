#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
앱 음성 54개를 한 번에 만들어 넣기

  내 목소리 wav 하나로 자모 24 + 안내 6 + 캐릭터 이름(stickers.json 개수) 을 모두 합성해
  assets/audio/<키>.wav 로 저장합니다. 앱은 그 파일을 바로 씁니다.

  python make_app_voices.py --list                       # 만들 문구 확인만
  python make_app_voices.py --ref reference/my-voice.wav
  python make_app_voices.py --ref ... --only jamo --force

레퍼런스 목소리는 **본인이 녹음했거나 사용 허락을 받은 목소리**여야 합니다.
다른 사람 목소리를 복제해 그 사람이 하지 않은 말을 만드는 것은 사칭입니다.

문구 목록은 앱 소스에서 그대로 읽어 옵니다
  src/jamo.js               자모 24자 이름
  src/lines.js              안내 음성 6개
  assets/stickers/stickers.json  캐릭터 이름 24개
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL_XTTS = "tts_models/multilingual/multi-dataset/xtts_v2"

# 표기와 소리가 다른 자모 (src/lines.js 의 PRON 과 같은 값)
PRON = {"s": "시옫", "j": "지읃", "ch": "치읃", "k": "키윽",
        "t": "티읃", "p": "피읍", "h": "히읃"}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def collect_lines(root: Path) -> list[dict]:
    items: list[dict] = []

    jamo_js = root / "src" / "jamo.js"
    for m in re.finditer(r"id:\s*'([^']+)'.*?name:\s*'([^']+)'", read(jamo_js)):
        jid, name = m.group(1), m.group(2)
        items.append({
            "key": f"jamo-{jid}",
            "text": name,
            "say": PRON.get(jid, name),     # 합성할 때는 소리 나는 대로
            "group": "jamo",
        })

    lines_js = root / "src" / "lines.js"
    block = re.search(r"export const UI_LINES = \{(.*?)\n\};", read(lines_js), re.S)
    if block:
        for m in re.finditer(r"'([a-z0-9-]+)':\s*\{\s*text:\s*'([^']*)'", block.group(1)):
            items.append({"key": m.group(1), "text": m.group(2),
                          "say": m.group(2), "group": "ui"})

    stickers = root / "assets" / "stickers" / "stickers.json"
    if stickers.exists():
        for s in json.loads(read(stickers)):
            key = Path(s.get("voice", "")).stem or f"sticker-{s['id']:02d}"
            label = f"{s.get('trait', '')} {s['name']}".strip()
            items.append({"key": key, "text": label, "say": label, "group": "sticker"})

    return items


def main() -> None:
    p = argparse.ArgumentParser(description="앱이 쓰는 음성 파일을 내 목소리로 한 번에 만들기")
    p.add_argument("--ref", default="reference/my-voice.wav", help="레퍼런스 목소리 wav")
    p.add_argument("--out", type=Path, default=ROOT / "assets" / "audio", help="저장 폴더")
    p.add_argument("--lang", default="ko")
    p.add_argument("--only", choices=["jamo", "ui", "sticker"], help="이 묶음만 만들기")
    p.add_argument("--force", action="store_true", help="이미 있는 파일도 다시 만들기")
    p.add_argument("--list", action="store_true", help="만들 문구만 보여주고 끝내기")
    p.add_argument("--lines", type=Path, help="문구 목록 json 을 직접 줄 때")
    args = p.parse_args()

    items = json.loads(read(args.lines)) if args.lines else collect_lines(ROOT)
    if args.only:
        items = [i for i in items if i["group"] == args.only]
    if not items:
        sys.exit("문구를 찾지 못했습니다. 앱 폴더 안에서 실행했는지 확인하세요.")

    if args.list:
        print(f"문구 {len(items)}개")
        group_name = {"jamo": "자모 이름", "ui": "안내 음성", "sticker": "캐릭터 이름"}
        last = None
        for i, it in enumerate(items, 1):
            if it["group"] != last:
                last = it["group"]
                print(f"\n── {group_name.get(last, last)} ──")
            extra = f"  (소리: {it['say']})" if it["say"] != it["text"] else ""
            exists = " ← 이미 있음" if (args.out / f"{it['key']}.wav").exists() else ""
            print(f"  {i:2d}. {it['key']:<14} {it['text']}{extra}{exists}")
        return

    ref = Path(args.ref)
    if not ref.exists():
        sys.exit(
            f"레퍼런스 목소리가 없습니다: {ref}\n"
            "본인 목소리를 30~60초 녹음한 뒤 다듬어 그 자리에 두세요.\n"
            "  python clean_audio.py 내녹음.m4a -o reference/my-voice.wav"
        )

    try:
        from TTS.api import TTS
        import torch
    except ImportError:
        sys.exit("pip install TTS 가 필요합니다. (목록만 보려면 --list)")

    gpu = torch.cuda.is_available()
    print(f"XTTS-v2 를 불러옵니다… ({'GPU' if gpu else 'CPU'})")
    tts = TTS(MODEL_XTTS).to("cuda" if gpu else "cpu")

    args.out.mkdir(parents=True, exist_ok=True)
    made = skipped = failed = 0
    for i, it in enumerate(items, 1):
        path = args.out / f"{it['key']}.wav"
        if path.exists() and not args.force:
            skipped += 1
            continue
        print(f"  [{i:2d}/{len(items)}] {it['text']}", flush=True)
        try:
            tts.tts_to_file(text=it["say"], speaker_wav=str(ref),
                            language=args.lang, file_path=str(path))
            made += 1
        except Exception as e:
            print(f"      실패: {e}")
            failed += 1

    print(f"\n만든 파일 {made}개 · 건너뜀 {skipped}개 · 실패 {failed}개")
    print(f"저장 위치: {args.out}")
    print("\n앱을 새로 고치면 바로 이 목소리로 읽습니다.")
    print("부모 메뉴 → 성우 녹음 맨 위에서 «사람 목소리 n개»로 확인하세요.")
    print("만든 소리가 어색하면 레퍼런스를 더 또렷한 구간으로 바꿔 다시 만들어 보세요.")


if __name__ == "__main__":
    main()
