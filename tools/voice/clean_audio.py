#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
녹음 정리 — 배경 잡음/울림을 줄이고 목소리만 또렷하게 남긴다.

쓰임새 두 가지
  1) 음성 복제(clone)에 쓸 레퍼런스 만들기   : 30~60초짜리 깨끗한 wav
  2) 앱에 바로 넣을 음성 클립 다듬기          : 잡음 제거 + 음량 평준화

  python clean_audio.py 원본.mp3 -o reference/my-voice.wav
  python clean_audio.py 원본.m4a -o out.wav --denoise 20 --report

ffmpeg 만 있으면 됩니다 (파이썬 패키지 불필요).
배경에 '음악'이 깔린 녹음은 이 도구로 완전히 지워지지 않습니다.
그런 경우에는 음악 없이 다시 녹음하는 편이 훨씬 결과가 좋습니다.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

TARGET_RATE = 24000        # XTTS 계열이 다루기 좋은 값
TARGET_LUFS = -18.0        # 아이가 듣는 앱이라 너무 크지 않게


def need_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        sys.exit(
            "ffmpeg 가 필요합니다.\n"
            "  Windows : winget install Gyan.FFmpeg\n"
            "  macOS   : brew install ffmpeg\n"
            "  Linux   : sudo apt install ffmpeg"
        )
    return exe


def probe(path: Path) -> dict:
    exe = shutil.which("ffprobe")
    if not exe:
        return {}
    out = subprocess.run(
        [exe, "-v", "error", "-show_entries",
         "format=duration,bit_rate:stream=codec_name,channels,sample_rate",
         "-of", "json", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        return {}
    fmt = data.get("format", {})
    st = (data.get("streams") or [{}])[0]
    return {
        "duration": float(fmt.get("duration", 0) or 0),
        "codec": st.get("codec_name", "?"),
        "channels": st.get("channels", "?"),
        "rate": st.get("sample_rate", "?"),
    }


def loudness(path: Path) -> str:
    """평균/최대 레벨을 재서 사람이 읽을 수 있는 한 줄로"""
    exe = need_ffmpeg()
    r = subprocess.run(
        [exe, "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    mean = re.search(r"mean_volume:\s*(-?[\d.]+) dB", r.stderr or "")
    peak = re.search(r"max_volume:\s*(-?[\d.]+) dB", r.stderr or "")
    return f"평균 {mean.group(1) if mean else '?'}dB · 최대 {peak.group(1) if peak else '?'}dB"


def build_filters(args) -> str:
    f = []
    # 사람 목소리 바깥의 저역/고역을 먼저 잘라낸다 (에어컨 웅웅거림, 치찰음 잡음)
    f.append(f"highpass=f={args.highpass}")
    f.append(f"lowpass=f={args.lowpass}")
    if args.denoise > 0:
        # afftdn: 정상 잡음(팬 소리, 히스) 제거. nr 은 dB 단위 감쇠량
        f.append(f"afftdn=nr={args.denoise}:nf=-30:tn=1")
    if args.gate:
        # 말소리 사이의 잔잔한 잡음을 눌러 준다
        f.append("agate=threshold=0.02:ratio=2:attack=5:release=180")
    if args.deesser:
        f.append("deesser=i=0.4")
    # 음량을 규격에 맞춰 평준화
    f.append(f"loudnorm=I={args.lufs}:TP=-1.5:LRA=11")
    if args.trim:
        f.append(
            "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB:"
            "stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB"
        )
    f.append(f"aresample={args.rate}")
    return ",".join(f)


def main() -> None:
    p = argparse.ArgumentParser(
        description="녹음에서 배경 잡음을 줄이고 목소리만 남깁니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("input", type=Path, help="원본 오디오 (mp3/m4a/wav/…)")
    p.add_argument("-o", "--output", type=Path, help="저장할 wav (기본: <원본>-clean.wav)")
    p.add_argument("--denoise", type=int, default=12, help="잡음 감쇠 dB, 0이면 끔 (기본 12, 강하게는 20~24)")
    p.add_argument("--highpass", type=int, default=80, help="이 주파수 아래를 자름 (기본 80Hz)")
    p.add_argument("--lowpass", type=int, default=11000, help="이 주파수 위를 자름 (기본 11000Hz)")
    p.add_argument("--lufs", type=float, default=TARGET_LUFS, help=f"목표 음량 LUFS (기본 {TARGET_LUFS})")
    p.add_argument("--rate", type=int, default=TARGET_RATE, help=f"출력 샘플레이트 (기본 {TARGET_RATE})")
    p.add_argument("--no-trim", dest="trim", action="store_false", help="앞뒤 무음을 그대로 둠")
    p.add_argument("--no-gate", dest="gate", action="store_false", help="숨소리 구간 억제를 끔")
    p.add_argument("--deesser", action="store_true", help="치찰음(ㅅ,ㅊ)이 튈 때 켜기")
    p.add_argument("--start", type=float, help="이 초부터 사용 (레퍼런스 구간 고르기)")
    p.add_argument("--duration", type=float, help="이만큼만 사용 (레퍼런스는 30~60초면 충분)")
    p.add_argument("--report", action="store_true", help="처리 전후 정보를 자세히 보여줌")
    args = p.parse_args()

    if not args.input.exists():
        sys.exit(f"파일을 찾을 수 없습니다: {args.input}")
    out = args.output or args.input.with_name(args.input.stem + "-clean.wav")
    out.parent.mkdir(parents=True, exist_ok=True)

    exe = need_ffmpeg()
    info = probe(args.input)
    if info:
        print(f"원본  : {args.input.name}")
        print(f"        {info['duration']:.1f}초 · {info['codec']} · {info['channels']}채널 · {info['rate']}Hz")
    if args.report:
        print(f"        {loudness(args.input)}")

    cmd = [exe, "-hide_banner", "-v", "error", "-y"]
    if args.start:
        cmd += ["-ss", str(args.start)]
    if args.duration:
        cmd += ["-t", str(args.duration)]
    cmd += ["-i", str(args.input), "-ac", "1", "-af", build_filters(args), str(out)]

    print("정리 중…")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit("ffmpeg 실패:\n" + (r.stderr or "").strip()[:800])

    done = probe(out)
    print(f"완료  : {out}")
    if done:
        print(f"        {done['duration']:.1f}초 · 모노 · {done['rate']}Hz")
    if args.report:
        print(f"        {loudness(out)}")

    if done and done["duration"] < 6:
        print("\n※ 6초보다 짧습니다. 음성 복제 레퍼런스로 쓰려면 30초 이상을 권합니다.")
    elif done and done["duration"] > 120:
        print("\n※ 너무 깁니다. --start/--duration 으로 가장 또렷한 30~60초만 잘라 쓰세요.")


if __name__ == "__main__":
    main()
