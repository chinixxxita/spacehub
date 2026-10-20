(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('reduce-motion', reduceMotion);

  document.querySelectorAll('[data-motion]').forEach((el, index) => {
    el.style.setProperty('--motion-delay', `${Math.min(index * 90, 260)}ms`);
    if (!reduceMotion) el.classList.add('motion-ready');
  });

  // Animate dashboard counters from zero to their server-rendered values.
  // The target is stored in data-count so the displayed value stays correct
  // even when JavaScript is disabled or the animation is interrupted.
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;

    if (reduceMotion || target === 0) {
      el.textContent = String(target);
      return;
    }

    const duration = 650;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  requestAnimationFrame(() => {
    document.querySelectorAll('[data-motion]').forEach(el => el.classList.add('motion-visible'));
  });

  document.querySelectorAll('.login-form, .register-form').forEach(form => {
    form.addEventListener('submit', () => {
      const button = form.querySelector('button[type="submit"]');
      if (!button || button.disabled) return;
      button.disabled = true;
      button.classList.add('is-submitting');
      button.dataset.originalText = button.textContent.trim();
      button.textContent = 'Please wait…';
    });
  });

  document.querySelectorAll('.primary, .hero-primary, .hero-secondary, .landing-login, .calendar-nav').forEach(button => {
    button.addEventListener('pointerdown', () => button.classList.add('pressing'));
    ['pointerup', 'pointerleave', 'blur'].forEach(eventName => {
      button.addEventListener(eventName, () => button.classList.remove('pressing'));
    });
  });

  document.querySelectorAll('.flash').forEach(flash => {
    window.setTimeout(() => {
      flash.classList.add('flash-fade');
      window.setTimeout(() => flash.remove(), 260);
    }, 5000);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') document.body.classList.add('keyboard-user');
  }, { once: true });
})();
