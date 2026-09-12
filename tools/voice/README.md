# 목소리 도구 (음성 복제 · 앱 음성 자동 생성)

내 목소리 30~60초로 **앱의 음성 54개를 전부 자동 생성**하고,
같은 목소리로 대화하는 콘솔 챗봇도 돌려 볼 수 있습니다.

```
clean_audio.py       녹음 정리 (잡음 줄이기 · 음량 맞추기 · 구간 자르기)
voice_chat.py        LLM + XTTS-v2 대화 CLI  (입력 → 답변 → 내 목소리로 재생)
make_app_voices.py   앱 음성 54개 일괄 생성 → assets/audio/*.wav
reference/           레퍼런스 목소리를 두는 자리
```

---

## ⚠️ 레퍼런스 목소리 규칙

레퍼런스는 **본인이 직접 녹음했거나, 본인에게 사용을 허락한 사람의 목소리**여야 합니다.

방송인·성우·지인 등 다른 사람의 목소리를 복제해 **그 사람이 하지 않은 말을 만들어 내는 것은
사칭**입니다. 가정 안에서 쓰더라도 그 사람의 목소리로 만든 음성이 아이에게 "그 사람의 말"로
전달되고, 파일은 그대로 남아 퍼질 수 있습니다. 이 도구는 그런 용도로 쓰라고 만든 것이 아닙니다.

특정한 목소리를 앱에 넣고 싶다면 그 사람에게 **직접 읽어 달라고 부탁하는 것**이 정답입니다.
부모 메뉴 → 성우 녹음 → *대본 내려받기* 로 54개 문구 대본을 뽑아 건네면 됩니다.
한 번에 쭉 읽어 오면 앱이 자동으로 잘라 배정합니다.

---

## 1. 설치

```bash
pip install TTS sounddevice soundfile      # 음성 합성 + 재생
# GPU가 있으면 훨씬 빠릅니다. 없으면 CPU로도 되지만 문장당 수 초 걸립니다.
```

LLM은 둘 중 하나:

```bash
ollama serve && ollama pull gemma3         # 로컬 (무료 · 오프라인)
setx OPENAI_API_KEY "sk-..."               # 또는 OpenAI
```

ffmpeg는 `clean_audio.py` 에 필요합니다 (`winget install Gyan.FFmpeg`).

준비됐는지 확인:

```bash
python voice_chat.py --check
```

## 2. 레퍼런스 만들기

조용한 방에서 **30~60초** 자연스럽게 읽은 녹음을 준비한 뒤:

```bash
python clean_audio.py 내녹음.m4a -o reference/my-voice.wav --report
```

- 잡음을 더 줄이려면 `--denoise 20`, 치찰음이 튀면 `--deesser`
- 긴 녹음에서 가장 또렷한 구간만: `--start 35 --duration 45`
- 배경에 **음악이 깔린 녹음은 깨끗하게 분리되지 않습니다.** 음악 없이 다시 녹음하세요.

## 3. 대화해 보기

```bash
python voice_chat.py --ref reference/my-voice.wav
python voice_chat.py --ref reference/my-voice.wav --backend openai --model gpt-4o-mini
```

콘솔에 입력 → LLM이 한국어로 답 → XTTS-v2가 내 목소리로 합성 → 바로 재생.
`/reset` 기억 지우기, `/quit` 종료, `--keep` 만든 wav 남기기, `--no-audio` 글자만.

## 4. 앱 음성 54개 만들기

```bash
python make_app_voices.py --list                        # 무엇을 만들지 먼저 확인
python make_app_voices.py --ref reference/my-voice.wav  # 전부 생성
python make_app_voices.py --ref ... --only jamo --force # 자모만 다시
```

`assets/audio/jamo-g.wav` … 처럼 저장되고, 앱은 새로 고치는 즉시 그 파일을 씁니다.
부모 메뉴 → 성우 녹음 맨 위에서 «사람 목소리 54개»로 확인하세요.

문구 목록은 앱 소스(`src/jamo.js`, `src/lines.js`, `assets/stickers/stickers.json`)에서
직접 읽어 오므로, 문구를 고치면 여기에도 자동 반영됩니다.

받침이 대표음으로 나는 자모(시옷→[시옫], 키읔→[키윽] …)는 소리 나는 대로 합성합니다.

## 5. 합성 음성 vs 사람 녹음

| | 합성(XTTS) | 사람이 직접 읽기 |
|---|---|---|
| 드는 시간 | 레퍼런스 1분 + 생성 몇 분 | 10분쯤 읽기 |
| 발음 정확도 | 짧은 낱말(자모 이름)에서 흔들릴 수 있음 | 정확 |
| 감정·억양 | 밋밋한 편 | 아이에게 훨씬 잘 전달됨 |

**자모 24개만큼은 사람이 읽은 것을 권합니다.** 한 글자짜리 이름은 합성이 가장 취약한 구간이고,
아이가 가장 많이 듣는 소리입니다. 안내 음성·캐릭터 이름은 합성으로 채워도 괜찮습니다.
섞어 쓸 수 있습니다 — 앱은 파일이 있는 것만 그 소리로 읽습니다.

## 6. 확인 안 된 부분

`clean_audio.py` 와 `make_app_voices.py --list` 는 이 컴퓨터에서 실제로 돌려 확인했습니다.
**XTTS 합성과 LLM 연동 부분은 패키지가 설치돼 있지 않아 실행 검증을 못 했습니다.**
설치 후 처음 돌릴 때 오류가 나면 `--check` 결과와 함께 알려주세요.
