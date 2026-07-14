/* ============================================================
   AXRIK — Main JS
   - Nav scroll behaviour
   - Mobile menu toggle
   - Scroll reveal animations
   - Contact form handling
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Nav: scroll to solid ──────────────────────────────────
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 20) {
        nav.classList.add('scrolled');
      } else {
        // Only un-solid on the home page (nav starts transparent)
        if (!nav.classList.contains('scrolled-permanent')) {
          nav.classList.remove('scrolled');
        }
      }
    };
    // Inner pages start solid permanently
    if (document.body.contains(document.querySelector('.page-hero'))) {
      nav.classList.add('scrolled-permanent', 'scrolled');
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  // ── Mobile menu ───────────────────────────────────────────
  const toggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const bars = toggle.querySelectorAll('span');
      if (navLinks.classList.contains('open')) {
        bars[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        bars[1].style.opacity = '0';
        bars[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        bars[0].style.transform = '';
        bars[1].style.opacity = '';
        bars[2].style.transform = '';
      }
    });
    // Close on link click
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        toggle.querySelectorAll('span').forEach(b => {
          b.style.transform = '';
          b.style.opacity = '';
        });
      });
    });
  }

  // ── Scroll reveal ─────────────────────────────────────────
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px 120px 0px' });

    reveals.forEach(el => {
      // Anything on (or near) the first screen shows immediately —
      // the hero must never wait for an animation.
      if (el.getBoundingClientRect().top < window.innerHeight * 1.1) {
        el.classList.add('visible');
      } else {
        observer.observe(el);
      }
    });
  }

  // ── Smooth scroll for anchor links ────────────────────────
  document.querySelectorAll('a[href*="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      // Only handle same-page anchors
      if (href.startsWith('#') || href.includes(window.location.pathname.split('/').pop() + '#')) {
        const id = href.split('#')[1];
        const target = document.getElementById(id);
        if (target) {
          e.preventDefault();
          const navHeight = document.getElementById('nav')?.offsetHeight || 68;
          const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    });
  });

  // ── Contact / enquiry form ────────────────────────────────
  // Saves every enquiry to Supabase (the system of record) and fires a
  // best-effort email alert to Phil via FormSubmit. Falls back to mailto if the DB save
  // genuinely fails, so an enquiry is never silently lost.
  const form = document.getElementById('contactForm');
  const success = document.getElementById('formSuccess');
  if (form && success) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Honeypot — if the hidden field is filled, it's a bot. Pretend success.
      const bot = form.querySelector('[name="bot-field"]');
      if (bot && bot.value.trim() !== '') {
        form.style.display = 'none';
        success.style.display = 'block';
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;

      const name     = form.querySelector('[name="name"]').value.trim();
      const business = form.querySelector('[name="business"]').value.trim();
      const email    = form.querySelector('[name="email"]').value.trim();
      const message  = form.querySelector('[name="message"]').value.trim();

      // Minimal client-side validation (DB has CHECK constraints too).
      if (!name || !email || !message) {
        form.reportValidity();
        return;
      }

      btn.innerHTML = 'Sending…';
      btn.disabled = true;

      try {
        if (!window.db) throw new Error('Supabase client not initialised');

        // 1) System of record: store the enquiry.
        const { error } = await window.db.from('enquiries').insert({
          name,
          business: business || null,
          email,
          message,
          source: 'website',
          user_agent: navigator.userAgent
        });
        if (error) throw error;

        // 2) Best-effort email alert via our Netlify function (Resend) —
        //    never block success on this; the enquiry is already saved.
        try {
          const mailRes = await fetch('/.netlify/functions/notify-enquiry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, business, email, message })
          });
          if (!mailRes.ok) {
            console.warn('Enquiry saved, but email alert failed (non-critical):', mailRes.status);
          }
        } catch (mailErr) {
          console.warn('Enquiry saved, but email alert failed (non-critical):', mailErr);
        }

        form.style.display = 'none';
        success.style.display = 'block';

      } catch (err) {
        // Real failure to save — fall back to mailto so the lead isn't lost.
        console.error('Enquiry save failed, falling back to mailto:', err);
        btn.innerHTML = originalText;
        btn.disabled = false;
        const subject = `AXRIK enquiry from ${name}`;
        const body = `${message}\n\nFrom: ${name}\nBusiness: ${business || '—'}\nEmail: ${email}`;
        window.location.href =
          `mailto:phil@axrik.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
    });
  }

});
