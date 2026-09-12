// ============================================================
// 보상 연출 (PRD 6.2) — 전체 8초 이내
//  상자 등장 → 아이가 탭해서 연다 → 캐릭터 + 이름 음성
//  → 스티커북에 붙기 → 0.3초 뒤 "참 잘했어요" 도장 → 전체 뷰 → 홈
// ============================================================
import { stickerArt, stickerVoiceKey } from '../stickers.js';
import { say, sfx } from '../audio.js';
import { state } from '../store.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function giftSVG() {
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <rect x="12" y="38" width="76" height="50" rx="8" fill="#FFC9D8" stroke="#E38FA8" stroke-width="2.5"/>
    <rect x="8" y="28" width="84" height="18" rx="7" fill="#FFE0E9" stroke="#E38FA8" stroke-width="2.5"/>
    <rect x="43" y="28" width="14" height="60" fill="#9AD9C6"/>
    <path d="M50 28c-6-10-22-12-22-2 0 6 12 6 22 2zm0 0c6-10 22-12 22-2 0 6-12 6-22 2z"
      fill="#7FD0B8" stroke="#4FAE95" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

function bookFrameSVG() {
  return `<svg viewBox="0 0 100 70" width="100%" height="100%" aria-hidden="true">
    <rect x="3" y="4" width="94" height="62" rx="8" fill="#FFFFFF" stroke="#D9CDB8" stroke-width="3"/>
    <g fill="#F3EADC">
      <rect x="11" y="12" width="36" height="21" rx="5"/><rect x="53" y="12" width="36" height="21" rx="5"/>
      <rect x="11" y="38" width="36" height="21" rx="5"/><rect x="53" y="38" width="36" height="21" rx="5"/>
    </g>
  </svg>`;
}

/**
 * @param {HTMLElement} root  #screen-reward
 * @param {number|null} slot  새로 받은 스티커 슬롯 (null = 24종 완성 후)
 * @param {Function} onDone   연출 종료 콜백
 */
export function playReward(root, slot, onDone) {
  const owned = state.progress.stickers;
  const showSlot = slot ?? (owned.length ? owned[Math.floor(Math.random() * owned.length)] : 1);

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'reward-wrap';
  root.appendChild(wrap);

  const gift = document.createElement('div');
  gift.className = 'gift';
  gift.innerHTML = giftSVG();
  wrap.appendChild(gift);

  // 스티커북(붙일 자리)
  const book = document.createElement('div');
  book.style.cssText = `position:absolute;left:50%;bottom:6%;transform:translateX(-50%);
    width:min(34vh,42vw);height:calc(min(34vh,42vw) * .7);opacity:0;transition:opacity .4s`;
  book.innerHTML = bookFrameSVG();
  wrap.appendChild(book);

  const char = document.createElement('div');
  char.className = 'reward-char';
  char.appendChild(stickerArt(showSlot, { className: 'art' }));
  char.querySelector('.art').style.cssText = 'width:100%;height:100%';
  wrap.appendChild(char);

  const stamp = document.createElement('div');
  stamp.className = 'stamp';
  stamp.innerHTML = '참<br>잘했어요';
  wrap.appendChild(stamp);

  let opened = false;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    root.innerHTML = '';
    onDone?.(showSlot);
  };

  async function sequence() {
    // ② 아이가 탭해서 연다
    gift.classList.add('opening');
    sfx.boxOpen();
    await wait(460);
    gift.style.transition = 'opacity .25s, transform .25s';
    gift.style.opacity = '0';
    gift.style.transform = 'translate(-50%,-50%) scale(.7)';

    // ③ 캐릭터 등장 + 이름 음성
    char.classList.add('pop');
    sfx.pop();
    say(stickerVoiceKey(showSlot));
    book.style.opacity = '1';
    await wait(1150);

    // ④ 스티커북에 붙는 애니메이션
    const bRect = book.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    const targetW = bRect.width * 0.34;
    const cx = bRect.left - wRect.left + bRect.width * 0.28;
    const cy = bRect.top - wRect.top + bRect.height * 0.32;
    char.classList.add('fly');
    char.style.width = `${targetW}px`;
    char.style.height = `${targetW}px`;
    char.style.marginLeft = `${-targetW / 2}px`;
    char.style.marginTop = `${-targetW / 2}px`;
    char.style.left = `${cx}px`;
    char.style.top = `${cy}px`;
    await wait(760);
    sfx.tap();

    // ⑤ 0.3초 지연 후 "참 잘했어요" 도장
    await wait(300);
    stamp.style.left = `${cx + targetW * 0.12}px`;
    stamp.style.top = `${cy + targetW * 0.12}px`;
    stamp.classList.add('hit');
    sfx.stamp();
    say('great');
    await wait(900);

    // ⑥ 스티커북 전체 뷰 → 홈
    sfx.fanfare();
    finish();
  }

  const onTap = () => {
    if (opened) { finish(); return; }   // 두 번째 탭은 건너뛰기
    opened = true;
    sequence();
  };
  wrap.addEventListener('pointerdown', onTap);

  // 상자가 열릴 때까지 가만히 기다린다 (타임아웃 없음)
  sfx.soft();
  say('open-box');
}
