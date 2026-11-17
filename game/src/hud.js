// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, kill feed
// and the buy menu, plus the overlay panels for menu, pause, round end and match end.
// It never touches the simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const MENU_COPY = {
  title: 'EMBERLINE',
  copy: 'A round-based tactical shooter in Foundry Yard. Cobalt attacks — plant the Igniter at Furnace A or B, or eliminate Rust. Rust defends. First to 5 rounds takes the match.',
  action: 'Click to play',
};
const PAUSED_COPY = {
  title: 'EMBERLINE',
  copy: 'Paused. Click to resume.',
  action: 'Click to resume',
};

export function createHud(shotMode = false) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const roundLine = $('round-line');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorRow = $('armor-row');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const timerEl = $('timer');
  const scoreCobalt = $('score-cobalt');
  const scoreRust = $('score-rust');
  const aliveCobalt = $('alive-cobalt');
  const aliveRust = $('alive-rust');
  const moneyEl = $('money');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageVignette = $('damage-vignette');
  const progressWrap = $('progress-wrap');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyTimer = $('buy-timer');
  const spectate = $('spectate');
  const objectiveEl = $('objective');

  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  const hud = {
    setHealth(health, armor) {
      setText(healthNum, 'health', String(Math.max(0, Math.ceil(health))));
      healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthFill.classList.toggle('low', health <= 30);
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      setText(armorNum, 'armor', String(Math.ceil(armor)));
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, urgent) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('urgent', !!urgent);
    },
    setScore(cobalt, rust, round) {
      setText(scoreCobalt, 'sc', String(cobalt));
      setText(scoreRust, 'sr', String(rust));
      setText(roundLine, 'round', `ROUND ${round} — FIRST TO 5`);
    },
    setAlive(cobalt, rust) {
      setText(aliveCobalt, 'ac', `${cobalt} ALIVE`);
      setText(aliveRust, 'ar', `${rust} ALIVE`);
    },
    setMoney(money) {
      setText(moneyEl, 'money', `$${money}`);
      setText(buyMoney, 'buymoney', `$${money}`);
    },
    setBuyTimer(seconds) {
      setText(buyTimer, 'buytimer', `Buy phase — ${Math.max(0, Math.ceil(seconds))}s`);
    },
    setObjective(text) {
      setText(objectiveEl, 'objective', text);
    },
    setCrosshairSpread(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.min(26, 4 + spreadPx)}px`);
    },
    showBanner(text, holdMs = 3200) {
      banner.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const line = document.createElement('div');
      line.className = 'kill';
      const killerSpan = document.createElement('span');
      killerSpan.className = killerTeam === 'cobalt' ? 'cobalt' : 'rust';
      killerSpan.textContent = killer;
      const victimSpan = document.createElement('span');
      victimSpan.className = 'dim';
      victimSpan.textContent = victim;
      line.append(killerSpan, document.createTextNode(headshot ? '  ⌖  ' : '  —  '), victimSpan);
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      // In screenshot mode the capture fast-forwards timers, so the line stays.
      if (!shotMode) setTimeout(() => line.remove(), 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      // In screenshot mode the capture fast-forwards timers, so the marker stays.
      if (!shotMode) hitTimer = setTimeout(() => hitmarker.classList.remove('on'), holdMs);
    },
    damageFlash() {
      damageVignette.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageVignette.classList.remove('on'), 220);
    },
    setProgress(label, fraction) {
      if (label === null) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      setText(progressLabel, 'progress', label);
      progressFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    },
    showBuy(money, owned, onBuy) {
      buyMenu.hidden = false;
      hud.setMoney(money);
      const list = $('buy-list');
      list.innerHTML = '';
      const entries = [
        ...Object.values(WEAPONS).map((def) => ({ id: def.id, name: def.name, detail: `${def.damage} dmg · ${def.mag} rounds`, price: def.price, owned: owned.has(def.id) })),
        { id: 'grenade', name: 'FL-1 Frag Grenade', detail: 'Throw with G · blast radius 6 m', price: GRENADE_PRICE, owned: false },
        { id: 'armor', name: 'Plated Vest', detail: 'Absorbs half of incoming damage', price: ARMOR_PRICE, owned: false },
      ];
      for (const entry of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = entry.owned || money < entry.price;
        button.innerHTML = `<span class="buy-name"></span><span class="buy-detail"></span><span class="buy-price"></span>`;
        button.querySelector('.buy-name').textContent = entry.name;
        button.querySelector('.buy-detail').textContent = entry.owned ? 'Owned' : entry.detail;
        button.querySelector('.buy-price').textContent = entry.owned ? '—' : `$${entry.price}`;
        button.addEventListener('click', () => onBuy(entry.id));
        list.appendChild(button);
      }
    },
    refreshBuy(money, owned) {
      if (buyMenu.hidden) return;
      hud.setMoney(money);
      for (const button of document.querySelectorAll('.buy-item')) {
        const priceText = button.querySelector('.buy-price').textContent;
        const price = priceText === '—' ? 0 : Number(priceText.slice(1));
        button.disabled = priceText === '—' || money < price;
      }
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, data = {}) {
      if (mode === 'menu') {
        title.textContent = MENU_COPY.title;
        copy.textContent = MENU_COPY.copy;
        play.textContent = MENU_COPY.action;
        roundLine.textContent = '';
      } else if (mode === 'paused') {
        title.textContent = PAUSED_COPY.title;
        copy.textContent = PAUSED_COPY.copy;
        play.textContent = PAUSED_COPY.action;
      } else if (mode === 'round') {
        title.textContent = data.won ? 'Round won' : 'Round lost';
        copy.textContent = data.reason ?? '';
        play.textContent = 'Next round';
        roundLine.textContent = `COBALT ${data.cobalt} — ${data.rust} RUST`;
      } else if (mode === 'match') {
        title.textContent = data.winner === 'cobalt' ? 'Cobalt takes the match' : data.winner === 'rust' ? 'Rust takes the match' : 'Match drawn';
        copy.textContent = `Final score — Cobalt ${data.cobalt}, Rust ${data.rust}. Kills ${data.kills}, deaths ${data.deaths}.`;
        play.textContent = 'Play again';
        roundLine.textContent = '';
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    setSpectate(text) {
      if (text === null) {
        spectate.hidden = true;
        return;
      }
      spectate.hidden = false;
      spectate.textContent = text;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
  return hud;
}
