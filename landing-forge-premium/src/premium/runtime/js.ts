/**
 * JavaScript de la landing exportada. Vanilla, sin dependencias.
 * Se inyecta al final del `<body>` y lee la configuración de `window.__LF__`.
 */

export function buildJs(): string {
  return `
(function () {
  'use strict';
  var CFG = window.__LF__ || {};
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function cop(n) {
    n = Math.round(Number(n) || 0);
    return '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 }).replace(/,/g, '.');
  }

  /* ---------------------------------------------------------------- */
  /* Meta Pixel                                                        */
  /* ---------------------------------------------------------------- */
  var firedOnce = {};
  function track(event, params, once, eventId) {
    if (once) { if (firedOnce[event]) return; firedOnce[event] = true; }
    try {
      if (typeof window.fbq === 'function') {
        if (eventId) window.fbq('track', event, params || {}, { eventID: eventId });
        else window.fbq('track', event, params || {});
      }
    } catch (e) {}
    if (CFG.debug) console.log('[LF] pixel', event, params || {}, eventId || '');
  }
  window.lfTrack = track;

  /* ---------------------------------------------------------------- */
  /* Atribución: utm_* y fbclid                                        */
  /* ---------------------------------------------------------------- */
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid'];
  function cookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return m ? decodeURIComponent(m[2]) : '';
    } catch (e) { return ''; }
  }
  function readAttribution() {
    var out = {};
    var qs;
    try { qs = new URLSearchParams(window.location.search); } catch (e) { qs = null; }
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem('lf_attr') || '{}'); } catch (e) {}
    ATTR_KEYS.forEach(function (k) {
      var v = qs ? qs.get(k) : null;
      if (v) { out[k] = v; } else if (stored[k]) { out[k] = stored[k]; }
    });
    out.referrer = document.referrer || stored.referrer || '';
    out.landingUrl = window.location.href;
    // Cookies que pone el propio Pixel: permiten emparejar el evento del
    // servidor con el del navegador.
    var fbp = cookie('_fbp'); if (fbp) out.fbp = fbp;
    var fbc = cookie('_fbc'); if (fbc) out.fbc = fbc;
    try { sessionStorage.setItem('lf_attr', JSON.stringify(out)); } catch (e) {}
    return out;
  }
  var ATTRIBUTION = readAttribution();

  /* ---------------------------------------------------------------- */
  /* Aparición al hacer scroll                                         */
  /* ---------------------------------------------------------------- */
  (function reveal() {
    var items = $$('.lf-reveal');
    if (!items.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ---------------------------------------------------------------- */
  /* Galería con swipe, puntos y miniaturas                            */
  /* ---------------------------------------------------------------- */
  $$('[data-lf-gallery]').forEach(function (gal) {
    var track = $('.lf-gallery__track', gal);
    if (!track) return;
    var slides = $$('.lf-gallery__slide', track);
    var dots = $$('.lf-gallery__dot', gal);
    var thumbs = $$('.lf-thumb', gal);
    var current = 0;

    function setActive(i) {
      current = Math.max(0, Math.min(slides.length - 1, i));
      dots.forEach(function (d, k) { d.setAttribute('aria-current', k === current ? 'true' : 'false'); });
      thumbs.forEach(function (t, k) { t.setAttribute('aria-current', k === current ? 'true' : 'false'); });
    }
    function goTo(i) {
      var s = slides[Math.max(0, Math.min(slides.length - 1, i))];
      if (!s) return;
      track.scrollTo({ left: s.offsetLeft - track.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
      setActive(i);
    }
    var ticking = false;
    track.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var mid = track.scrollLeft + track.clientWidth / 2;
        var best = 0, bestD = Infinity;
        slides.forEach(function (s, i) {
          var c = s.offsetLeft - track.offsetLeft + s.clientWidth / 2;
          var d = Math.abs(c - mid);
          if (d < bestD) { bestD = d; best = i; }
        });
        setActive(best);
        ticking = false;
      });
    }, { passive: true });

    dots.forEach(function (d, i) { d.addEventListener('click', function () { goTo(i); }); });
    thumbs.forEach(function (t, i) { t.addEventListener('click', function () { goTo(i); }); });
    var prev = $('.lf-gallery__nav--prev', gal);
    var next = $('.lf-gallery__nav--next', gal);
    if (prev) prev.addEventListener('click', function () { goTo(current - 1); });
    if (next) next.addEventListener('click', function () { goTo(current + 1); });
    setActive(0);
  });

  /* ---------------------------------------------------------------- */
  /* Acordeón animado                                                  */
  /* ---------------------------------------------------------------- */
  $$('[data-lf-acc]').forEach(function (acc) {
    var items = $$('.lf-acc__item', acc);
    items.forEach(function (item) {
      var btn = $('.lf-acc__btn', item);
      var panel = $('.lf-acc__panel', item);
      if (!btn || !panel) return;
      btn.addEventListener('click', function () {
        var open = item.classList.contains('is-open');
        if (acc.getAttribute('data-lf-acc') === 'single') {
          items.forEach(function (o) {
            if (o === item) return;
            o.classList.remove('is-open');
            var p = $('.lf-acc__panel', o);
            var b = $('.lf-acc__btn', o);
            if (p) p.style.height = '0px';
            if (b) b.setAttribute('aria-expanded', 'false');
          });
        }
        if (open) {
          panel.style.height = panel.scrollHeight + 'px';
          void panel.offsetHeight;
          panel.style.height = '0px';
          item.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
          panel.style.height = panel.scrollHeight + 'px';
          window.setTimeout(function () {
            if (item.classList.contains('is-open')) panel.style.height = 'auto';
          }, 320);
        }
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Selector de paquetes                                              */
  /* ---------------------------------------------------------------- */
  var selected = (CFG.bundles || []).filter(function (b) { return b.highlight; })[0] || (CFG.bundles || [])[0] || null;

  function currentUnitPrice() { return selected ? selected.price : (CFG.price || 0); }
  function currentQty() { return selected ? selected.qty : 1; }

  function syncOffer() {
    var total = currentUnitPrice();
    var qty = currentQty();
    $$('[data-lf-total]').forEach(function (el) { el.textContent = cop(total); });
    $$('[data-lf-qty]').forEach(function (el) { el.textContent = String(qty); });
    $$('[data-lf-pack-label]').forEach(function (el) { el.textContent = selected ? selected.label : (CFG.productName || ''); });
    var qtyInput = $('[name="quantity"]');
    if (qtyInput) qtyInput.value = String(qty);
    var bundleInput = $('[name="bundleId"]');
    if (bundleInput) bundleInput.value = selected ? selected.id : '';
  }

  $$('[data-lf-bundle]').forEach(function (el) {
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-lf-bundle');
      var found = (CFG.bundles || []).filter(function (b) { return b.id === id; })[0];
      if (!found) return;
      selected = found;
      $$('[data-lf-bundle]').forEach(function (o) { o.classList.toggle('is-active', o === el); });
      var radio = $('input', el);
      if (radio) radio.checked = true;
      syncOffer();
    });
    if (selected && el.getAttribute('data-lf-bundle') === selected.id) {
      el.classList.add('is-active');
      var r = $('input', el);
      if (r) r.checked = true;
    }
  });
  syncOffer();

  /* ---------------------------------------------------------------- */
  /* Barra de compra fija                                              */
  /* ---------------------------------------------------------------- */
  (function sticky() {
    var bar = $('[data-lf-sticky]');
    var anchor = $('[data-lf-sticky-anchor]');
    var float = $('.lf-wa-float');
    if (!bar) return;
    document.body.classList.add('has-sticky');
    function setVisible(v) {
      bar.classList.toggle('is-visible', v);
      if (float) float.classList.toggle('is-raised', v);
    }
    if (!anchor || !('IntersectionObserver' in window)) { setVisible(true); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { setVisible(!e.isIntersecting && e.boundingClientRect.top < 0); });
    }, { threshold: 0 });
    io.observe(anchor);
  })();

  /* ---------------------------------------------------------------- */
  /* Cuenta regresiva hacia una fecha REAL                             */
  /* ---------------------------------------------------------------- */
  (function countdown() {
    var box = $('[data-lf-countdown]');
    if (!box) return;
    var deadline = new Date(box.getAttribute('data-lf-countdown'));
    if (isNaN(deadline.getTime())) { box.style.display = 'none'; return; }
    var dd = $('[data-cd="d"]', box), hh = $('[data-cd="h"]', box), mm = $('[data-cd="m"]', box), ss = $('[data-cd="s"]', box);
    function pad(n) { return String(n).padStart(2, '0'); }
    function tick() {
      var diff = deadline.getTime() - Date.now();
      if (diff <= 0) {
        // Nada de reinicios: cuando se acaba, se acaba.
        var wrap = box.closest('[data-lf-countdown-wrap]') || box;
        wrap.style.display = 'none';
        window.clearInterval(timer);
        return;
      }
      var s = Math.floor(diff / 1000);
      if (dd) dd.textContent = pad(Math.floor(s / 86400));
      if (hh) hh.textContent = pad(Math.floor((s % 86400) / 3600));
      if (mm) mm.textContent = pad(Math.floor((s % 3600) / 60));
      if (ss) ss.textContent = pad(s % 60);
    }
    tick();
    var timer = window.setInterval(tick, 1000);
  })();

  /* ---------------------------------------------------------------- */
  /* Ciudades dependientes del departamento                            */
  /* ---------------------------------------------------------------- */
  (function geo() {
    var dep = $('[name="department"]');
    var city = $('[name="city"]');
    if (!dep || !city) return;
    var MAP = CFG.cities || {};
    dep.addEventListener('change', function () {
      var list = MAP[dep.value] || [];
      city.innerHTML = '<option value="">' + (list.length ? 'Selecciona tu ciudad' : 'Elige primero el departamento') + '</option>';
      list.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c; o.textContent = c;
        city.appendChild(o);
      });
      city.disabled = !list.length;
    });
  })();

  /* ---------------------------------------------------------------- */
  /* Scroll al formulario + InitiateCheckout                           */
  /* ---------------------------------------------------------------- */
  function scrollToForm(e) {
    var target = $('#pedido');
    if (!target) return;
    if (e) e.preventDefault();
    track('InitiateCheckout', {
      content_ids: [String(CFG.productId)],
      content_name: CFG.productName,
      content_type: 'product',
      value: currentUnitPrice(),
      currency: CFG.currency || 'COP',
      num_items: currentQty()
    }, true);
    var top = target.getBoundingClientRect().top + window.pageYOffset - 12;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    window.setTimeout(function () {
      var first = $('#lf-name');
      if (first && window.innerWidth >= 900) first.focus({ preventScroll: true });
    }, reduce ? 0 : 520);
  }
  $$('[data-lf-scroll="form"]').forEach(function (el) { el.addEventListener('click', scrollToForm); });

  $$('[data-lf-wa]').forEach(function (el) {
    el.addEventListener('click', function () {
      track('Contact', { content_name: CFG.productName, value: currentUnitPrice(), currency: CFG.currency || 'COP' });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Validación y envío del pedido                                     */
  /* ---------------------------------------------------------------- */
  var form = $('[data-lf-form]');
  if (form) {
    var VALIDATORS = {
      name: function (v) {
        if (!v.trim()) return 'Escribe tu nombre completo';
        if (v.trim().split(/\\s+/).length < 2) return 'Escribe nombre y apellido';
        return '';
      },
      phone: function (v) {
        var d = v.replace(/\\D/g, '');
        if (!d) return 'Escribe tu número de celular';
        if (d.length !== 10) return 'El celular debe tener 10 dígitos';
        if (d.charAt(0) !== '3') return 'En Colombia los celulares empiezan por 3';
        return '';
      },
      department: function (v) { return v ? '' : 'Selecciona tu departamento'; },
      city: function (v) { return v ? '' : 'Selecciona tu ciudad'; },
      address: function (v) {
        if (!v.trim()) return 'Escribe tu dirección';
        if (v.trim().length < 8) return 'Escribe la dirección completa (calle, número, apto)';
        return '';
      },
      neighborhood: function (v) { return v.trim() ? '' : 'Escribe tu barrio'; }
    };

    function fieldError(name, msg) {
      var input = form.querySelector('[name="' + name + '"]');
      var box = form.querySelector('[data-error="' + name + '"]');
      if (box) box.textContent = msg || '';
      if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    Object.keys(VALIDATORS).forEach(function (name) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      input.addEventListener('blur', function () { fieldError(name, VALIDATORS[name](input.value || '')); });
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') fieldError(name, VALIDATORS[name](input.value || ''));
      });
    });

    var phoneInput = form.querySelector('[name="phone"]');
    if (phoneInput) {
      phoneInput.addEventListener('input', function () {
        var d = phoneInput.value.replace(/\\D/g, '').slice(0, 10);
        phoneInput.value = d;
      });
    }

    var started = false;
    form.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('InitiateCheckout', {
        content_ids: [String(CFG.productId)],
        content_name: CFG.productName,
        value: currentUnitPrice(),
        currency: CFG.currency || 'COP'
      }, true);
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var data = {};
      var firstBad = null;
      Object.keys(VALIDATORS).forEach(function (name) {
        var input = form.querySelector('[name="' + name + '"]');
        var value = input ? input.value || '' : '';
        data[name] = value.trim();
        var msg = VALIDATORS[name](value);
        fieldError(name, msg);
        if (msg && !firstBad) firstBad = input;
      });
      if (firstBad) {
        firstBad.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        firstBad.focus({ preventScroll: true });
        return;
      }

      var notesEl = form.querySelector('[name="notes"]');
      data.notes = notesEl ? notesEl.value.trim() : '';

      var variant = null;
      $$('[data-lf-variant]', form).forEach(function (sel) {
        if (!sel.value) return;
        variant = variant || {};
        variant[sel.getAttribute('data-lf-variant')] = sel.value;
      });

      var qty = currentQty();
      var total = currentUnitPrice();
      var order = {
        landingSlug: CFG.slug,
        productId: CFG.productId,
        productName: CFG.productName,
        quantity: qty,
        bundleId: selected ? selected.id : null,
        variant: variant,
        total: total,
        currency: CFG.currency || 'COP',
        customer: {
          name: data.name, phone: data.phone, department: data.department,
          city: data.city, address: data.address, neighborhood: data.neighborhood, notes: data.notes
        },
        attribution: ATTRIBUTION,
        createdAt: new Date().toISOString()
      };

      /* 1. WhatsApp primero: tiene que salir dentro del gesto del usuario */
      var lines = [
        'Hola, quiero confirmar mi pedido: ' + CFG.productName + ' x' + qty + ' – ' + cop(total) + '.',
        'Nombre: ' + data.name,
        'Celular: ' + data.phone,
        'Ciudad: ' + data.city + ' (' + data.department + ')',
        'Dirección: ' + data.address,
        'Barrio: ' + data.neighborhood
      ];
      if (variant) {
        Object.keys(variant).forEach(function (k) { lines.push(k + ': ' + variant[k]); });
      }
      if (data.notes) lines.push('Indicaciones: ' + data.notes);
      if (ATTRIBUTION.utm_campaign) lines.push('Campaña: ' + ATTRIBUTION.utm_campaign);
      var waUrl = 'https://wa.me/' + (CFG.whatsapp || '') + '?text=' + encodeURIComponent(lines.join('\\n'));
      if (!CFG.preview) window.open(waUrl, '_blank', 'noopener');

      /* 2. Resumen y página de gracias */
      var thanks = $('[data-lf-thanks]');
      var panel = $('[data-lf-form-panel]');
      if (thanks) {
        var sum = $('[data-lf-thanks-summary]', thanks);
        if (sum) {
          sum.innerHTML =
            '<div class="lf-summary__row"><span>Producto</span><strong>' + escapeHtml(CFG.productName) + '</strong></div>' +
            '<div class="lf-summary__row"><span>Cantidad</span><strong>' + qty + '</strong></div>' +
            (variant ? Object.keys(variant).map(function (k) {
              return '<div class="lf-summary__row"><span>' + escapeHtml(k) + '</span><strong>' + escapeHtml(variant[k]) + '</strong></div>';
            }).join('') : '') +
            '<div class="lf-summary__row"><span>Envío</span><strong>' + (CFG.freeShipping ? 'Gratis' : 'Según ciudad') + '</strong></div>' +
            '<div class="lf-summary__row"><span>Entrega</span><strong>' + escapeHtml(data.address) + ', ' + escapeHtml(data.city) + '</strong></div>' +
            '<div class="lf-summary__row lf-summary__row--total"><span>Total a pagar al recibir</span><strong>' + cop(total) + '</strong></div>';
        }
        thanks.classList.add('is-visible');
        if (panel) panel.style.display = 'none';
        thanks.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }
      var stickyBar = $('[data-lf-sticky]');
      if (stickyBar) stickyBar.classList.remove('is-visible');

      /* 3. Pixel (con event_id compartido para deduplicar con la CAPI) */
      var eventId = (CFG.slug || 'lf') + '_' + order.createdAt;
      track(CFG.conversionEvent || 'Lead', {
        content_ids: [String(CFG.productId)],
        content_name: CFG.productName,
        content_type: 'product',
        value: total,
        currency: CFG.currency || 'COP',
        num_items: qty
      }, false, eventId);

      /* 4. Pedido al servidor + Conversions API */
      if (!CFG.preview) {
        // Si la landing la sirve la app, el pedido pasa por el relé y la URL
        // del webhook nunca aparece en el HTML. En el HTML exportado se manda
        // directo al webhook configurado.
        var orderUrl = CFG.orderEndpoint || CFG.webhookUrl;
        if (orderUrl) {
          try {
            fetch(orderUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(CFG.orderEndpoint ? { order: order } : order),
              keepalive: true
            }).catch(function () {});
          } catch (e) {}
        }
      }
      if (CFG.capiEndpoint && !CFG.preview) {
        try {
          fetch(CFG.capiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: order,
              event: CFG.conversionEvent || 'Lead',
              pixelId: CFG.pixelId,
              eventId: eventId
            }),
            keepalive: true
          }).catch(function () {});
        } catch (e) {}
      }
      try { localStorage.setItem('lf_last_order', JSON.stringify(order)); } catch (e) {}
      if (window.parent !== window) {
        try { window.parent.postMessage({ source: 'landing-forge', type: 'order', order: order }, '*'); } catch (e) {}
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------- */
  /* ViewContent al cargar                                             */
  /* ---------------------------------------------------------------- */
  track('ViewContent', {
    content_ids: [String(CFG.productId)],
    content_name: CFG.productName,
    content_type: 'product',
    content_category: CFG.category,
    value: CFG.price,
    currency: CFG.currency || 'COP'
  }, true);
})();
`.trim();
}

/**
 * Editor en línea: solo se inyecta en la vista previa del panel.
 * Hace editables los textos marcados con `data-lf-edit` y avisa al panel
 * por postMessage para que actualice el copy del documento.
 */
export function buildInlineEditor(): string {
  return `
(function () {
  'use strict';
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-lf-edit]'));
  if (!nodes.length) return;

  var style = document.createElement('style');
  style.textContent = [
    '[data-lf-edit]{outline:1px dashed transparent;outline-offset:4px;border-radius:3px;transition:outline-color .15s,background-color .15s;cursor:text}',
    '[data-lf-edit]:hover{outline-color:color-mix(in srgb,var(--lf-accent) 70%,transparent);background:color-mix(in srgb,var(--lf-accent) 7%,transparent)}',
    '[data-lf-edit]:focus{outline:2px solid var(--lf-accent);background:color-mix(in srgb,var(--lf-accent) 9%,transparent)}'
  ].join('');
  document.head.appendChild(style);

  function send(field, value) {
    try {
      window.parent.postMessage({ source: 'landing-forge', type: 'copy-edit', field: field, value: value }, '*');
    } catch (e) {}
  }

  nodes.forEach(function (el) {
    var field = el.getAttribute('data-lf-edit');
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('title', 'Clic para editar: ' + field);

    el.addEventListener('focus', function () {
      try { window.parent.postMessage({ source: 'landing-forge', type: 'copy-focus', field: field }, '*'); } catch (e) {}
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.blur(); }
      e.stopPropagation();
    });
    el.addEventListener('blur', function () {
      send(field, (el.textContent || '').trim());
    });
    el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
  });

  // En la vista previa, los enlaces no navegan.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#') return;
    e.preventDefault();
  }, true);
})();
`.trim();
}

/** Snippet del Meta Pixel (base + PageView). */
export function buildPixelSnippet(pixelId: string): string {
  return `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
`.trim();
}
