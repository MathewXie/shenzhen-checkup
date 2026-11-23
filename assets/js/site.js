/* Small enhancements only: the page is complete and readable without this file. */
(function () {
  'use strict';

  var data = {};
  try {
    data = JSON.parse(document.getElementById('site-data').textContent);
  } catch (error) {
    data = {};
  }
  var messages = data.messages || {};
  var packages = data.packages || [];
  var state = { group: 1, therapies: [] };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function fill(text, vars) {
    return String(text || '').replace(/%(\w+)%/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
    });
  }

  function findPackage(id) {
    for (var i = 0; i < packages.length; i += 1) {
      if (packages[i].id === id) return packages[i];
    }
    return null;
  }

  function stored(kind, key, value) {
    /* sessionStorage / localStorage can be blocked; the site works without them */
    try {
      var store = window[kind];
      if (value === undefined) return store.getItem(key);
      store.setItem(key, value);
    } catch (error) {
      return null;
    }
    return value;
  }

  /* ---------- where the visitor came from (agent link or campaign) ----------
     A link such as  https://example.com/?ref=AGENT01  or one carrying utm_source
     is remembered for the visit and added as the last line of the WhatsApp
     message, so the team can see which agent or advert sent the enquiry. */

  function cleanTag(value) {
    return String(value || '').replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 40);
  }

  var refTag = (function () {
    var tag = '';
    try {
      var query = new URLSearchParams(window.location.search);
      tag = cleanTag(query.get('ref'));
      if (!tag) {
        tag = [cleanTag(query.get('utm_source')), cleanTag(query.get('utm_campaign'))]
          .filter(Boolean)
          .join('.');
      }
    } catch (error) {
      tag = '';
    }
    if (tag) stored('sessionStorage', 'ref-tag', tag);
    return tag || cleanTag(stored('sessionStorage', 'ref-tag'));
  })();

  function refLine() {
    return refTag && messages.ref ? fill(messages.ref, { R: refTag }) : '';
  }

  /* ---------- measurement (off unless IDs are configured and the visitor allows it) ---------- */

  var analytics = data.analytics || {};
  var analyticsConfigured = !!(analytics.ga4 || analytics.metaPixel || analytics.tiktokPixel);
  var analyticsRunning = false;

  function loadScript(src) {
    var script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  function startAnalytics() {
    if (analyticsRunning || !analyticsConfigured) return;
    analyticsRunning = true;
    if (analytics.ga4) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', analytics.ga4);
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(analytics.ga4));
    }
    if (analytics.metaPixel) {
      var fbq = function () {
        if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
        else fbq.queue.push(arguments);
      };
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      window.fbq = fbq;
      if (!window._fbq) window._fbq = fbq;
      loadScript('https://connect.facebook.net/en_US/fbevents.js');
      /* Only the events sent by track() below: no automatic capture of buttons, links or form fields. */
      fbq('set', 'autoConfig', false, analytics.metaPixel);
      fbq('init', analytics.metaPixel);
      fbq('track', 'PageView');
    }
    if (analytics.tiktokPixel) {
      var ttq = (window.ttq = window.ttq || []);
      var methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
      ttq.methods = methods;
      ttq.setAndDefer = function (target, method) {
        target[method] = function () {
          target.push([method].concat(Array.prototype.slice.call(arguments)));
        };
      };
      methods.forEach(function (method) {
        ttq.setAndDefer(ttq, method);
      });
      ttq.instance = function (pixelId) {
        var instance = ttq._i[pixelId] || [];
        methods.forEach(function (method) {
          ttq.setAndDefer(instance, method);
        });
        return instance;
      };
      window.TiktokAnalyticsObject = 'ttq';
      ttq._i = ttq._i || {};
      ttq._i[analytics.tiktokPixel] = [];
      ttq._i[analytics.tiktokPixel]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._t = ttq._t || {};
      ttq._t[analytics.tiktokPixel] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[analytics.tiktokPixel] = {};
      loadScript('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(analytics.tiktokPixel) + '&lib=ttq');
      ttq.page();
    }
  }

  /* One call records the same moment in every tool that is running. */
  function track(name, params) {
    if (!analyticsRunning) return;
    var details = params || {};
    if (refTag) details.ref = refTag;
    details.language = data.lang;
    var standard = { whatsapp_click: 'Contact', enquiry_form: 'Lead' }[name];
    if (window.gtag) window.gtag('event', name, details);
    if (window.fbq) {
      if (standard) window.fbq('track', standard, details);
      else window.fbq('trackCustom', name, details);
    }
    if (window.ttq && window.ttq.track) window.ttq.track(standard === 'Lead' ? 'SubmitForm' : standard || name, details);
  }

  var consent = $('[data-consent]');
  if (analyticsConfigured) {
    var choice = stored('localStorage', 'cookie-choice');
    if (choice === 'allow') startAnalytics();
    else if (choice !== 'decline' && consent) consent.hidden = false;
    if (consent) {
      consent.addEventListener('click', function (event) {
        var accept = event.target.closest('[data-consent-accept]');
        var decline = event.target.closest('[data-consent-decline]');
        if (!accept && !decline) return;
        stored('localStorage', 'cookie-choice', accept ? 'allow' : 'decline');
        consent.hidden = true;
        /* keep keyboard and screen-reader users at the content instead of dropping focus */
        var main = $('#main');
        if (main) {
          main.setAttribute('tabindex', '-1');
          main.focus({ preventScroll: true });
        }
        if (accept) startAnalytics();
        /* tools that are already running cannot be unloaded; a reload starts the page without them */
        else if (analyticsRunning) window.location.reload();
      });
      /* "Cookie settings" in the footer lets the visitor change the choice later */
      $all('[data-consent-open]').forEach(function (button) {
        button.hidden = false;
        button.addEventListener('click', function () {
          consent.hidden = false;
          var first = $('[data-consent-accept]', consent);
          if (first) first.focus();
        });
      });
    }
  }

  /* ---------- header ---------- */

  var header = $('[data-header]');
  function onScroll() {
    if (header) header.classList.toggle('is-stuck', window.scrollY > 8);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var menuButton = $('[data-menu-btn]');
  var nav = $('#site-nav');
  function setMenu(open) {
    if (!menuButton || !nav) return;
    nav.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (menuButton && nav) {
    menuButton.addEventListener('click', function () {
      setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });
  }

  /* ---------- group size: updates the three package prices ---------- */

  /* package prices are stored in US dollars: shown in dollars on English pages,
     in rupiah on Indonesian pages (same as usd() in ui.mjs) */
  function formatUsd(amount) {
    if (data.lang === 'en') return 'US$' + Math.round(Number(amount)).toLocaleString('en-US');
    return formatIdr(Number(amount) * (data.fx || 18000));
  }

  /* same rounding as formatIdr in src/templates/ui.mjs: to the nearest 0.1 million */
  function formatIdr(amount) {
    if (amount < 1e6) {
      var v = Math.round(amount / 1e4) * 1e4;
      if (data.lang === 'id') return 'Rp' + v.toLocaleString('id-ID');
      if (data.lang === 'zh') return v / 1e4 + ' 万印尼盾';
      return 'IDR ' + v.toLocaleString('en-US');
    }
    var millions = (Math.round(amount / 1e5) / 10).toFixed(1).replace(/\.0$/, '');
    if (data.lang === 'id') return 'Rp' + millions.replace('.', ',') + ' juta';
    if (data.lang === 'zh') return Math.round(amount / 1e5) * 10 + ' 万印尼盾';
    return 'IDR ' + millions + ' million';
  }

  function renderPrices() {
    var n = state.group;
    $all('[data-package]').forEach(function (card) {
      var pkg = findPackage(card.getAttribute('data-package'));
      if (!pkg) return;
      var total = $('[data-price-total]', card);
      var label = $('[data-price-label]', card);
      var each = $('[data-price-pp]', card);
      if (total) total.textContent = formatUsd(pkg.total[n]);
      if (label && data.totalLabels) label.textContent = data.totalLabels[n - 1];
      if (each) {
        each.hidden = n === 1;
        each.textContent = fill(data.perPersonPattern, { V: formatUsd(pkg.perPerson[n]) });
      }
      var rupiah = $('[data-price-idr]', card);
      if (rupiah && false) rupiah.textContent = fill(data.idrPattern, { V: formatIdr(pkg.total[n] * data.fx) });
    });
    $all('[data-group]').forEach(function (button) {
      button.setAttribute('aria-pressed', Number(button.getAttribute('data-group')) === n ? 'true' : 'false');
    });
    var people = $('#f-people');
    if (people && people.value !== '5+') people.value = String(n);
  }

  $all('[data-group]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.group = Number(button.getAttribute('data-group')) || 1;
      renderPrices();
      track('group_size', { group_size: state.group });
    });
  });

  /* ---------- TCM: choose any three of five ---------- */

  var pick = $('[data-pick]');
  function renderPick() {
    if (!pick) return;
    var chips = $all('[data-therapy]', pick);
    var full = state.therapies.length >= 3;
    chips.forEach(function (chip) {
      var chosen = state.therapies.indexOf(chip.getAttribute('data-therapy')) !== -1;
      chip.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      chip.disabled = full && !chosen;
    });
    var count = $('[data-pick-count]', pick);
    if (count) count.textContent = fill(data.pickCount, { N: state.therapies.length });
  }
  if (pick) {
    pick.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-therapy]');
      if (!chip || chip.disabled) return;
      var name = chip.getAttribute('data-therapy');
      var index = state.therapies.indexOf(name);
      if (index === -1) {
        if (state.therapies.length < 3) state.therapies.push(name);
      } else {
        state.therapies.splice(index, 1);
      }
      renderPick();
    });
    renderPick();
  }

  function therapiesLine() {
    return state.therapies.length ? fill(messages.therapies, { T: state.therapies.join(', ') }) : '';
  }

  /* ---------- WhatsApp links ---------- */

  function waUrl(text) {
    return 'https://wa.me/' + data.wa + '?text=' + encodeURIComponent(text);
  }

  function messageFor(link) {
    var lines = [];
    var pkg = findPackage(link && link.getAttribute('data-wa-package'));
    if (link && link.hasAttribute('data-wa-partner')) {
      lines.push(messages.partner);
    } else if (pkg) {
      lines.push(fill(messages.package, { P: pkg.label }));
      lines.push(fill(messages.group, { N: state.group }));
    } else {
      lines.push(messages.general);
    }
    if (link && link.hasAttribute('data-wa-therapies') && therapiesLine()) lines.push(therapiesLine());
    if (refLine()) lines.push(refLine());
    return lines.join('\n');
  }

  /* WeChat's built-in browser blocks wa.me links, so a tap there did nothing (team report 2026-11-20).
     Show how to continue instead: open the page in a browser, or copy the number. */
  var inWeChat = /MicroMessenger/i.test(navigator.userAgent || '');

  function showWeChatTip(share) {
    var old = $('.wx-tip');
    if (old) old.parentNode.removeChild(old);
    var number = data.waDisplay || ('+' + data.wa);
    var box = document.createElement('div');
    box.className = 'wx-tip';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    var panel = document.createElement('div');
    panel.className = 'wx-tip__panel';
    var title = document.createElement('p');
    title.className = 'wx-tip__title';
    title.textContent = messages.wxTitle || '';
    var text = document.createElement('p');
    text.textContent = (share ? messages.wxShareText : messages.wxText) || '';
    var num = document.createElement('p');
    num.className = 'wx-tip__number';
    num.textContent = number;
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--wa';
    copy.textContent = messages.wxCopy || 'Copy';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost';
    close.textContent = messages.wxClose || 'Close';
    var row = document.createElement('div');
    row.className = 'wx-tip__actions';
    row.appendChild(copy);
    row.appendChild(close);
    panel.appendChild(title);
    panel.appendChild(text);
    if (!share) panel.appendChild(num);
    else copy.hidden = true;
    panel.appendChild(row);
    box.appendChild(panel);
    document.body.appendChild(box);
    function done() {
      if (box.parentNode) box.parentNode.removeChild(box);
    }
    close.addEventListener('click', done);
    box.addEventListener('click', function (event) {
      if (event.target === box) done();
    });
    copy.addEventListener('click', function () {
      var ok = function () {
        copy.textContent = messages.wxCopied || 'Copied';
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(number).then(ok, function () {
            fallbackCopy(number);
            ok();
          });
          return;
        }
      } catch (error) {}
      fallbackCopy(number);
      ok();
    });
    track('whatsapp_blocked_wechat', {});
  }

  function fallbackCopy(value) {
    var area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } catch (error) {}
    document.body.removeChild(area);
  }

  /* Opens WhatsApp without a link element or click event, so the click listeners of
     measurement tools never see an address that may carry what the visitor typed. */
  function openWhatsApp(text) {
    if (inWeChat) {
      showWeChatTip();
      return;
    }
    var url = waUrl(text);
    var opened = null;
    try {
      opened = window.open(url, '_blank');
      if (opened) opened.opener = null;
    } catch (error) {
      opened = null;
    }
    if (!opened) window.location.href = url;
  }

  /* ---------- enquiry dialog: every contact button opens it ---------- */

  var dialog = $('[data-enquiry]');
  var form = $('[data-contact-form]');
  var sent = $('[data-enquiry-sent]');
  var trigger = null; /* the button that opened the dialog: decides the "just chat" message */

  function field(id) {
    return form ? $(id, form) : null;
  }

  function serviceValue() {
    var checked = form ? $('input[name="service"]:checked', form) : null;
    return checked ? checked.value : 'day';
  }

  function syncService() {
    var row = form ? $('[data-onestop-only]', form) : null;
    if (row) row.hidden = serviceValue() !== 'onestop';
  }

  function isoToday() {
    var now = new Date();
    var pad = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  /* 2027-01-15 -> "15 Januari 2027" / "15 January 2027" / "2027年1月15日" */
  function formatDay(iso) {
    var parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    var day = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    var locale = { id: 'id-ID', en: 'en-GB', zh: 'zh-CN' }[data.lang] || 'en-GB';
    try {
      return day.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch (error) {
      return iso;
    }
  }

  function setInvalid(input, errorId, invalid) {
    if (!input) return;
    input.classList.toggle('is-invalid', invalid);
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    var error = document.getElementById(errorId);
    if (error) error.hidden = !invalid;
  }

  /* what the button that was pressed already tells us */
  function prefillForm(link) {
    if (!form || !link) return;
    var pkgId = link.getAttribute('data-wa-package');
    var select = field('#f-package');
    if (pkgId && select) select.value = pkgId;
    if (link.hasAttribute('data-wa-onestop')) {
      var oneStop = $('input[name="service"][value="onestop"]', form);
      if (oneStop) oneStop.checked = true;
    }
    syncService();
    var note = field('#f-message');
    if (!note || note.value) return;
    if (link.hasAttribute('data-wa-therapies') && therapiesLine()) note.value = therapiesLine();
    if (link.hasAttribute('data-wa-partner')) note.value = messages.partner;
  }

  function setOpen(open) {
    document.documentElement.classList.toggle('has-dialog', open);
  }

  function openEnquiry(link) {
    trigger = link || null;
    prefillForm(link);
    if (form) form.hidden = false;
    if (sent) sent.hidden = true;
    var date = field('#f-date');
    if (date) date.min = isoToday();
    var status = form ? $('[data-form-status]', form) : null;
    if (status) status.hidden = true;
    var failedNote = form ? $('[data-form-failed]', form) : null;
    if (failedNote) failedNote.hidden = true;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    setOpen(true);
    track('enquiry_open', {
      package: (link && link.getAttribute('data-wa-package')) || '',
      one_stop: !!(link && link.hasAttribute('data-wa-onestop')),
    });
  }

  function closeEnquiry() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    setOpen(false);
  }

  $all('[data-wa]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (inWeChat && data.wa) {
        event.preventDefault();
        showWeChatTip();
        return;
      }
      if (dialog) {
        event.preventDefault();
        openEnquiry(link);
      } else if (data.wa) {
        /* pages without the dialog (the one-page summary) go straight to WhatsApp */
        track('whatsapp_click', { package: link.getAttribute('data-wa-package') || '', group_size: state.group });
        link.href = waUrl(messageFor(link));
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });
  });

  if (dialog) {
    $all('[data-enquiry-close]', dialog).forEach(function (button) {
      button.addEventListener('click', closeEnquiry);
    });
    /* a click on the dimmed backdrop closes it; the panel fills the whole dialog box */
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeEnquiry();
    });
    dialog.addEventListener('close', function () {
      setOpen(false);
    });

    /* "Rather just chat?": the short message the button itself would have sent */
    var directRow = $('[data-enquiry-direct-row]', dialog);
    var direct = $('[data-enquiry-direct]', dialog);
    if (directRow && direct && data.wa) {
      directRow.hidden = false;
      direct.addEventListener('click', function (event) {
        event.preventDefault();
        track('whatsapp_click', { package: (trigger && trigger.getAttribute('data-wa-package')) || '', direct: true });
        openWhatsApp(messageFor(trigger));
      });
    }

    /* a link to  ...#enquiry  (from an advert or a profile) opens the form straight away */
    if (window.location.hash === '#enquiry') openEnquiry(null);
  }

  /* ---------- enquiry form ----------
     With a Google Form set up (data.form) the answers are posted to it and the team replies
     on WhatsApp; otherwise they become a WhatsApp draft the visitor sends. */

  var googleForm = data.form && data.form.action ? data.form : null;
  var lastLines = []; /* the same answers as a WhatsApp message, for the fallback links */

  function showSent() {
    if (!sent) return;
    form.hidden = true;
    sent.hidden = false;
    var title = $('[data-enquiry-sent-title]', sent);
    if (title) title.focus();
  }

  /* fixed wording for the team's spreadsheet, whatever language the page is in */
  function formEntries(pkg, oneStop, value) {
    var peopleField = field('#f-people');
    var note = value('#f-message');
    if (therapiesLine() && note.indexOf(therapiesLine()) === -1) note = therapiesLine() + (note ? '\n' + note : '');
    var answers = {
      name: value('#f-name'),
      whatsapp: value('#f-wa'),
      package: pkg ? pkg.letter : '未定 Not sure',
      people: peopleField ? peopleField.value : '',
      date: value('#f-date'),
      service: oneStop ? '一条龙 One-stop (flights, hotel, visa)' : '只体检日 Check-up day only',
      from: oneStop ? value('#f-from') : '',
      message: note,
      lang: data.lang || '',
      ref: refTag || '',
    };
    var body = new URLSearchParams();
    Object.keys(googleForm.fields).forEach(function (key) {
      if (answers[key]) body.append(googleForm.fields[key], answers[key]);
    });
    return body;
  }

  if (form) {
    $all('input[name="service"]', form).forEach(function (radio) {
      radio.addEventListener('change', syncService);
    });
    syncService();

    var failed = $('[data-form-failed]', form);
    var fallback = $('[data-enquiry-fallback]', form);
    var faster = sent ? $('[data-enquiry-faster]', sent) : null;
    var fasterRow = sent ? $('[data-enquiry-faster-row]', sent) : null;
    [fallback, faster].forEach(function (link) {
      if (!link || !data.wa) return;
      if (link === faster && fasterRow) fasterRow.hidden = false;
      link.hidden = false;
      link.addEventListener('click', function (event) {
        event.preventDefault();
        track('whatsapp_click', { from_form: true });
        openWhatsApp(lastLines.join('\n'));
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = field('#f-name');
      var wa = field('#f-wa');
      var date = field('#f-date');
      var status = $('[data-form-status]', form);
      var noName = !name.value.trim();
      /* the team replies to this number, so with a Google Form it must look like one */
      var noNumber = !!googleForm && wa.value.replace(/\D/g, '').length < 8;
      var pastDate = !!(date && date.value && date.min && date.value < date.min);
      setInvalid(name, 'f-name-error', noName);
      if (googleForm) setInvalid(wa, 'f-wa-error', noNumber);
      setInvalid(date, 'f-date-error', pastDate);
      if (noName || noNumber || pastDate) {
        (noName ? name : noNumber ? wa : date).focus();
        return;
      }
      var value = function (id) {
        var input = field(id);
        return input ? input.value.trim() : '';
      };
      var pkg = findPackage(value('#f-package'));
      var peopleField = field('#f-people');
      var peopleText = peopleField ? peopleField.options[peopleField.selectedIndex].text : '';
      var oneStop = serviceValue() === 'onestop';
      var lines = [messages.formIntro, messages.formName + ': ' + value('#f-name')];
      if (value('#f-wa')) lines.push(messages.formWhatsapp + ': ' + value('#f-wa'));
      if (pkg) lines.push(messages.formPackage + ': ' + pkg.label);
      if (peopleText) lines.push(messages.formPeople + ': ' + peopleText);
      if (value('#f-date')) lines.push(messages.formDate + ': ' + formatDay(value('#f-date')));
      lines.push(messages.formService + ': ' + (oneStop ? messages.serviceOneStop : messages.serviceDay));
      if (oneStop && value('#f-from')) lines.push(messages.formFrom + ': ' + value('#f-from'));
      if (therapiesLine() && value('#f-message').indexOf(therapiesLine()) === -1) lines.push(therapiesLine());
      if (value('#f-message')) lines.push(messages.formMessage + ': ' + value('#f-message'));
      if (refLine()) lines.push(refLine());
      lastLines = lines;
      if (failed) failed.hidden = true;
      var details = {
        package: pkg ? pkg.id : '',
        group_size: peopleField ? peopleField.value : '',
        one_stop: oneStop,
        has_date: !!value('#f-date'),
      };

      if (googleForm) {
        var button = $('[data-submit]', form);
        var label = $('[data-submit-label]', form);
        var idle = label ? label.textContent : '';
        if (button) button.disabled = true;
        if (label && data.sending) label.textContent = data.sending;
        /* Google does not let other sites read its reply, so a sent request counts as
           delivered; only a network failure is reported. */
        fetch(googleForm.action, { method: 'POST', mode: 'no-cors', body: formEntries(pkg, oneStop, value) })
          .then(function () {
            track('enquiry_form', details);
            showSent();
          })
          .catch(function () {
            if (failed) failed.hidden = false;
          })
          .then(function () {
            if (button) button.disabled = false;
            if (label) label.textContent = idle;
          });
        return;
      }

      if (!data.wa) {
        if (status) status.hidden = false;
        return;
      }
      if (status) status.hidden = true;
      track('enquiry_form', details);
      openWhatsApp(lines.join('\n'));
      /* WhatsApp is open in another tab or app; the dialog says what happens next */
      showSent();
    });
  }

  /* ---------- send to family: a WhatsApp message carrying the page address ---------- */

  $all('[data-share]').forEach(function (link) {
    var address = '';
    try {
      var target = new URL(link.getAttribute('data-share-url') || '', window.location.href);
      /* a page opened from a folder on a computer has no address anyone else could open */
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return;
      target.hash = '';
      target.search = refTag ? '?ref=' + encodeURIComponent(refTag) : '';
      address = target.href;
    } catch (error) {
      return;
    }
    link.href = 'https://wa.me/?text=' + encodeURIComponent((data.shareMessage ? data.shareMessage + ' ' : '') + address);
    link.target = '_blank';
    link.rel = 'noopener';
    link.hidden = false;
    link.addEventListener('click', function (event) {
      if (inWeChat) {
        event.preventDefault();
        showWeChatTip(true);
        return;
      }
      track('share_whatsapp', {});
    });
  });

  /* ---------- package cards: the list of main examinations starts closed on phones ---------- */

  if (window.matchMedia && window.matchMedia('(max-width: 719px)').matches) {
    $all('[data-collapse-on-phone]').forEach(function (details) {
      details.removeAttribute('open');
    });
  }

  /* ---------- one-page summary ---------- */

  $all('[data-print]').forEach(function (button) {
    button.hidden = false;
    button.addEventListener('click', function () {
      track('summary_print', {});
      window.print();
    });
  });
  /* summary.html#image shows the sheet alone: tools/make-brochure.mjs photographs it that way */
  if ($('[data-sheet]') && window.location.hash === '#image') {
    document.documentElement.classList.add('is-image');
  }

  /* ---------- contact buttons that follow the visitor ----------
     The bar on phones and the floating button on wider screens step aside
     whenever a contact button of the page itself is already on screen. */

  function hideWhileVisible(element, targets) {
    if (!element) return;
    if (!targets.length || !('IntersectionObserver' in window)) {
      element.classList.remove('is-hidden');
      return;
    }
    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      element.classList.toggle('is-hidden', visible.size > 0);
    });
    targets.forEach(function (target) {
      observer.observe(target);
    });
  }

  hideWhileVisible($('[data-sticky-cta]'), [$('#contact'), $('.site-footer')].filter(Boolean));
  hideWhileVisible($('[data-fab]'), [$('.hero__cta'), $('#contact'), $('.site-footer')].filter(Boolean));

  /* ---------- TCM clinic clips: play (muted, looping) only while on screen ---------- */

  var clips = $all('[data-clip]');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  clips.forEach(function (video) {
    video.addEventListener('click', function () {
      if (video.paused) video.play().catch(function () {});
      else video.pause();
    });
  });
  if (clips.length && !reduceMotion && 'IntersectionObserver' in window) {
    var clipWatch = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.play().catch(function () {});
          else entry.target.pause();
        });
      },
      { threshold: 0.5 },
    );
    clips.forEach(function (video) {
      clipWatch.observe(video);
    });
  }
})();
