// ============================================================
// 앱이 소리 내어 말하는 모든 문구 — 여기가 유일한 출처
//  · 재생: audio.js 의 say(key) 가 이 표에서 문구를 찾는다
//  · 녹음: 부모 메뉴의 녹음 목록도 이 표에서 만들어진다
//  → 문구를 추가하면 녹음 목록에도 자동으로 나타난다
// ============================================================
import { JAMO } from './jamo.js';
import { STAGES } from './curriculum.js';
import { stickerVoiceKey, stickerLabel, stickerCount } from './stickers.js';

/** 안내 음성 (PRD 4.2 / 5.4 / 6.2 / 7.1) */
export const UI_LINES = {
  'home-greeting': { text: '오늘도 글자 쓰러 가볼까?', where: '홈에 들어올 때' },
  'try-again':     { text: '한 번 더 해볼까?',          where: '1차 미달 — 부정 표현 금지' },
  'good':          { text: '잘했어!',                   where: '글자를 마쳤을 때' },
  'great':         { text: '참 잘했어요!',              where: '도장을 찍을 때 · 스티커북 도장 탭' },
  'open-box':      { text: '선물이 왔어요!',            where: '스티커 상자가 나올 때' },
  'done-today':    { text: '오늘은 여기까지! 스티커 구경하자', where: '부모가 하루 상한을 건 경우' },
};

/**
 * 자모 이름을 소리 내어 읽을 때의 발음 (음절 끝소리 규칙)
 * 표기와 소리가 다른 7개만 적는다. 녹음하는 사람에게 보여 주는 용도.
 */
export const PRON = {
  s:  '시옫',   // 시옷
  j:  '지읃',   // 지읒
  ch: '치읃',   // 치읓
  k:  '키윽',   // 키읔
  t:  '티읃',   // 티읕
  p:  '피읍',   // 피읖
  h:  '히읃',   // 히읗
};

/** 키 하나에 해당하는 읽을 문구 */
export function lineFor(key) {
  if (!key) return '';
  if (UI_LINES[key]) return UI_LINES[key].text;
  if (key.startsWith('jamo-')) {
    const j = JAMO.find((x) => x.id === key.slice(5));
    return j ? j.name : '';
  }
  // 2·3단계 글자는 녹음 목록에 없다. 키에 적힌 글자를 그대로 읽는다
  if (key.startsWith('say-')) return key.slice(4);
  if (key.startsWith('sticker-')) {
    const m = key.match(/^sticker-(s\d-)?(\d+)$/);
    if (!m) return '';
    const stage = STAGES.find((s) => s.prefix === (m[1] ?? ''));
    return stage ? stickerLabel(Number(m[2]), stage.id) : '';
  }
  return '';
}

/** 부모 메뉴 녹음 목록 — 그룹별로 묶어서 반환 */
export function voiceCatalog() {
  const stickerGroups = STAGES.map((s) => ({
    group: `캐릭터 이름 · ${s.no}단계 ${s.name}`,
    stage: s.id,
    note: `${s.no}단계에서 스티커를 받을 때와 스티커북에서 그 친구를 누를 때 재생됩니다.`,
    items: Array.from({ length: stickerCount(s.id) }, (_, i) => ({
      key: stickerVoiceKey(i + 1, s.id),
      label: `${i + 1}번`,
      text: stickerLabel(i + 1, s.id),
    })),
  }));

  return [
    {
      group: '자모 이름',
      note: '글자가 나올 때와 아이가 글자를 누를 때 재생됩니다. 이름으로 읽습니다. 괄호 안은 실제 발음입니다.',
      items: JAMO.map((j) => ({ key: `jamo-${j.id}`, label: j.ch, text: j.name, pron: PRON[j.id] })),
    },
    {
      group: '안내 음성',
      note: '아이에게 말을 거는 문장입니다. 밝고 느리게.',
      items: Object.entries(UI_LINES).map(([key, v]) => ({ key, label: v.where, text: v.text })),
    },
    ...stickerGroups,
  ];
}

/** 녹음해야 할 전체 키 목록 */
export const allVoiceKeys = () => voiceCatalog().flatMap((g) => g.items.map((i) => i.key));

/** 성우에게 건넬 녹음 대본 (텍스트 파일로 내려받기) */
export function scriptText() {
  const groups = voiceCatalog();
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const L = [];
  L.push('한글 따라쓰기 앱 — 녹음 대본');
  L.push('='.repeat(46));
  L.push('');
  L.push(`읽을 문구 ${total}개입니다. 순서대로 읽어 주세요.`);
  L.push('');
  L.push('■ 녹음 요령');
  L.push('  · 한 문구를 읽고 반드시 1초쯤 쉬어 주세요. (자동으로 잘라 쓰기 때문입니다)');
  L.push('  · 중간에 틀리면 멈추지 말고, 한 박자 쉬었다가 그 문구만 다시 읽어 주세요.');
  L.push('  · 4세 아이가 듣습니다. 밝고 또박또박, 조금 느리게 읽어 주세요.');
  L.push('  · 조용한 방에서 한 번에 쭉 녹음해 주시면 됩니다. 편집은 하지 않으셔도 됩니다.');
  L.push('  · 대괄호 [ ] 안은 실제 소리 나는 대로입니다. 그대로 읽어 주세요.');
  L.push('');
  let n = 0;
  groups.forEach((g) => {
    L.push('');
    L.push(`── ${g.group} (${g.items.length}개) ──`);
    L.push(`   ${g.note}`);
    L.push('');
    g.items.forEach((it) => {
      n += 1;
      const pron = it.pron ? `   ← [${it.pron}] 로 소리 냅니다` : '';
      L.push(`  ${String(n).padStart(2, ' ')}. ${it.text}${pron}`);
    });
  });
  L.push('');
  L.push('='.repeat(46));
  L.push('끝까지 읽어 주셔서 고맙습니다.');
  return L.join('\r\n');
}
