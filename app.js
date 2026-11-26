'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const body = document.body;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const acts = $$('.act');
const hero = $('#answer');
const rings = acts.map(act => {
  const ring = document.createElement('div');
  ring.className = 'scene-ring';
  ring.setAttribute('aria-hidden', 'true');
  act.prepend(ring);
  return ring;
});
const technologies = $$('.tech article');
const lines = $$('.reveal-lines p');
const counts = $$('.count');
const questionWords = $$('.questions span');
const discard = $$('.discard span');
const progress = $('#progress');
const sound = $('#sound');
const notice = $('#notice');
const title = $('#answer-title');
const dialog = $('#link-dialog');
const slogan = $('#slogan');
const filmIndex = $('#film-act');
const manualIndex = $('#manual-index');

function prepareText(element, text = element.textContent) {
  const words = text.trim().split(/\s+/);
  const fragment = document.createDocumentFragment();
  words.forEach((word, index) => {
    if (index) fragment.append(' ');
    const mask = document.createElement('span');
    mask.className = 'word-mask';
    mask.style.setProperty('--word', index);
    const glyphs = document.createElement('span');
    glyphs.textContent = word;
    mask.append(glyphs);
    fragment.append(mask);
  });
  element.replaceChildren(fragment);
  element.classList.add('animated-copy');
}
const question = $('#custom-question');
const urlOutput = $('#url-output');
const score = new Audio('assets/hero-theme.mp3');
score.preload = 'none';
const effects = new Map();
const duration = 32;
const cues = [0, 7.05, 12.75, 17.5, 23.3, 27.6, duration];
const slogans = ['Согласие. Возведённое в абсолют.', 'Подтверждено. И подтверждено снова.', 'Степень уверенности только что повысилась.'];
const doubtMessages = ['Да. Мы перепроверили.', 'Да. Повторная проверка завершена.', 'Да. Подтверждено независимым внутренним комитетом.', 'КАКАЯ ИМЕННО ЧАСТЬ СЛОВА “ДА” ТЕБЕ НЕПОНЯТНА?'];
let mode = 'manual';
let soundEnabled = false;
let allowSound = true;
let ambientAttempt = 0;
let manualPage = -1;

function playAmbient() {
  if (!allowSound || document.hidden || mode !== 'manual' || !score.paused) return;
  const attempt = ++ambientAttempt;
  score.loop = true;
  score.volume = .27;
  score.muted = false;
  score.play().then(() => {
    if (attempt !== ambientAttempt || mode !== 'manual' || !allowSound) return;
    soundEnabled = true;
    updateSound();
  }).catch(() => {
    if (attempt !== ambientAttempt || mode !== 'manual') return;
    soundEnabled = false;
    updateSound();
  });
}

function pauseAmbient() {
  ++ambientAttempt;
  score.pause();
}
let audioClock = false;
let wantsAudioClock = false;
let elapsed = 0;
let previousFrame = null;
let frame = 0;
let currentAct = -1;
let activeTech = -1;
let replayCount = -1;
let doubts = 0;
let brandClicks = 0;
let keys = '';
let noticeTimer;
let holdStart = null;
let volume = 0;
let pointerX = 0;
let pointerY = 0;
let heroVisible = true;
let scrollDirty = true;
let lastManual = -1;
let epoch = 0;
let mediaTimeout;
let countStartedAt = null;
const fired = new Set();

const techButtons = technologies.map((article, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = String(index + 1).padStart(2, '0');
  button.setAttribute('aria-label', article.querySelector('h2').textContent);
  button.addEventListener('click', () => {
    showTech(index);
    fx('whoosh');
  });
  $('#tech-tabs').append(button);
  return button;
});

function showTech(index) {
  if (index === activeTech) return;
  activeTech = index;
  rings[3].style.setProperty('--turn', (index * 66 - 35) + 'deg');
  technologies.forEach((item, i) => { item.hidden = i !== index; });
  techButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  const article = technologies[index];
  if (!reduced.matches && article.animate) {
    article.animate([
      { opacity: 0, transform: 'translateX(42px) skewX(-13deg) scale(.93)', clipPath: 'inset(10% 100% 10% 0)' },
      { opacity: .9, transform: 'translateX(-5px) skewX(3deg)', clipPath: 'inset(0)', offset: .67 },
      { opacity: 1, transform: 'none', clipPath: 'inset(0)' },
    ], { duration: 570, easing: 'cubic-bezier(.16,.75,.24,1)' });
  }
}

function message(text, milliseconds = 2500) {
  clearTimeout(noticeTimer);
  notice.textContent = '';
  $('#dialog-status').textContent = '';
  const status = dialog.open ? $('#dialog-status') : notice;
  status.textContent = text;
  noticeTimer = setTimeout(() => {
    status.textContent = '';
    body.classList.remove('alert');
  }, milliseconds);
}

function updateSound() {
  $('#play-label').textContent = allowSound ? 'Запустить со звуком' : 'Запустить без звука';
  sound.setAttribute('aria-pressed', String(soundEnabled));
  sound.setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
  sound.querySelector('path').setAttribute('d', soundEnabled
    ? 'M3 9h4l5-4v14l-5-4H3z M16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12'
    : 'M3 9h4l5-4v14l-5-4H3z M16 9l5 6m0-6-5 6');
}

function fx(name) {
  if (!soundEnabled || document.hidden) return;
  if (!effects.has(name)) effects.set(name, new Audio('assets/sfx/' + name + '.wav'));
  const clip = effects.get(name);
  clip.volume = .47;
  clip.currentTime = 0;
  clip.play().catch(() => {});
}

function audioUnavailable(attempt) {
  if (attempt !== epoch || mode !== 'film' || document.hidden) return;
  clearTimeout(mediaTimeout);
  ++epoch;
  score.pause();
  wantsAudioClock = false;
  audioClock = false;
  soundEnabled = false;
  updateSound();
  message('Звук недоступен. Показ продолжается.');
  wake();
}

function playScore() {
  const attempt = ++epoch;
  clearTimeout(mediaTimeout);
  mediaTimeout = setTimeout(() => audioUnavailable(attempt), 4000);
  wantsAudioClock = true;
  const before = elapsed;
  try { score.currentTime = before; } catch { /* The media may still be loading. */ }
  score.play().then(() => {
    if (attempt !== epoch || mode !== 'film' || document.hidden) return;
    clearTimeout(mediaTimeout);
    audioClock = true;
    wantsAudioClock = false;
    soundEnabled = allowSound;
    updateSound();
    if (score.currentTime < .4) fx('start');
  }).catch(() => audioUnavailable(attempt));
}

score.addEventListener('error', () => audioUnavailable(epoch));

function setVolume(target, dt) {
  volume += (target - volume) * Math.min(1, dt / 135);
  if (Math.abs(target - volume) < .005) volume = target;
  score.volume = volume;
  score.muted = volume === 0;
}

function startFilm(event) {
  const button = event.currentTarget.getBoundingClientRect();
  const origin = {
    x: event.detail ? event.clientX : button.left + button.width / 2,
    y: event.detail ? event.clientY : button.top + button.height / 2,
  };
  replayCount += 1;
  acts[5].classList.remove('landed');
  countStartedAt = null;
  body.classList.remove('alert');
  prepareText(slogan, slogans[replayCount % slogans.length]);
  pauseAmbient();
  score.loop = false;
  mode = 'film';
  elapsed = 0;
  currentAct = -1;
  audioClock = false;
  wantsAudioClock = false;
  previousFrame = null;
  fired.clear();
  pulse = null;
  resize();
  acts.forEach((act) => act.classList.remove('burst'));
  soundEnabled = false;
  updateSound();
  if (!reduced.matches) buildShards($('.rift-word'));
  body.classList.add('playing');
  $('#film-controls').hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' });
  setVolume(allowSound ? .77 : 0, 200);
  if (allowSound) playScore();
  renderFilm(0);
  excite('launch', origin);
  $('#skip').focus({ preventScroll: true });
  wake();
}

function finishFilm() {
  const completed = mode === 'film' && elapsed >= duration;
  ++epoch;
  clearTimeout(mediaTimeout);
  mode = 'manual';
  audioClock = false;
  wantsAudioClock = false;
  score.pause();
  playAmbient();
  for (const clip of effects.values()) clip.pause();
  body.classList.remove('playing');
  $$('.shard-field').forEach(field => field.remove());
  pulse = null;
  clearDust();
  $('#film-controls').hidden = true;
  acts.forEach((act) => act.classList.remove('current', 'burst'));
  setCounts(1);
  showTech(0);
  lastManual = 5;
  acts[5].classList.toggle('landed', completed);
  acts[5].scrollIntoView({ behavior: 'instant' });
  $('#replay').focus({ preventScroll: true });
  scrollDirty = true;
  wake();
}

function setCounts(ratio) {
  for (const [index, count] of counts.entries()) {
    const phase = clamp((ratio - index * .12) / (1 - index * .12));
    const value = String(Math.round(Number(count.dataset.to) * phase));
    if (count.textContent !== value) count.textContent = value;
  }
}

function onceAt(time, name) {
  if (elapsed >= time && !fired.has(time)) {
    fired.add(time);
    fx(name);
    if (name === 'impact' || name === 'final') excite(name === 'final' ? 'final' : 'violet');
  }
}

function buildShards(word) {
  word.querySelector('.shard-field')?.remove();
  const field = document.createElement('span');
  field.className = 'shard-field';
  field.setAttribute('aria-hidden', 'true');
  const letters = [...word.children];
  const rows = innerWidth < 660 ? 4 : 6;

  for (let row = 0; row < rows; row++) {
    const low = row * 100 / rows;
    const high = (row + 1) * 100 / rows + .17;
    const splitTop = 42 + (row * 13 % 22);
    const splitBottom = row === rows - 1 ? 50 : 42 + ((row + 1) * 13 % 22);
    for (const side of [-1, 1]) {
      const tile = document.createElement('span');
      tile.className = 'shard';
      const polygon = side < 0
        ? `0 ${low}%, ${splitTop}% ${low}%, ${splitBottom}% ${high}%, 0 ${high}%`
        : `${splitTop}% ${low}%, 100% ${low}%, 100% ${high}%, ${splitBottom}% ${high}%`;
      tile.style.clipPath = `polygon(${polygon})`;
      tile.style.setProperty('--drift-x', `${side * (25 + (row * 17 % 34))}vw`);
      tile.style.setProperty('--drift-y', `${(row - (rows - 1) / 2) * 10}vh`);
      tile.style.setProperty('--depth', `${130 + (row * 97 % 430)}px`);
      tile.style.setProperty('--spin', `${side * (9 + row * 6)}deg`);
      tile.style.setProperty('--refract', `${row % 2 ? 21 : -24}deg`);
      tile.style.setProperty('--lag', `${(row * 21 + (side > 0 ? 35 : 0))}ms`);
      tile.append(...letters.map(letter => letter.cloneNode(true)));
      field.append(tile);
    }
  }
  word.append(field);
}

function renderFilm(time) {
  let index = 0;
  while (index + 1 < acts.length && time >= cues[index + 1]) index++;
  const local = time - cues[index];
  if (index !== currentAct) {
    acts.forEach((act, i) => act.classList.toggle('current', i === index));
    currentAct = index;
    filmIndex.textContent = String(index + 1).padStart(2, '0') + ' / 06';
    filmIndex.setAttribute('aria-label', 'Сцена ' + (index + 1) + ' из 6');
    if (!reduced.matches && filmIndex.animate) {
      filmIndex.animate([{ opacity: .2, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 390);
    }
    if (index > 0) fx('whoosh');
  }
  progress.value = time;
  if (!reduced.matches) {
    const phase = Math.min(1, local / (cues[index + 1] - cues[index]));
    acts[index].style.setProperty('--scroll', phase.toFixed(3));
    if (index === 4) moveQuestions(Math.min(1, local / 2.75));
  }
  if (index === 0) {
    const lineIndex = local >= 1.22 && local < 4.85 ? Math.floor((local - 1.22) / .91) : -1;
    lines.forEach((line, i) => line.classList.toggle('cue', i === lineIndex));
    if (local >= 5.67 && !acts[0].classList.contains('burst')) {
      if (!reduced.matches) buildShards(acts[0].querySelector('.scene-yes'));
      acts[0].classList.add('burst');
    }
    onceAt(5.67, 'impact');
  } else if (index === 1) {
    discard.forEach((word, i) => word.classList.toggle('cue', local >= .65 + i * .82));
    acts[1].classList.toggle('burst', local >= 4.25);
    onceAt(11.3, 'impact');
  } else if (index === 2) {
    setCounts(reduced.matches ? 1 : Math.min(1, local / 1.75));
  } else if (index === 3) {
    showTech(Math.min(4, Math.floor(local / 1.1)));
  } else if (index === 4) {
    if (local >= 2.75 && !acts[4].classList.contains('burst')) {
      if (!reduced.matches) aimQuestions();
      acts[4].classList.add('burst');
      excite('violet');
    }
    onceAt(25.45, 'rise');
  } else {
    if (!acts[5].classList.contains('burst')) {
      if (!reduced.matches) buildShards(acts[5].querySelector('.scene-yes'));
      acts[5].classList.add('burst');
    }
    onceAt(27.6, 'final');
  }
}

const canvas = $('#dust');
const paint = canvas.getContext('2d');
let canvasW = 0;
let canvasH = 0;
let particleLimit = 70;
let slowFrames = 0;
let pulse = null;
const particles = Array.from({ length: 85 }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
const clamp = value => Math.max(0, Math.min(1, value));

function resize() {
  if (paint) {
    canvasW = innerWidth;
    canvasH = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, canvasW < 650 ? 1 : 1.35);
    canvas.width = Math.round(canvasW * ratio);
    canvas.height = Math.round(canvasH * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    particleLimit = canvasW < 650 || (navigator.hardwareConcurrency || 8) <= 4 ? 35 : 72;
  }
  scrollDirty = true;
  wake();
}

function clearDust() {
  if (paint) paint.clearRect(0, 0, canvasW, canvasH);
}

function excite(tone, origin = null) {
  if (!paint || reduced.matches) return;
  pulse = { started: performance.now(), tone, origin };
  wake();
}

function drawDust(now, dt) {
  if (!paint || !canvasW || reduced.matches) return;
  const ambient = heroVisible && mode === 'manual';
  if (!ambient && !pulse) return;
  if (dt > 24 && ++slowFrames > 14) {
    particleLimit = Math.max(17, particleLimit - 8);
    slowFrames = 0;
  }
  clearDust();
  const age = pulse ? clamp((now - pulse.started) / 1320) : 1;
  const bloom = 1 - (1 - age) ** 2.7;
  const travel = pulse?.origin ? (1 - age) ** 2.4 : 0;
  const centerX = canvasW * .5 + ((pulse?.origin?.x ?? canvasW * .5) - canvasW * .5) * travel;
  const centerY = canvasH * .48 + ((pulse?.origin?.y ?? canvasH * .48) - canvasH * .48) * travel;
  const radius = Math.hypot(canvasW, canvasH) * (pulse?.tone === 'launch' ? .66 : .49);
  const tone = pulse?.tone === 'red' ? '255,85,115' : '208,168,255';
  if (age < 1) {
    paint.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      paint.strokeStyle = 'rgba(' + tone + ',' + (1 - age) ** 2 * (.68 - i * .22) + ')';
      paint.beginPath();
      paint.ellipse(centerX, centerY, 8 + radius * bloom * (1 - i * .24),
        6 + radius * bloom * (.66 - i * .17), 0, 0, Math.PI * 2);
      paint.stroke();
    }
  } else pulse = null;
  for (let i = 0; i < particleLimit; i++) {
    const [x, y, size, speed] = particles[i];
    if (age < 1) {
      const angle = x * Math.PI * 2;
      const distance = (24 + bloom * radius) * (.28 + y);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const px = centerX + dx * distance;
      const py = centerY + dy * distance;
      const trail = (3 + 27 * speed) * (1 - age);
      paint.strokeStyle = 'rgba(' + tone + ',' + (1 - age) * (.25 + .6 * size) + ')';
      paint.lineWidth = .6 + size * 1.5;
      paint.beginPath();
      paint.moveTo(px, py);
      paint.lineTo(px + dx * trail, py + dy * trail);
      paint.stroke();
    } else if (ambient) {
      const px = ((x + now * (.000013 + speed * .00002)) % 1) * canvasW + pointerX * size;
      const py = ((y + now * (.000013 + speed * .000045)) % 1) * canvasH;
      if (px > canvasW * .62 && px < canvasW * .84 && canvasW > 650 && py < canvasH * .59) continue;
      paint.fillStyle = 'rgba(214,187,255,' + (.11 + size * .57) + ')';
      paint.fillRect(px, py, .7 + size * 1.9, .7 + size * 2.2);
    }
  }
}

function moveQuestions(phase) {
  if (acts[4].classList.contains('burst')) return;
  const range = Math.min(13, innerWidth * .022);
  questionWords.forEach((word, i) => {

    const angle = i * Math.PI * 2 / questionWords.length + phase * 3.2;
    word.style.setProperty('--qx', Math.round(Math.cos(angle) * range * (.35 + phase)) + 'px');
    word.style.setProperty('--qy', Math.round(Math.sin(angle) * range * (.3 + phase * .42)) + 'px');
    word.style.setProperty('--qz', Math.round(Math.cos(angle + 1) * 10) + 'deg');
  });
}

function aimQuestions() {
  const target = acts[4].querySelector('.questions').getBoundingClientRect();
  questionWords.forEach(word => {
    const rect = word.getBoundingClientRect();
    word.style.setProperty('--gx', (target.left + target.width / 2 - rect.left - rect.width / 2) + 'px');
    word.style.setProperty('--gy', (target.bottom + 7 - rect.top - rect.height / 2) + 'px');
  });
}

function manualScroll() {
  scrollDirty = false;
  let active = -1;
  if (!reduced.matches && heroVisible) {
    hero.style.setProperty('--hero-away', clamp(-hero.getBoundingClientRect().top / innerHeight).toFixed(3));
  }
  acts.forEach((act, i) => {
    const rect = act.getBoundingClientRect();
    const inFrame = rect.top < innerHeight && rect.bottom > 0;
    if (!inFrame) {
      act.classList.remove('arrived');
      return;
    }
    const phase = clamp((innerHeight - rect.top) / innerHeight);
    if (!reduced.matches) {
      act.style.setProperty('--scroll', phase.toFixed(3));
      act.classList.toggle('arrived', phase >= .32);
      if (i === 4) moveQuestions(phase);
    }
    if (rect.top <= innerHeight * .55 && rect.bottom > innerHeight * .55) active = i;
  });
  body.classList.toggle('past-cover', window.scrollY >= hero.offsetHeight * .92);
  const page = active < 0 ? (window.scrollY > hero.offsetHeight ? acts.length : 1) : active + 1;
  if (page !== manualPage) {
    manualPage = page;
    manualIndex.firstElementChild.textContent = String(page).padStart(2, '0');
    manualIndex.setAttribute('aria-label', 'Сцена ' + page + ' из 6');
  }
  if (active >= 0 && active !== lastManual) {
    if (active === 2) {
      countStartedAt = reduced.matches ? null : performance.now();
    }
    if (active === 0 || active === 5) excite(active === 5 ? 'final' : 'violet');
    fx('whoosh');
  }
  lastManual = active;
}

function tick(now) {
  frame = 0;
  if (document.hidden) return;
  const dt = previousFrame === null ? 0 : Math.min(100, now - previousFrame);
  previousFrame = now;
  if (mode === 'film') {
    setVolume(allowSound && (wantsAudioClock || audioClock) ? .77 : 0, dt);
    if (audioClock) elapsed = score.ended ? duration : score.currentTime;
    else if (!wantsAudioClock) elapsed += dt / 1000;
    if (elapsed >= duration) finishFilm();
    else renderFilm(elapsed);
  } else if (scrollDirty) manualScroll();
  if (countStartedAt !== null && mode === 'manual') {
    const fraction = Math.max(0, Math.min(1, (now - countStartedAt) / 850));
    setCounts(1 - (1 - fraction) ** 3);
    if (fraction === 1) countStartedAt = null;
  }
  if (holdStart !== null && now - holdStart >= 730) {
    cancelHold();
    message('Уровень уверенности: 999%.');
    fx('impact');
  }
  drawDust(now, dt);
  if (mode === 'film' || pulse || countStartedAt !== null || holdStart !== null || (heroVisible && !reduced.matches)) wake();
  else previousFrame = null;
}

function wake() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  previousFrame = null;
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    cancelHold();
    pauseAmbient();
    pulse = null;
    clearDust();
    if (mode === 'film') {
      ++epoch;
      clearTimeout(mediaTimeout);
      wantsAudioClock = false;
      score.pause();
      for (const clip of effects.values()) clip.pause();
    }
  } else {
    if (mode === 'film' && (allowSound || audioClock)) playScore();
    else if (mode === 'manual') playAmbient();
    wake();
  }
});

if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (heroVisible) resize();
    else if (!pulse) clearDust();
  }).observe($('#answer'));
}
addEventListener('scroll', () => { scrollDirty = true; wake(); }, { passive: true });
addEventListener('resize', resize, { passive: true });
reduced.addEventListener('change', () => {
  pulse = null;
  clearDust();
  resize();
});
$('.hero').addEventListener('pointermove', (event) => {
  if (!finePointer.matches || reduced.matches) return;
  pointerX = (event.clientX / innerWidth - .5) * 18;
  pointerY = (event.clientY / innerHeight - .5) * 13;
  body.style.setProperty('--x', pointerX + 'px');
  body.style.setProperty('--y', pointerY + 'px');
});
$('.hero').addEventListener('pointerleave', () => {
  pointerX = pointerY = 0;
  body.style.removeProperty('--x');
  body.style.removeProperty('--y');
});
for (const button of $$('.actions button')) {
  button.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || reduced.matches) return;
    const bounds = button.getBoundingClientRect();
    button.style.setProperty('--mx', ((event.clientX - bounds.left - bounds.width / 2) * .11) + 'px');
    button.style.setProperty('--my', ((event.clientY - bounds.top - bounds.height / 2) * .11) + 'px');
  });
  button.addEventListener('pointerleave', () => {
    button.style.removeProperty('--mx');
    button.style.removeProperty('--my');
  });
}

function buildUrl() {
  const url = new URL(location.href);
  url.hash = '';
  if (question.value.trim()) url.searchParams.set('q', question.value.trim());
  else url.searchParams.delete('q');
  urlOutput.value = url.href;
  return url.href;
}

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    message('Ссылка скопирована.');
  } catch {
    if (!dialog.open) dialog.showModal();
    urlOutput.value = url;
    urlOutput.focus();
    urlOutput.select();
    if (document.execCommand?.('copy')) message('Ссылка скопирована.');
    else message('Ссылка выделена. Скопируйте её вручную.');
  }
}

async function shareUrl(url) {
  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  await copyUrl(url);
}

function startHold() {
  if (holdStart !== null) return;
  holdStart = performance.now();
  wake();
}

function cancelHold() { holdStart = null; }

title.tabIndex = 0;
title.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  title.setPointerCapture(event.pointerId);
  startHold();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) title.addEventListener(event, cancelHold);
title.addEventListener('keydown', (event) => {
  if (![' ', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  if (!event.repeat) startHold();
});
title.addEventListener('keyup', cancelHold);
$('.brand').addEventListener('click', () => {
  if (++brandClicks < 7) return;
  brandClicks = 0;
  message('Да. Ultra Pro Max Titanium Edition.', 4200);
  fx('final');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mode === 'film' && !dialog.open && !event.defaultPrevented) finishFilm();
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || dialog.open || event.target.closest?.('input, textarea, [contenteditable]') || !/^[a-z]$/i.test(event.key)) return;
  keys = (keys + event.key.toUpperCase()).slice(-3);
  if (keys === 'YES') {
    keys = '';
    message('ДА. Секретное подтверждение.');
    if (!reduced.matches && title.animate) {
      const target = mode === 'film' ? acts[currentAct].querySelector('.act-inner') : title;
      target.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.55)', transform: 'scale(1.025)' }, { filter: 'brightness(1)' }], 710);
    }
    fx('impact');
  } else if (keys.endsWith('NO')) {
    keys = '';
    message('Данная функция не поддерживается.');
  }
});

sound.addEventListener('click', () => {
  if (soundEnabled) {
    allowSound = false;
    soundEnabled = false;
    if (mode === 'manual') pauseAmbient();
    for (const clip of effects.values()) clip.pause();
  } else {
    allowSound = true;
    if (mode === 'film') {
      if (audioClock) {
        soundEnabled = true;
        fx('start');
      } else if (!wantsAudioClock) playScore();
    } else playAmbient();
  }
  updateSound();
  wake();
});

function unlockAmbient(event) {
  if (event.target.closest?.('#sound, #play, #replay')) return;
  playAmbient();
}

document.addEventListener('click', unlockAmbient, { capture: true });
document.addEventListener('pointerup', unlockAmbient, { passive: true, capture: true });
document.addEventListener('keydown', unlockAmbient, { capture: true });
$('#play').addEventListener('click', startFilm);
$('#replay').addEventListener('click', startFilm);
$('#skip').addEventListener('click', finishFilm);
$('#enough').addEventListener('click', finishFilm);
$('#doubt').addEventListener('click', () => {
  const index = Math.min(doubts++, 3);
  if (index === 3) {
    body.classList.remove('alert');
    void body.offsetWidth;
    body.classList.add('alert');
    excite('red');
    fx('final');
  } else fx('start');
  message(doubtMessages[index], index === 3 ? 4200 : 2900);
});
$('#share').addEventListener('click', () => shareUrl(new URL(location.pathname + location.search, location.href).href));
$('#link-open').addEventListener('click', () => {
  buildUrl();
  $('#dialog-status').textContent = '';
  dialog.showModal();
  question.focus();
});
question.addEventListener('input', buildUrl);
$('#copy').addEventListener('click', () => copyUrl(buildUrl()));
$('#send').addEventListener('click', () => shareUrl(buildUrl()));

const incoming = new URLSearchParams(location.search).get('q')?.trim();
if (incoming) {
  const label = $('#question');
  label.textContent = incoming.slice(0, 180);
  label.hidden = false;
  question.value = label.textContent;
}

$$('.tagline, .scene-note, .final-line, .tech p').forEach(element => prepareText(element));
body.classList.add('js');
requestAnimationFrame(() => {
  hero.classList.add('opening');
  if (hero.getBoundingClientRect().bottom > 0) {
    const mobile = matchMedia('(max-width: 850px) and (orientation: portrait), (max-width: 600px)').matches;
    excite('cover', { x: innerWidth * (mobile ? .5 : .72), y: innerHeight * (mobile ? .27 : .43) });
  }
});
for (const selector of ['#hero-actions', '#final-actions', '#tech-tabs', '#sound', '#link-open']) $(selector).hidden = false;
showTech(0);
manualIndex.hidden = false;
updateSound();
resize();
playAmbient();
