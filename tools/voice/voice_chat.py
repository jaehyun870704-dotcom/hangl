#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
목소리 복제 대화 CLI — 내 목소리로 답하는 콘솔 챗봇

  입력 → LLM(한국어 답변 생성) → XTTS-v2 로 내 목소리 합성 → 바로 재생

  python voice_chat.py --check                      # 준비 상태 점검
  python voice_chat.py --ref reference/my-voice.wav
  python voice_chat.py --ref reference/my-voice.wav --backend openai --model gpt-4o-mini

레퍼런스 목소리는 **본인이 직접 녹음했거나 사용 허락을 받은 목소리**여야 합니다.
다른 사람의 목소리를 복제해 그 사람이 하지 않은 말을 만들어 내는 것은
사칭이 되고, 대부분의 나라에서 인격권·초상권 문제가 됩니다.
clean_audio.py 로 다듬은 30~60초짜리 wav 하나면 충분합니다.

필요한 것
  pip install TTS sounddevice soundfile
  (LLM) OpenAI 를 쓰면 환경변수 OPENAI_API_KEY, Ollama 를 쓰면 로컬 ollama 실행
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

MODEL_XTTS = "tts_models/multilingual/multi-dataset/xtts_v2"
SYSTEM_PROMPT = (
    "너는 한국어로 대화하는 다정한 말동무야. "
    "소리 내어 읽을 답변이니 짧고 자연스러운 입말로, 2~3문장 안에 답해. "
    "이모지, 마크다운, 괄호 설명, 목록은 쓰지 마. 숫자는 한국어로 읽어 쓰듯 적어."
)


# ───────────────────────── LLM ─────────────────────────
def ask_ollama(messages, model, host):
    body = json.dumps({"model": model, "messages": messages, "stream": False}).encode()
    req = urllib.request.Request(
        f"{host}/api/chat", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())["message"]["content"].strip()


def ask_openai(messages, model):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("환경변수 OPENAI_API_KEY 가 없습니다.")
    body = json.dumps({"model": model, "messages": messages, "temperature": 0.7}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"].strip()


def llm_reply(messages, args):
    if args.backend == "ollama":
        return ask_ollama(messages, args.model, args.ollama_host)
    return ask_openai(messages, args.model)


# ───────────────────────── 재생 ─────────────────────────
def make_player():
    """sounddevice → pygame → ffplay 순으로 쓸 수 있는 것을 고른다"""
    try:
        import sounddevice as sd
        import soundfile as sf

        def play(path):
            data, rate = sf.read(str(path), dtype="float32")
            sd.play(data, rate)
            sd.wait()

        return play, "sounddevice"
    except Exception:
        pass
    try:
        import pygame

        pygame.mixer.init()

        def play(path):
            pygame.mixer.music.load(str(path))
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                pygame.time.wait(80)

        return play, "pygame"
    except Exception:
        pass
    if shutil.which("ffplay"):
        def play(path):
            subprocess.run(["ffplay", "-v", "quiet", "-nodisp", "-autoexit", str(path)])

        return play, "ffplay"
    return None, None


# ───────────────────────── 점검 ─────────────────────────
def check(args) -> int:
    print("준비 상태 점검")
    print("─" * 44)
    ok = True

    try:
        import torch  # noqa: F401
        import torch as _t
        gpu = _t.cuda.is_available()
        print(f"  torch          : 있음 ({'GPU 사용 가능' if gpu else 'CPU만 — 문장당 수 초 걸립니다'})")
    except Exception:
        print("  torch          : 없음   → pip install torch")
        ok = False

    try:
        from TTS.api import TTS  # noqa: F401
        print("  TTS (Coqui)    : 있음")
    except Exception:
        print("  TTS (Coqui)    : 없음   → pip install TTS")
        ok = False

    play, name = make_player()
    print(f"  재생 방법      : {name if play else '없음   → pip install sounddevice soundfile'}")
    ok = ok and bool(play)

    ref = Path(args.ref)
    if ref.exists():
        size = ref.stat().st_size / 1024
        print(f"  레퍼런스 목소리: {ref} ({size:.0f}KB)")
    else:
        print(f"  레퍼런스 목소리: 없음   → {ref} 자리에 본인 목소리 wav 를 두세요")
        print("                   (clean_audio.py 로 30~60초 다듬어 만들면 됩니다)")
        ok = False

    if args.backend == "ollama":
        try:
            with urllib.request.urlopen(f"{args.ollama_host}/api/tags", timeout=4) as r:
                names = [m["name"] for m in json.loads(r.read()).get("models", [])]
            print(f"  Ollama         : 켜져 있음 · 모델 {', '.join(names) if names else '없음'}")
            if args.model not in names:
                print(f"                   → ollama pull {args.model}")
                ok = False
        except Exception:
            print(f"  Ollama         : 연결 안 됨 ({args.ollama_host}) → ollama serve 실행")
            ok = False
    else:
        print(f"  OPENAI_API_KEY : {'있음' if os.environ.get('OPENAI_API_KEY') else '없음'}")
        ok = ok and bool(os.environ.get("OPENAI_API_KEY"))

    print("─" * 44)
    print("모두 준비됐습니다. 그냥 실행하면 됩니다." if ok else "위의 → 표시된 항목을 채운 뒤 다시 실행하세요.")
    return 0 if ok else 1


# ───────────────────────── 본체 ─────────────────────────
def main() -> None:
    p = argparse.ArgumentParser(description="내 목소리로 답하는 한국어 콘솔 챗봇")
    p.add_argument("--ref", default="reference/my-voice.wav",
                   help="레퍼런스 목소리 wav (본인 것이거나 허락받은 것)")
    p.add_argument("--backend", choices=["ollama", "openai"], default="ollama")
    p.add_argument("--model", default=None, help="LLM 모델 (기본: ollama=gemma3, openai=gpt-4o-mini)")
    p.add_argument("--ollama-host", default="http://localhost:11434")
    p.add_argument("--lang", default="ko")
    p.add_argument("--out-dir", type=Path, default=Path("out"), help="만든 음성을 남길 폴더")
    p.add_argument("--keep", action="store_true", help="만든 wav 를 지우지 않고 모아 둠")
    p.add_argument("--no-audio", action="store_true", help="글자만 주고받고 소리는 만들지 않음")
    p.add_argument("--check", action="store_true", help="준비 상태만 점검하고 끝냄")
    args = p.parse_args()
    if args.model is None:
        args.model = "gemma3" if args.backend == "ollama" else "gpt-4o-mini"

    if args.check:
        sys.exit(check(args))

    ref = Path(args.ref)
    if not ref.exists():
        sys.exit(
            f"레퍼런스 목소리가 없습니다: {ref}\n"
            "본인 목소리를 30~60초 녹음해 clean_audio.py 로 다듬은 뒤 그 자리에 두세요.\n"
            "  python clean_audio.py 내녹음.m4a -o reference/my-voice.wav\n"
            "점검만 하려면 --check 를 붙여 실행하세요."
        )

    tts = None
    play = None
    if not args.no_audio:
        try:
            from TTS.api import TTS
        except ImportError:
            sys.exit("pip install TTS 가 필요합니다. (--no-audio 로 글자만 쓸 수도 있습니다)")
        play, player_name = make_player()
        if play is None:
            sys.exit("소리를 낼 방법이 없습니다. pip install sounddevice soundfile")

        import torch
        gpu = torch.cuda.is_available()
        print(f"XTTS-v2 를 불러옵니다… ({'GPU' if gpu else 'CPU'} · 처음 한 번은 모델을 내려받습니다)")
        tts = TTS(MODEL_XTTS).to("cuda" if gpu else "cpu")
        print(f"준비 완료 · 재생: {player_name} · 목소리: {ref.name}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    print("\n대화를 시작합니다. 끝내려면 /quit, 기억을 지우려면 /reset\n")

    turn = 0
    while True:
        try:
            user = input("나  ▶ ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user:
            continue
        if user in ("/quit", "/exit", "/q"):
            break
        if user == "/reset":
            messages = messages[:1]
            print("(기억을 지웠습니다)\n")
            continue

        messages.append({"role": "user", "content": user})
        try:
            reply = llm_reply(messages, args)
        except urllib.error.URLError as e:
            print(f"LLM 연결 실패: {e}\n")
            messages.pop()
            continue
        except Exception as e:
            print(f"LLM 오류: {e}\n")
            messages.pop()
            continue

        messages.append({"role": "assistant", "content": reply})
        print(f"목소리 ▶ {reply}")

        if tts:
            turn += 1
            path = args.out_dir / f"reply-{turn:03d}.wav"
            try:
                tts.tts_to_file(
                    text=reply,
                    speaker_wav=str(ref),
                    language=args.lang,
                    file_path=str(path),
                )
                play(path)
            except Exception as e:
                print(f"(음성 합성 실패: {e})")
            finally:
                if not args.keep and path.exists():
                    try:
                        path.unlink()
                    except OSError:
                        pass
        print()

    print("안녕히 가세요.")


if __name__ == "__main__":
    main()
