/* Nacional Marcenaria e Carpintaria — interações sem dependências.
   Movimento reduzido desliga parallax e carrossel 3D; ?animacao=on força a pré-visualização. */
(() => {
  const forced = new URLSearchParams(location.search).get('animacao') === 'on';
  const reduce = !forced && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  if (!reduce) root.classList.add('js-motion');

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  $('#ano').textContent = new Date().getFullYear();

  /* Entrada da hero */
  const hero = $('.hero');
  requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-in')));

  /* Cabeçalho translúcido depois de rolar */
  const nav = $('.nav');
  const onNav = () => nav.classList.toggle('is-scrolled', scrollY > 24);
  onNav();
  addEventListener('scroll', onNav, { passive: true });

  /* Parallax da foto da hero */
  const heroImg = $('.hero__img');
  if (!reduce && heroImg) {
    let ticking = false;
    const par = () => {
      ticking = false;
      const h = hero.offsetHeight;
      if (scrollY > h) return;
      heroImg.style.transform = `translate3d(0, ${(scrollY / h) * 10}%, 0)`;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(par); } }, { passive: true });
  }

  /* Vídeo em loop na hero, só no celular.
     A foto carrega primeiro; o vídeo entra depois do load, com esmaecimento, e pausa fora da tela.
     Não roda com movimento reduzido nem com economia de dados. */
  const mobile = matchMedia('(max-width: 899px)');
  const saveData = navigator.connection && navigator.connection.saveData;
  let heroVideo = null;
  const mountVideo = () => {
    if (heroVideo || reduce || saveData || !mobile.matches || !heroImg) return;
    const v = heroVideo = document.createElement('video');
    v.className = 'hero__video';
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.preload = 'auto';
    v.src = '/video/area-gourmet-loop-9x16.mp4';
    v.addEventListener('playing', () => v.classList.add('is-on'), { once: true });
    heroImg.appendChild(v);
    new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: 0.1 }).observe(v);
  };
  if (document.readyState === 'complete') mountVideo(); else addEventListener('load', mountVideo);
  mobile.addEventListener('change', mountVideo);

  /* Cartões de ambiente pré-selecionam o formulário */
  const select = $('#form select[name="ambiente"]');
  $$('[data-ambiente]').forEach(a => a.addEventListener('click', () => { select.value = a.dataset.ambiente; }));

  /* ---------- Projetos ---------- */
  const PHOTOS = [
    ['area-gourmet-planejada-sorocaba', [480, 780], 'p', 'Área gourmet com churrasqueira, adega e frente ripada'],
    ['estante-sala-sob-medida', [480, 800, 1280], 'l', 'Estante de sala com nichos e portas'],
    ['rack-tv-madeira-sob-medida', [480, 800, 1280], 'l', 'Rack de TV em madeira'],
    ['deck-de-madeira-carpintaria-sorocaba', [480, 800, 1280], 'l', 'Deck de madeira em varanda'],
    ['closet-planejado-sorocaba', [480, 585], 'p', 'Closet com armários e gaveteiros'],
    ['guarda-roupa-planejado-branco', [480, 800, 1280], 'l', 'Guarda-roupa branco com portas de correr'],
    ['cozinha-planejada-ilha', [480, 592], 'l', 'Cozinha branca com ilha'],
    ['estante-painel-tv-marcenaria', [480, 800, 1200], 'p', 'Estante com painel de TV, na oficina'],
    ['fachada-brises-de-madeira', [480, 944], 'l', 'Fachada com painéis e brises de madeira'],
    ['movel-sob-medida-fabricacao', [480, 800, 1200], 'p', 'Móvel sob medida em fabricação'],
  ];
  const srcset = (n, ws) => ws.map(w => `/img/${n}-${w}.webp ${w}w`).join(', ');
  const track = $('#track');
  const carousel = $('.carousel');
  track.innerHTML = PHOTOS.map(([n, ws, o, cap], i) => `
    <li class="slide" data-i="${i}">
      <button type="button" aria-label="Ampliar foto: ${cap}">
        <div class="slide__img"><img loading="lazy" draggable="false" src="/img/${n}-480.webp" srcset="${srcset(n, ws)}"
          sizes="${o === 'l' ? '(min-width: 900px) 40vw, 72vw' : '(min-width: 900px) 24vw, 56vw'}" width="800" height="1000" alt="${cap}, projeto da Nacional Marcenaria e Carpintaria em Sorocaba"></div>
        <p class="slide__cap">${cap}</p>
      </button>
    </li>`).join('');
  const slides = $$('.slide', track);

  let moved = 0; // distância arrastada, para separar clique de arrasto
  let go = () => {};

  if (reduce) {
    carousel.classList.add('is-static');
    go = dir => track.scrollBy({ left: dir * (slides[0].offsetWidth + 20), behavior: 'auto' });
  } else {
    const DEG_PER_PX = 0.07;
    let S = 0, L = 0, pos = 0, vel = 0, target = 0, settling = false, dragging = false;
    let lastX = 0, lastT = 0, snapTimer = 0, visible = false, raf = 0, prev = performance.now();

    const measure = () => { S = slides[0].offsetWidth + Math.max(24, slides[0].offsetWidth * 0.12); L = S * slides.length; };
    measure();
    addEventListener('resize', measure);

    const render = () => {
      const w = carousel.clientWidth;
      const spin = clamp(vel * DEG_PER_PX * 6, -22, 22);
      slides.forEach((el, i) => {
        let x = ((i * S + pos) % L + L) % L;
        if (x > L / 2) x -= L;
        const t = clamp(x / (w * 0.55), -1, 1);
        const rot = -t * 24 + (settling && Math.abs(target - pos) < 0.5 ? 0 : spin);
        const z = -Math.abs(t) * 160;
        el.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${rot}deg)`;
        el.style.zIndex = String(100 - Math.round(Math.abs(t) * 50));
        el.style.opacity = String(1 - Math.abs(t) * 0.35);
      });
    };

    const snap = (projected = pos) => { target = Math.round(projected / S) * S; settling = true; };

    const tick = now => {
      const dt = Math.min(64, now - prev) / 16.667; // compensa o tempo do quadro (60/120/144 Hz)
      prev = now;
      if (settling && !dragging) {
        const d = target - pos;
        const nv = d * (1 - Math.pow(1 - 0.14, dt));
        pos += nv;
        vel = nv / dt;
        if (Math.abs(d) < 0.3) { pos = target; vel = 0; settling = false; }
      } else if (!dragging) {
        vel *= Math.pow(0.85, dt);
      }
      render();
      raf = (visible || dragging || settling) ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(tick); } };

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(carousel);
    render();

    carousel.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true; settling = false; moved = 0;
      lastX = e.clientX; lastT = performance.now();
      carousel.setPointerCapture(e.pointerId);
      carousel.classList.add('is-drag');
      wake();
    });
    carousel.addEventListener('pointermove', e => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      pos += dx; moved += Math.abs(dx);
      const frames = Math.max(1, (now - lastT) / 16.667);
      vel = vel * 0.6 + (dx / frames) * 0.4;
      lastX = e.clientX; lastT = now;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      carousel.classList.remove('is-drag');
      snap(pos + vel * 14);
      wake();
    };
    carousel.addEventListener('pointerup', end);
    carousel.addEventListener('pointercancel', end);

    // Trackpad horizontal (a roda vertical continua rolando a página)
    carousel.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      pos -= e.deltaX; vel = -e.deltaX * 0.5; settling = false; wake();
      clearTimeout(snapTimer); snapTimer = setTimeout(() => { snap(); wake(); }, 140);
    }, { passive: false });

    // A rolagem da página empurra a faixa enquanto ela está visível
    let lastY = scrollY;
    addEventListener('scroll', () => {
      const dy = scrollY - lastY; lastY = scrollY;
      if (!visible || dragging) return;
      pos -= dy * 0.5; vel = -dy * 0.3; settling = false; wake();
      clearTimeout(snapTimer); snapTimer = setTimeout(() => { snap(); wake(); }, 160);
    }, { passive: true });

    go = dir => { snap((settling ? target : pos) - dir * S); wake(); };
  }

  $$('.projects__ctrl [data-dir]').forEach(b => b.addEventListener('click', () => go(+b.dataset.dir)));
  carousel.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  /* Clique depois de arrasto não amplia (fase de captura) */
  track.addEventListener('click', e => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); } moved = 0; }, true);

  /* Foto ampliada */
  const lb = $('#lightbox');
  const lbImg = $('img', lb);
  const lbCap = $('.lightbox__cap', lb);
  let cur = 0;
  const show = i => {
    cur = (i + PHOTOS.length) % PHOTOS.length;
    const [n, ws, , cap] = PHOTOS[cur];
    lbImg.src = `/img/${n}-${ws[ws.length - 1]}.webp`;
    lbImg.srcset = srcset(n, ws);
    lbImg.sizes = '(min-width: 1100px) 1100px, 100vw';
    lbImg.alt = cap;
    lbCap.textContent = cap;
  };
  track.addEventListener('click', e => {
    const s = e.target.closest('.slide');
    if (!s) return;
    show(+s.dataset.i);
    lb.showModal();
  });
  lb.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || e.target === lb) lb.close();
    const st = e.target.closest('[data-step]');
    if (st) show(cur + +st.dataset.step);
  });
  lb.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') show(cur + 1);
    if (e.key === 'ArrowLeft') show(cur - 1);
  });

  /* ---------- Formulário ---------- */
  // WhatsApp da empresa: DDI + DDD + número.
  const WA = '551532232626';
  const FONE = '(15) 3223-2626';
  const form = $('#form');
  const msg = $('.form__msg', form);
  const waLink = d => 'https://wa.me/' + WA + '?text=' + encodeURIComponent(
    d ? 'Olá, vim pelo site e quero pedir um orçamento.\nNome: ' + d.nome + '\nAmbiente: ' + d.ambiente + (d.mensagem ? '\nMensagem: ' + d.mensagem : '')
      : 'Olá, vim pelo site e quero pedir um orçamento.');

  if (WA) {
    $$('[data-contact]').forEach(a => {
      a.href = waLink(); a.target = '_blank'; a.rel = 'noopener';
      $('span', a).textContent = 'Chamar no WhatsApp';
      a.setAttribute('aria-label', 'Pedir orçamento pelo WhatsApp');
    });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const digits = (d.telefone || '').replace(/\D/g, '');
    const bad = [];
    if ((d.nome || '').trim().length < 2) bad.push('nome');
    if (digits.length < 10 || digits.length > 13) bad.push('telefone');
    if (!d.ambiente) bad.push('ambiente');
    $$('input, select', form).forEach(el => el.removeAttribute('aria-invalid'));
    if (bad.length) {
      bad.forEach(n => form.elements[n].setAttribute('aria-invalid', 'true'));
      msg.className = 'form__msg is-err';
      msg.textContent = bad.includes('telefone') ? 'Informe o WhatsApp com DDD, por exemplo (15) 99999-9999.' : 'Preencha nome, WhatsApp e ambiente.';
      form.elements[bad[0]].focus();
      return;
    }
    msg.className = 'form__msg';
    msg.textContent = 'Enviando…';
    let sent = false;
    try {
      const r = await fetch('/api/orcamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      sent = r.ok;
      if (r.status === 429) { msg.className = 'form__msg is-err'; msg.textContent = 'Muitos pedidos em pouco tempo. Ligue para ' + FONE + '.'; return; }
    } catch { /* sem servidor */ }
    if (WA) {
      msg.textContent = 'Abrindo o WhatsApp para você enviar a mensagem…';
      const url = waLink(d); form.reset(); location.href = url;
    } else if (sent) {
      msg.textContent = 'Pedido recebido. Entraremos em contato pelo telefone informado.';
      form.reset();
    } else {
      msg.className = 'form__msg is-err';
      msg.textContent = 'Não foi possível enviar agora. Ligue para ' + FONE + '.';
    }
  });
})();
