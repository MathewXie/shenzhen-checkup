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

  /* package prices are stored in US dollars and shown in rupiah (same as usd() in ui.mjs) */
  function formatUsd(amount) {
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
    var pkg = findPackage(link.getAttribute('data-wa-package'));
    if (link.hasAttribute('data-wa-partner')) {
      lines.push(messages.partner);
    } else if (pkg) {
      lines.push(fill(messages.package, { P: pkg.label }));
      lines.push(fill(messages.group, { N: state.group }));
    } else {
      lines.push(messages.general);
    }
    if (link.hasAttribute('data-wa-therapies') && therapiesLine()) lines.push(therapiesLine());
    if (refLine()) lines.push(refLine());
    return lines.join('\n');
  }

  /* Without a WhatsApp number the links lead to the form, pre-filled with what was chosen. */
  function prefillForm(link) {
    var pkgId = link.getAttribute('data-wa-package');
    var select = $('#f-package');
    if (pkgId && select) select.value = pkgId;
    var note = $('#f-message');
    if (!note || note.value) return;
    if (link.hasAttribute('data-wa-therapies') && therapiesLine()) note.value = therapiesLine();
    if (link.hasAttribute('data-wa-partner')) note.value = messages.partner;
  }

  $all('[data-wa]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (data.wa) {
        track('whatsapp_click', {
          package: link.getAttribute('data-wa-package') || '',
          partner: link.hasAttribute('data-wa-partner'),
          group_size: state.group,
        });
        link.href = waUrl(messageFor(link));
        link.target = '_blank';
        link.rel = 'noopener';
      } else {
        prefillForm(link);
      }
    });
  });

  /* ---------- enquiry form: builds a WhatsApp draft, stores nothing ---------- */

  var form = $('[data-contact-form]');
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = $('#f-name', form);
      var status = $('[data-form-status]', form);
      var missing = !name.value.trim();
      name.classList.toggle('is-invalid', missing);
      name.setAttribute('aria-invalid', missing ? 'true' : 'false');
      if (missing) {
        name.focus();
        return;
      }
      var value = function (id) {
        var field = $(id, form);
        return field ? field.value.trim() : '';
      };
      var pkg = findPackage(value('#f-package'));
      var peopleField = $('#f-people', form);
      var peopleText = peopleField ? peopleField.options[peopleField.selectedIndex].text : '';
      var lines = [messages.formIntro, messages.formName + ': ' + value('#f-name')];
      if (value('#f-wa')) lines.push(messages.formWhatsapp + ': ' + value('#f-wa'));
      if (pkg) lines.push(messages.formPackage + ': ' + pkg.label);
      if (peopleText) lines.push(messages.formPeople + ': ' + peopleText);
      if (value('#f-date')) lines.push(messages.formDate + ': ' + value('#f-date'));
      if (therapiesLine() && value('#f-message').indexOf(therapiesLine()) === -1) lines.push(therapiesLine());
      if (value('#f-message')) lines.push(messages.formMessage + ': ' + value('#f-message'));
      if (refLine()) lines.push(refLine());

      if (!data.wa) {
        if (status) status.hidden = false;
        return;
      }
      if (status) status.hidden = true;
      track('enquiry_form', { package: pkg ? pkg.id : '', group_size: peopleField ? peopleField.value : '' });
      /* No link element and no click event here: the click listeners of measurement tools must
         never see this address, because it carries the visitor's name, number and message. */
      var url = waUrl(lines.join('\n'));
      var opened = null;
      try {
        opened = window.open(url, '_blank');
        if (opened) opened.opener = null;
      } catch (error) {
        opened = null;
      }
      if (!opened) window.location.href = url;
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
    link.addEventListener('click', function () {
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
})();
