/* Stillwater House — dependency-free interactions and stay planning. */
(() => {
  'use strict';

  const DAY = 86400000;
  const STORAGE_KEY = 'stillwater-stay-v1';
  const ROOMS = Object.freeze({
    garden: {
      name: 'The Garden Room', rate: 260, maxGuests: 2,
      description: 'A quiet room opening onto your own planted courtyard. Wake to light through the pines, step out with a coffee, and let the morning find its own shape. Natural linen, warm timber, and the sort of bed that makes a second lie-in a very good idea.',
      amenities: ['38 m² of space', 'King-size bed', 'Private courtyard', 'Rain shower', 'Breakfast included', 'Coffee, tea & Wi-Fi'],
      photos: [
        {src: 'assets/garden.webp', alt: 'The Garden Room with a king bed and open doors to a planted courtyard'},
        {src: 'assets/coast.webp', alt: 'The wild Atlantic coastline that inspires life at Stillwater House'}
      ]
    },
    atlantic: {
      name: 'The Atlantic Suite', rate: 390, maxGuests: 4,
      description: 'Open the doors and let the Atlantic in. A generous suite with a private terrace, its own plunge pool, and a view you may never get around to leaving. There’s a king bed, a separate daybed arrangement for two more, and space for everyone to slow down.',
      amenities: ['62 m² of space', 'King bed & daybed', 'Private plunge pool', 'Sea-facing terrace', 'Breakfast included', 'Coffee, tea & Wi-Fi'],
      photos: [
        {src: 'assets/suite.webp', alt: 'The Atlantic Suite with a king bed and private ocean-facing plunge pool'},
        {src: 'assets/hero.webp', alt: 'Stillwater House and the shared pool looking out to sea at dusk'}
      ]
    }
  });

  // Dates use UTC calendar arithmetic, so daylight-saving changes never add a night.
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  }
  function addDays(iso, days) {
    const date = parseDate(iso);
    return date ? new Date(date.getTime() + days * DAY).toISOString().slice(0, 10) : '';
  }
  function nightsBetween(arrival, departure) {
    const start = parseDate(arrival), end = parseDate(departure);
    return start && end ? Math.round((end - start) / DAY) : 0;
  }
  function validateStay(stay, today = todayISO()) {
    const errors = [];
    const arrival = parseDate(stay.arrival), departure = parseDate(stay.departure);
    if (!arrival) errors.push('Choose a valid arrival date.');
    else if (stay.arrival <= today) errors.push('Choose an arrival date from tomorrow onwards.');
    if (!departure) errors.push('Choose a valid departure date.');
    if (arrival && departure) {
      const nights = nightsBetween(stay.arrival, stay.departure);
      if (nights < 1) errors.push('Departure must be after arrival.');
      else if (nights > 30) errors.push('Choose up to 30 nights for this stay plan.');
    }
    if (!Object.hasOwn(ROOMS, stay.room)) errors.push('Choose one of our two rooms.');
    const guests = Number(stay.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > (ROOMS[stay.room]?.maxGuests || 0)) {
      errors.push(stay.room === 'garden' ? 'The Garden Room welcomes up to 2 guests. Choose the Atlantic Suite for 3 or 4.' : 'Choose between 1 and 4 guests.');
    }
    if (typeof stay.note === 'string' && stay.note.length > 600) errors.push('Keep your note under 600 characters.');
    return errors;
  }
  function estimateStay(stay) {
    const room = ROOMS[stay.room];
    const nights = nightsBetween(stay.arrival, stay.departure);
    const guests = Number(stay.guests);
    if (!room || nights < 1 || nights > 30 || !Number.isInteger(guests) || guests < 1 || guests > room.maxGuests) return null;
    const extraGuests = Math.max(0, guests - 2);
    const nightly = room.rate + extraGuests * 45;
    return {nights, nightly, extraGuests, total: nightly * nights};
  }
  const euros = amount => new Intl.NumberFormat('en-IE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(amount);
  const prettyDate = value => {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(date) : '';
  };
  function planText(stay) {
    const estimate = estimateStay(stay);
    if (!estimate) throw new Error('A valid stay plan is required.');
    return [
      'STILLWATER HOUSE', 'Your time away', '',
      `Room: ${ROOMS[stay.room].name}`,
      `Arrive: ${prettyDate(stay.arrival)} (check-in from 15:00)`,
      `Depart: ${prettyDate(stay.departure)} (check-out by 11:00)`,
      `Nights: ${estimate.nights}`, `Guests: ${Number(stay.guests)}`, '',
      `Indicative room total: ${euros(estimate.total)}`,
      `Nightly room rate: ${euros(ROOMS[stay.room].rate)}`,
      ...(estimate.extraGuests ? [`Additional guests: ${estimate.extraGuests} × €45 × ${estimate.nights} nights`] : []),
      'Breakfast included. Local taxes and final terms are confirmed separately.', '',
      'A note for the house:', stay.note?.trim() || 'No additional notes.', '',
      'This is a personal enquiry brief, not a confirmed reservation.',
      'Nothing has been sent, charged, or reserved. The property and rates are illustrative.',
      'Stillwater House is an original hospitality concept.'
    ].join('\n');
  }
  function calendarText(stay, now = new Date()) {
    const estimate = estimateStay(stay);
    if (!estimate) throw new Error('A valid stay plan is required.');
    const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const escapeICS = value => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const fold = line => {
      const parts = [];
      let current = '', bytes = 0;
      for (const char of line) {
        const point = char.codePointAt(0);
        const size = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
        if (bytes + size > 74) { parts.push(current); current = ' '; bytes = 1; }
        current += char;
        bytes += size;
      }
      parts.push(current);
      return parts.join('\r\n');
    };
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Stillwater House//Stay Planner//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', `UID:stillwater-${stay.arrival}-${now.getTime()}@stay-plan.local`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${stay.arrival.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${stay.departure.replace(/-/g, '')}`,
      'SUMMARY:Stillwater House — tentative stay plan', 'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT',
      `DESCRIPTION:${escapeICS(`${ROOMS[stay.room].name}, ${estimate.nights} nights, ${stay.guests} guests. Indicative total ${euros(estimate.total)}. A personal plan only; no reservation has been made.`)}`,
      'END:VEVENT', 'END:VCALENDAR', ''
    ].map(fold).join('\r\n');
  }

  // The same pure calculations are available to the source-level verification script.
  if (typeof module === 'object' && module.exports) module.exports = {ROOMS, parseDate, addDays, nightsBetween, validateStay, estimateStay, planText, calendarText};
  if (typeof document === 'undefined') return;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selectedRoom = 'garden';
  let galleryIndex = 0;
  let createdPlan = null;
  let animationFrame = 0;
  let rhythmTimer;
  function showDialog(dialog) {
    closeMobileNav(false);
    $$('dialog[open]').forEach(open => open.close());
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.classList.add('modal-open');
    syncHeroPlayback();
  }
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => {
      if (!$('dialog[open]')) document.body.classList.remove('modal-open');
      syncHeroPlayback();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

  const menuToggle = $('.menu-toggle');
  const mobileNav = $('#mobile-nav');
  function closeMobileNav(restoreFocus = false) {
    if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
    mobileNav.hidden = true;
    $('.site-header').classList.remove('menu-open');
    if (restoreFocus) menuToggle.focus();
  }
  menuToggle.addEventListener('click', () => {
    const opening = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(opening));
    menuToggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    mobileNav.hidden = !opening;
    $('.site-header').classList.toggle('menu-open', opening);
  });
  $$('#mobile-nav a').forEach(link => link.addEventListener('click', () => closeMobileNav(false)));
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMobileNav(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#mobile-nav').hidden) closeMobileNav(true); });
  window.addEventListener('resize', () => { if (window.innerWidth > 1000) closeMobileNav(false); }, {passive: true});

  function renderGallery() {
    const room = ROOMS[selectedRoom];
    const photo = room.photos[galleryIndex];
    const img = $('#room-dialog-image');
    img.src = photo.src;
    img.alt = photo.alt;
    $('#gallery-count').textContent = `${galleryIndex + 1} / ${room.photos.length}`;
  }
  function openRoom(key) {
    if (!Object.hasOwn(ROOMS, key)) return;
    selectedRoom = key;
    galleryIndex = 0;
    const room = ROOMS[key];
    $('#room-dialog-title').textContent = room.name;
    $('#room-dialog-description').textContent = room.description;
    const list = $('#room-dialog-amenities');
    list.replaceChildren();
    room.amenities.forEach(amenity => {
      const item = document.createElement('li');
      item.innerHTML = '<svg aria-hidden="true"><use href="#i-check"/></svg>';
      item.append(document.createTextNode(amenity));
      list.append(item);
    });
    $('#room-dialog-price').innerHTML = `From <strong>${euros(room.rate)}</strong> per night, including breakfast`;
    renderGallery();
    showDialog($('#room-dialog'));
  }
  $$('[data-room]').forEach(button => button.addEventListener('click', () => openRoom(button.dataset.room)));
  function changeGallery(direction) {
    galleryIndex = (galleryIndex + direction + ROOMS[selectedRoom].photos.length) % ROOMS[selectedRoom].photos.length;
    renderGallery();
  }
  $('#gallery-prev').addEventListener('click', () => changeGallery(-1));
  $('#gallery-next').addEventListener('click', () => changeGallery(1));
  $('#room-dialog').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      changeGallery(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  const rhythm = {
    morning: {time: '08:30, or whenever', heading: 'First light.<br>Second coffee.', description: 'Wake to the sound of the coast. There’s fresh bread, local fruit, and coffee worth lingering over. Breakfast goes at your pace.', image: 'assets/suite.webp', alt: 'Morning light through the open doors of the Atlantic Suite', caption: 'No alarm required.', action: 'At the Stillwater table', type: 'menu'},
    afternoon: {time: '14:00, no particular plans', heading: 'Take the<br>long way.', description: 'Follow the dunes down to the water. Walk until you find your stretch of sand. Or stay by the pool with the book you’ve been meaning to finish.', image: 'assets/coast.webp', alt: 'Atlantic waves rolling onto an empty Portuguese beach', caption: 'A whole afternoon, all yours.', action: 'A little more of the coast', type: 'coast'},
    evening: {time: '19:30, one more glass', heading: 'Nowhere else<br>to be.', description: 'The light softens. The table fills. Something fresh from the sea, a bottle worth sharing, and a conversation that runs a little longer than planned.', image: 'assets/table.webp', alt: 'A candlelit table overlooking the Atlantic with grilled fish and wine', caption: 'Stay for the last light.', action: 'A taste of the coast', type: 'menu'}
  };
  let rhythmAction = 'menu';
  function selectRhythm(key, focusTab = false) {
    if (!Object.hasOwn(rhythm, key)) return;
    const data = rhythm[key];
    const panel = $('#rhythm-panel');
    const update = () => {
      $('#rhythm-photo').src = data.image;
      $('#rhythm-photo').alt = data.alt;
      $('#rhythm-caption').textContent = data.caption;
      $('#rhythm-time').textContent = data.time;
      $('#rhythm-heading').innerHTML = data.heading;
      $('#rhythm-description').textContent = data.description;
      $('#rhythm-action').innerHTML = `${data.action} <svg aria-hidden="true"><use href="#i-arrow"/></svg>`;
      rhythmAction = data.type;
      $('.rhythm-image').classList.remove('is-changing');
    };
    $$('.rhythm-tabs [role=tab]').forEach(tab => {
      const active = tab.dataset.rhythm === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focusTab) tab.focus();
    });
    panel.setAttribute('aria-labelledby', `tab-${key}`);
    clearTimeout(rhythmTimer);
    if (motionPreference.matches) update();
    else { $('.rhythm-image').classList.add('is-changing'); rhythmTimer = setTimeout(update, 160); }
  }
  const rhythmTabs = $$('.rhythm-tabs [role=tab]');
  rhythmTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectRhythm(tab.dataset.rhythm));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % rhythmTabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + rhythmTabs.length) % rhythmTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = rhythmTabs.length - 1;
      else return;
      event.preventDefault();
      selectRhythm(rhythmTabs[next].dataset.rhythm, true);
    });
  });
  // This action is separate from the other menu triggers because its destination changes with the selected tab.
  $('#rhythm-action').removeAttribute('data-menu');
  $('#rhythm-action').addEventListener('click', () => {
    if (rhythmAction === 'coast') $('#the-coast').scrollIntoView({behavior: motionPreference.matches ? 'instant' : 'smooth'});
    else showDialog($('#menu-dialog'));
  });
  $$('[data-menu]').forEach(button => button.addEventListener('click', () => showDialog($('#menu-dialog'))));

  const minimum = addDays(todayISO(), 1);
  const initial = {arrival: addDays(todayISO(), 30), departure: addDays(todayISO(), 33), room: 'garden', guests: 2, note: ''};
  let saved = null;
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (data && typeof data === 'object' && validateStay(data).length === 0) saved = data;
  } catch { /* Private browsing and file:// storage may be unavailable; planning still works. */ }
  const starting = saved || initial;
  ['#quick-arrival', '#plan-arrival'].forEach(selector => { $(selector).min = minimum; $(selector).value = starting.arrival; });
  ['#quick-departure', '#plan-departure'].forEach(selector => { $(selector).min = addDays(starting.arrival, 1); $(selector).value = starting.departure; });
  $('#quick-guests').value = String(starting.guests);
  $('#plan-guests').value = String(starting.guests);
  $('#plan-room').value = starting.room;
  $('#plan-note').value = typeof starting.note === 'string' ? starting.note.slice(0, 600) : '';

  function readPlan() {
    return {arrival: $('#plan-arrival').value, departure: $('#plan-departure').value, room: $('#plan-room').value, guests: Number($('#plan-guests').value), note: $('#plan-note').value.trim()};
  }
  function updateEstimate() {
    const stay = readPlan();
    const estimate = estimateStay(stay);
    $('#estimate-detail').textContent = estimate ? `${estimate.nights} ${estimate.nights === 1 ? 'night' : 'nights'} · ${stay.guests} ${stay.guests === 1 ? 'guest' : 'guests'}` : 'Choose your dates and guests';
    $('#estimate-room').textContent = ROOMS[stay.room]?.name || 'Choose a room';
    $('#estimate-total').textContent = estimate ? euros(estimate.total) : '—';
    $('#plan-error').hidden = true;
  }
  function keepDepartureValid(arrival, departure) {
    departure.min = addDays(arrival.value, 1) || minimum;
    if (parseDate(arrival.value) && (!parseDate(departure.value) || departure.value <= arrival.value)) departure.value = addDays(arrival.value, 3);
  }
  $('#quick-arrival').addEventListener('change', () => keepDepartureValid($('#quick-arrival'), $('#quick-departure')));
  $('#plan-arrival').addEventListener('change', () => { keepDepartureValid($('#plan-arrival'), $('#plan-departure')); updateEstimate(); });
  $('#plan-departure').addEventListener('change', updateEstimate);
  $('#plan-room').addEventListener('change', updateEstimate);
  $('#plan-guests').addEventListener('change', () => {
    if (Number($('#plan-guests').value) > 2) $('#plan-room').value = 'atlantic';
    updateEstimate();
  });

  function openPlanner(roomKey) {
    if (roomKey && Object.hasOwn(ROOMS, roomKey)) {
      $('#plan-room').value = roomKey;
      if (Number($('#plan-guests').value) > ROOMS[roomKey].maxGuests) $('#plan-guests').value = '2';
    }
    $('#planner-form').hidden = false;
    $('#plan-success').hidden = true;
    $('.planner-lead').hidden = false;
    updateEstimate();
    showDialog($('#planner-dialog'));
  }
  $$('[data-book]').forEach(button => button.addEventListener('click', () => openPlanner()));
  $('#room-choose').addEventListener('click', () => openPlanner(selectedRoom));
  $('#menu-plan').addEventListener('click', () => openPlanner());
  $('#quick-plan').addEventListener('submit', event => {
    event.preventDefault();
    const arrival = $('#quick-arrival').value;
    const departure = $('#quick-departure').value;
    const guests = Number($('#quick-guests').value);
    $('#plan-arrival').value = arrival;
    $('#plan-departure').value = departure;
    $('#plan-departure').min = addDays(arrival, 1);
    $('#plan-guests').value = String(guests);
    if (guests > 2) $('#plan-room').value = 'atlantic';
    openPlanner();
    const errors = validateStay(readPlan());
    if (errors.length) { $('#plan-error').textContent = errors[0]; $('#plan-error').hidden = false; }
  });
  $('#planner-form').addEventListener('submit', event => {
    event.preventDefault();
    const stay = readPlan();
    const errors = validateStay(stay);
    if (errors.length) {
      $('#plan-error').textContent = errors.join(' ');
      $('#plan-error').hidden = false;
      $('#plan-error').scrollIntoView({block: 'nearest'});
      return;
    }
    createdPlan = stay;
    let stored = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stay)); stored = true; } catch { /* Downloads remain available when storage is blocked. */ }
    const estimate = estimateStay(stay);
    $('#plan-success-summary').textContent = `${ROOMS[stay.room].name}. ${prettyDate(stay.arrival)} to ${prettyDate(stay.departure)}. ${estimate.nights} ${estimate.nights === 1 ? 'night' : 'nights'} for ${stay.guests}, with breakfast. Indicative room total: ${euros(estimate.total)}.`;
    $('#plan-success .price-note').textContent = `${stored ? 'Your plan is saved on this device.' : 'Download your plan to keep a copy.'} Nothing has been sent, charged, or reserved.`;
    $('#planner-form').hidden = true;
    $('.planner-lead').hidden = true;
    $('#plan-success').hidden = false;
    $('#download-plan').focus({preventScroll: true});
    $('#planner-dialog').scrollTop = 0;
    $('#quick-arrival').value = stay.arrival;
    $('#quick-departure').value = stay.departure;
    $('#quick-departure').min = addDays(stay.arrival, 1);
    $('#quick-guests').value = String(stay.guests);
  });
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  $('#download-plan').addEventListener('click', () => {
    if (createdPlan) download(planText(createdPlan), `Stillwater-Stay-Plan-${createdPlan.arrival}.txt`, 'text/plain;charset=utf-8');
  });
  $('#download-calendar').addEventListener('click', () => {
    if (createdPlan) download(calendarText(createdPlan), `Stillwater-Dates-${createdPlan.arrival}.ics`, 'text/calendar;charset=utf-8');
  });
  $('#edit-plan').addEventListener('click', () => {
    $('#planner-form').hidden = false;
    $('.planner-lead').hidden = false;
    $('#plan-success').hidden = true;
    $('#plan-arrival').focus();
  });
  $$('[data-privacy]').forEach(button => button.addEventListener('click', () => showDialog($('#privacy-dialog'))));
  $('#clear-plan').addEventListener('click', () => {
    let cleared = false;
    try { localStorage.removeItem(STORAGE_KEY); cleared = true; } catch { /* Report unavailable storage accurately. */ }
    createdPlan = null;
    $('#plan-note').value = '';
    $('#plan-arrival').value = $('#quick-arrival').value = initial.arrival;
    $('#plan-departure').value = $('#quick-departure').value = initial.departure;
    $('#plan-departure').min = $('#quick-departure').min = addDays(initial.arrival, 1);
    $('#plan-room').value = initial.room;
    $('#plan-guests').value = $('#quick-guests').value = '2';
    updateEstimate();
    $('#privacy-status').textContent = cleared ? 'Your saved stay plan has been cleared from this browser.' : 'Browser storage is unavailable. The current plan has been cleared from this page.';
  });
  updateEstimate();
  $('#year').textContent = String(new Date().getFullYear());

  // #top belongs to the in-flow hero, not the fixed masthead. Keep the
  // native anchor fallback and explicitly scroll for fixed-header browsers.
  $$('a[href="#top"]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    closeMobileNav(false);
    window.scrollTo({top: 0, left: 0, behavior: motionPreference.matches ? 'instant' : 'smooth'});
    $('#hero-heading').focus({preventScroll: true});
  }));

  // Reveal only when motion is allowed. Never hide content if the observer is unavailable.
  function enableMotion() {
    if (motionPreference.matches || !('IntersectionObserver' in window)) {
      document.documentElement.classList.remove('has-motion');
      return;
    }
    document.documentElement.classList.add('has-motion');
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, {threshold: 0.1, rootMargin: '0px 0px -25px 0px'});
    $$('.reveal,.image-reveal').forEach(element => revealObserver.observe(element));
  }
  enableMotion();
  motionPreference.addEventListener?.('change', enableMotion);
  const header = $('.site-header');
  const hero = $('.hero');
  const heroScenes = [
    {lines: ['Let the world', 'wait a while.'], description: 'Salt on your skin. Space in your day.<br>A small coastal house to call your own.', action: 'Step inside the house', href: '#the-house', label: 'The house at dusk', detail: 'A room with a view', detailSub: 'The Atlantic Suite', detailLabel: 'Explore the Atlantic Suite'},
    {lines: ['Wake slowly.', 'Stay a little.'], description: 'Open doors. Ocean air.<br>Some mornings are worth keeping to yourself.', action: 'Find your room', href: '#rooms', label: 'Your room by the Atlantic', detail: 'Make this your morning', detailSub: 'Look inside the suite', detailLabel: 'Look inside the Atlantic Suite'},
    {lines: ['A little wild.', 'All yours.'], description: 'Follow the dunes. Find your stretch of sand.<br>Leave the afternoon wide open.', action: 'Follow the coastline', href: '#the-coast', label: 'The open Atlantic coast', detail: 'Take the long way', detailSub: 'Explore the coast', detailLabel: 'Explore the Atlantic coast'}
  ];
  const heroImages = $$('.hero-scene');
  const heroStories = $$('.hero-story');
  const heroFilm = $('#hero-film');
  // A short opening movement settles into a still. Scene changes are manual.
  const HERO_MOTION_DURATION = 4800;
  let heroSceneIndex = 0;
  let heroElapsed = 0;
  let heroLastTime = 0;
  let heroFrame = 0;
  let heroVisible = true;
  let heroMotionStopped = false;
  let heroCopyTimer;
  let heroCleanupTimer;
  let pointerFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let heroFilmPending = false;
  let heroFilmFailed = false;
  let heroFilmDesired = false;
  let heroFilmRetry = false;
  hero.dataset.activeScene = '0';

  if (heroFilm) {
    heroFilm.addEventListener('playing', () => {
      if (heroSceneIndex === 0 && heroShouldPlay()) heroFilm.classList.add('is-ready');
      else heroFilm.pause();
    });
    heroFilm.addEventListener('error', () => {
      heroFilmFailed = true;
      heroFilmPending = false;
      heroFilm.classList.remove('is-ready');
    });
  }
  function syncHeroFilm(playing) {
    if (!heroFilm) return;
    const wantsFilm = playing && heroSceneIndex === 0 && !heroFilmFailed && !navigator.connection?.saveData;
    const previouslyWanted = heroFilmDesired;
    heroFilmDesired = wantsFilm;
    if (!wantsFilm) {
      heroFilmRetry = false;
      if (heroFilmPending || !heroFilm.paused) heroFilm.pause();
      return;
    }
    if (heroFilmPending) {
      if (!previouslyWanted) heroFilmRetry = true;
      return;
    }
    if (!heroFilm.paused) return;
    // Setting src only here avoids a video download for reduced-motion or
    // data-saving visitors. The image remains a full visual fallback.
    if (!heroFilm.getAttribute('src')) heroFilm.src = heroFilm.dataset.videoSrc;
    heroFilm.muted = true;
    heroFilm.playsInline = true;
    heroFilmPending = true;
    heroFilmRetry = false;
    const result = heroFilm.play();
    if (result && typeof result.then === 'function') {
      result.catch(() => heroFilm.classList.remove('is-ready')).finally(() => {
        heroFilmPending = false;
        if (heroFilmRetry && heroFilmDesired && heroShouldPlay()) {
          heroFilmRetry = false;
          syncHeroFilm(true);
        }
      });
    } else heroFilmPending = false;
  }

  function heroShouldPlay() {
    return !heroMotionStopped && !motionPreference.matches && heroVisible && !document.hidden && !$('dialog[open]');
  }
  function syncHeroPlayback() {
    const playing = heroShouldPlay();
    syncHeroFilm(playing);
    hero.classList.toggle('is-paused', !playing);
    if (playing && !heroFrame) {
      heroLastTime = performance.now();
      heroFrame = requestAnimationFrame(tickHero);
    } else if (!playing && heroFrame) {
      cancelAnimationFrame(heroFrame);
      heroFrame = 0;
    }
  }
  function tickHero(now) {
    heroFrame = 0;
    if (!heroShouldPlay()) { syncHeroPlayback(); return; }
    heroElapsed += Math.max(0, Math.min(now - heroLastTime, 100));
    heroLastTime = now;
    if (heroElapsed >= HERO_MOTION_DURATION) {
      heroMotionStopped = true;
      syncHeroPlayback();
      return;
    }
    heroFrame = requestAnimationFrame(tickHero);
  }
  function selectHeroScene(index) {
    if (index < 0 || index >= heroScenes.length) return;
    if (index === heroSceneIndex) return;
    clearTimeout(heroCopyTimer);
    clearTimeout(heroCleanupTimer);
    hero.classList.add('has-entered');
    hero.classList.add('is-copy-changing');
    const previous = heroSceneIndex;
    heroSceneIndex = index;
    heroMotionStopped = false;
    heroElapsed = 0;
    hero.dataset.activeScene = String(index);
    syncHeroFilm(heroShouldPlay());
    heroImages.forEach((image, position) => {
      image.classList.toggle('is-leaving', position === previous);
      image.classList.toggle('is-active', position === index);
      image.setAttribute('aria-hidden', String(position !== index));
    });
    heroStories.forEach((button, position) => button.setAttribute('aria-pressed', String(position === index)));
    const scene = heroScenes[index];
    const updateCopy = () => {
      const lines = $$('#hero-heading .hero-line>span');
      lines.forEach((line, position) => { line.textContent = scene.lines[position]; });
      $('#hero-description').innerHTML = scene.description;
      $('#hero-cta-label').textContent = scene.action;
      $('#hero-cta').setAttribute('href', scene.href);
      $('#hero-detail').setAttribute('aria-label', scene.detailLabel);
      $('#hero-detail .hero-detail-copy').replaceChildren(document.createTextNode(scene.detail));
      const subtitle = document.createElement('span');
      subtitle.textContent = scene.detailSub;
      $('#hero-detail .hero-detail-copy').append(subtitle);
      hero.classList.remove('is-copy-changing');
      $('#hero-scene-status').textContent = scene.label;
    };
    if (motionPreference.matches) updateCopy();
    else heroCopyTimer = setTimeout(updateCopy, 290);
    heroCleanupTimer = setTimeout(() => heroImages.forEach(image => image.classList.remove('is-leaving')), motionPreference.matches ? 0 : 1600);
    syncHeroPlayback();
  }
  heroStories.forEach((button, index) => {
    button.addEventListener('click', () => selectHeroScene(index));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % heroStories.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + heroStories.length) % heroStories.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = heroStories.length - 1;
      else return;
      event.preventDefault();
      selectHeroScene(next);
      heroStories[next].focus();
    });
  });
  hero.addEventListener('focusin', event => {
    if (event.target.matches(':focus-visible')) {
      heroMotionStopped = true;
      syncHeroPlayback();
    }
  });
  $('#hero-detail').addEventListener('click', () => {
    if (heroSceneIndex === 2) $('#the-coast').scrollIntoView({behavior: motionPreference.matches ? 'instant' : 'smooth'});
    else openRoom('atlantic');
  });
  hero.addEventListener('pointermove', event => {
    if (motionPreference.matches || heroMotionStopped || event.pointerType === 'touch' || window.innerWidth < 1000) return;
    const bounds = hero.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - .5) * 12;
    pointerY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - .5) * 8;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
      hero.style.setProperty('--hero-pan-x', `${pointerX.toFixed(2)}px`);
      hero.style.setProperty('--hero-pan-y', `${pointerY.toFixed(2)}px`);
      pointerFrame = 0;
    });
  }, {passive: true});
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--hero-pan-x', '0px');
    hero.style.setProperty('--hero-pan-y', '0px');
  }, {passive: true});
  if ('IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      syncHeroPlayback();
    }, {threshold: .08});
    heroObserver.observe(hero);
  }
  document.addEventListener('visibilitychange', syncHeroPlayback);
  motionPreference.addEventListener?.('change', syncHeroPlayback);
  setTimeout(() => hero.classList.add('has-entered'), motionPreference.matches ? 0 : 2100);
  syncHeroPlayback();

  const coastPhoto = $('[data-scroll-photo]');
  function paintScroll() {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 65);
    if (!motionPreference.matches) {
      if (y < hero.offsetHeight + 120) hero.style.setProperty('--hero-y', `${-12 + Math.min(y * .06, 30)}px`);
      if (coastPhoto) {
        const bounds = coastPhoto.parentElement.getBoundingClientRect();
        if (bounds.top < window.innerHeight && bounds.bottom > 0) {
          const progress = Math.max(0, Math.min((window.innerHeight - bounds.top) / (window.innerHeight + bounds.height), 1));
          coastPhoto.style.setProperty('--coast-y', `${-20 - progress * 60}px`);
        }
      }
    }
    animationFrame = 0;
  }
  window.addEventListener('scroll', () => { if (!animationFrame) animationFrame = requestAnimationFrame(paintScroll); }, {passive: true});
  paintScroll();
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        $$('.desktop-nav a').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
      });
    }, {rootMargin: '-15% 0px -55% 0px', threshold: 0});
    $$('#the-house,#rooms,#life,#the-coast').forEach(section => sectionObserver.observe(section));
  }
})();
