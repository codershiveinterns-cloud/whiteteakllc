(function () {
  const CART_KEY = "electrohub-cart";

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(value);
  }

  function updateCartCount() {
    const count = readCart().reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      node.textContent = count;
    });
  }

  function attachAddToCart() {
    document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
      button.addEventListener("click", () => {
        const payload = JSON.parse(button.getAttribute("data-add-to-cart"));
        const cart = readCart();
        const existing = cart.find((item) => item.id === payload.id);

        if (existing) {
          existing.quantity += 1;
        } else {
          cart.push({ ...payload, quantity: 1 });
        }

        writeCart(cart);
        button.textContent = "Added";
        setTimeout(() => {
          button.textContent = "Add to cart";
        }, 1200);
      });
    });
  }

  function renderCartPage() {
    const container = document.querySelector("[data-cart-items]");
    if (!container) return;

    const cart = readCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    document.querySelector("[data-cart-items-count]").textContent = count;
    document.querySelector("[data-cart-total]").textContent = formatCurrency(total);

    if (!cart.length) {
      container.innerHTML = `<div class="empty-panel">Your cart is empty. Add products from the catalog to continue.</div>`;
      return;
    }

    container.innerHTML = cart.map((item) => `
      <article class="cart-line">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <p>${formatCurrency(item.price)} x ${item.quantity}</p>
        </div>
        <button class="ghost-button" data-remove-id="${item.id}">Remove</button>
      </article>
    `).join("");

    container.querySelectorAll("[data-remove-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = readCart().filter((item) => String(item.id) !== button.getAttribute("data-remove-id"));
        writeCart(next);
        renderCartPage();
      });
    });
  }

  function renderCheckoutPage() {
    const itemsNode = document.querySelector("[data-checkout-items]");
    const totalNode = document.querySelector("[data-checkout-total]");
    const form = document.querySelector("[data-checkout-form]");
    const messageNode = document.querySelector("[data-checkout-message]");
    if (!itemsNode || !totalNode || !form) return;

    const cart = readCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    totalNode.textContent = formatCurrency(total);

    if (!cart.length) {
      itemsNode.innerHTML = `<div class="empty-panel">Your cart is empty. Add products before checking out.</div>`;
      form.querySelector("button").disabled = true;
      return;
    }

    itemsNode.innerHTML = cart.map((item) => `
      <div class="summary-line border-row">
        <span>${item.name} x ${item.quantity}</span>
        <strong>${formatCurrency(item.price * item.quantity)}</strong>
      </div>
    `).join("");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      messageNode.textContent = "Placing your order...";

      const formData = new FormData(form);
      const payload = {
        customerName: formData.get("customerName"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
        city: formData.get("city"),
        state: formData.get("state"),
        pincode: formData.get("pincode"),
        items: cart.map((item) => ({ id: item.id, quantity: item.quantity }))
      };

      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not place order");
        }
        writeCart([]);
        window.location.href = `/order/${encodeURIComponent(result.orderCode)}`;
      } catch (error) {
        messageNode.textContent = error.message;
      }
    });
  }

  function attachGallery() {
    const stage = document.querySelector("[data-gallery-stage]");
    const mediaItems = Array.from(document.querySelectorAll("[data-gallery-item]"));
    const thumbColumn = document.querySelector(".thumb-column");
    const thumbPrev = document.querySelector("[data-thumb-prev]");
    const thumbNext = document.querySelector("[data-thumb-next]");
    if (!stage || !mediaItems.length) return;

    let reelTimer = null;

    function stopReel() {
      if (reelTimer) {
        window.clearInterval(reelTimer);
        reelTimer = null;
      }
    }

    function activateItem(target) {
      mediaItems.forEach((item) => item.classList.toggle("active", item === target));
    }

    function renderImage(item) {
      stopReel();
      const img = item.querySelector("img");
      if (!img) return;
      const mainClass = document.querySelector(".clean-pdp-shell") ? "clean-hero-image" : "detail-hero-image";
      stage.innerHTML = `<img class="${mainClass} ${img.className.replace("thumb detail-thumb", "").trim()}" data-gallery-main src="${img.getAttribute("src")}" alt="${img.getAttribute("alt")}">`;
    }

    function renderVideo(item) {
      stopReel();
      const frames = JSON.parse(item.getAttribute("data-video-frames") || "[]").filter(Boolean);
      const title = item.getAttribute("data-video-title") || "Product video";
      const caption = item.getAttribute("data-video-caption") || "";
      const initialFrame = frames[0] || "";

      stage.innerHTML = `
        <div class="gallery-video-state">
          <div class="gallery-video-shell">
            <img class="gallery-video-frame" src="${initialFrame}" alt="${title}">
            <div class="gallery-video-copy">
              <div class="video-thumb-play"></div>
              <strong>${title}</strong>
              <span>${caption}</span>
            </div>
          </div>
        </div>
      `;

      const frameNode = stage.querySelector(".gallery-video-frame");
      if (frameNode && frames.length > 1) {
        let index = 0;
        reelTimer = window.setInterval(() => {
          index = (index + 1) % frames.length;
          frameNode.src = frames[index];
        }, 1200);
      }
    }

    mediaItems.forEach((item) => {
      item.addEventListener("click", () => {
        activateItem(item);
        if (item.getAttribute("data-gallery-type") === "video") {
          renderVideo(item);
        } else {
          renderImage(item);
        }
      });
    });

    const scrollThumbs = (direction) => {
      if (!thumbColumn) return;
      const amount = window.innerWidth <= 760 ? thumbColumn.clientWidth * 0.85 : 180;
      thumbColumn.scrollBy({
        left: window.innerWidth <= 760 ? direction * amount : 0,
        top: window.innerWidth <= 760 ? 0 : direction * amount,
        behavior: "smooth"
      });
    };

    thumbPrev?.addEventListener("click", () => scrollThumbs(-1));
    thumbNext?.addEventListener("click", () => scrollThumbs(1));
  }

  function attachCarousel() {
    const root = document.querySelector("[data-carousel]");
    if (!root) return;

    const slides = Array.from(root.querySelectorAll("[data-carousel-slide]"));
    const dots = Array.from(root.querySelectorAll("[data-carousel-dot]"));
    const prev = root.querySelector("[data-carousel-prev]");
    const next = root.querySelector("[data-carousel-next]");
    if (!slides.length) return;

    let activeIndex = slides.findIndex((slide) => slide.classList.contains("active"));
    if (activeIndex < 0) activeIndex = 0;
    let timer = null;

    function render(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle("active", slideIndex === activeIndex);
      });
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("active", dotIndex === activeIndex);
      });
    }

    function startTimer() {
      stopTimer();
      timer = window.setInterval(() => {
        render(activeIndex + 1);
      }, 4800);
    }

    function stopTimer() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    prev?.addEventListener("click", () => {
      render(activeIndex - 1);
      startTimer();
    });

    next?.addEventListener("click", () => {
      render(activeIndex + 1);
      startTimer();
    });

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        render(index);
        startTimer();
      });
    });

    root.addEventListener("mouseenter", stopTimer);
    root.addEventListener("mouseleave", startTimer);
    render(activeIndex);
    startTimer();
  }

  function attachRails() {
    document.querySelectorAll("[data-rail]").forEach((root) => {
      const track = root.querySelector("[data-rail-track]");
      const prev = root.querySelector("[data-rail-prev]");
      const next = root.querySelector("[data-rail-next]");
      if (!track) return;

      const scrollAmount = () => Math.max(track.clientWidth * 0.82, 240);

      prev?.addEventListener("click", () => {
        track.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
      });

      next?.addEventListener("click", () => {
        track.scrollBy({ left: scrollAmount(), behavior: "smooth" });
      });

      // Auto-scroll (marquee-style) only for Bank Offers + Deals Of The Day.
      // Layout/HTML/CSS are untouched; we just animate scrollLeft and loop seamlessly.
      const isMarquee =
        track.classList.contains("bank-offer-rail") ||
        track.classList.contains("deal-rail");
      if (!isMarquee) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const speedPxPerSec = 40; // gentle ticker speed
      let lastTs = 0;
      let paused = false;
      let userInteracting = false;
      let resumeTimer = null;

      const pauseTemporarily = (ms = 2500) => {
        userInteracting = true;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => { userInteracting = false; }, ms);
      };

      root.addEventListener("mouseenter", () => { paused = true; });
      root.addEventListener("mouseleave", () => { paused = false; });
      track.addEventListener("wheel", () => pauseTemporarily(), { passive: true });
      track.addEventListener("touchstart", () => pauseTemporarily(4000), { passive: true });
      prev?.addEventListener("click", () => pauseTemporarily(4000));
      next?.addEventListener("click", () => pauseTemporarily(4000));

      const step = (ts) => {
        if (!lastTs) lastTs = ts;
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;

        if (!paused && !userInteracting) {
          const maxScroll = track.scrollWidth - track.clientWidth;
          if (maxScroll > 4) {
            let next = track.scrollLeft + speedPxPerSec * dt;
            if (next >= maxScroll - 1) next = 0; // seamless loop back to start
            track.scrollLeft = next;
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  updateCartCount();
  attachAddToCart();
  renderCartPage();
  renderCheckoutPage();
  attachGallery();
  attachCarousel();
  attachRails();

  function attachV2Carousel() {
    const roots = document.querySelectorAll("[data-v2-carousel]");
    roots.forEach((root) => {
      const slides = Array.from(root.querySelectorAll(".v2-slide"));
      const dots = Array.from(root.querySelectorAll("[data-v2-dot]"));
      const prev = root.querySelector("[data-v2-prev]");
      const next = root.querySelector("[data-v2-next]");
      if (!slides.length) return;
      let idx = 0;
      let timer = null;
      function show(i) {
        idx = (i + slides.length) % slides.length;
        slides.forEach((s, si) => s.classList.toggle("is-active", si === idx));
        dots.forEach((d, di) => d.classList.toggle("is-active", di === idx));
      }
      function start() { stop(); timer = setInterval(() => show(idx + 1), 6000); }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      if (prev) prev.addEventListener("click", () => { show(idx - 1); start(); });
      if (next) next.addEventListener("click", () => { show(idx + 1); start(); });
      dots.forEach((d, di) => d.addEventListener("click", () => { show(di); start(); }));
      root.addEventListener("mouseenter", stop);
      root.addEventListener("mouseleave", start);
      start();
    });
  }
  attachV2Carousel();

  // ==== CROMA REDESIGN HANDLERS ====

  // Sidebar filter toggle on products listing
  document.querySelectorAll("[data-cr-sidebar-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sidebar = btn.closest("[data-cr-sidebar]");
      if (sidebar) sidebar.classList.toggle("is-open");
    });
  });

  // Product detail gallery thumbnail switcher
  document.querySelectorAll("[data-cr-thumb]").forEach(function (thumb) {
    thumb.addEventListener("click", function () {
      var src = thumb.getAttribute("data-src");
      var stage = document.querySelector("[data-cr-stage]");
      if (stage && src) stage.setAttribute("src", src);
      document.querySelectorAll("[data-cr-thumb]").forEach(function (t) { t.classList.remove("is-active"); });
      thumb.classList.add("is-active");
    });
  });

  // Checkout multi-step navigation
  (function crCheckoutSteps() {
    var stepsEl = document.querySelector("[data-cr-steps]");
    if (!stepsEl) return;
    var stepItems = stepsEl.querySelectorAll("li");
    var bodies = document.querySelectorAll("[data-step-body]");
    function show(n) {
      stepItems.forEach(function (li) {
        var s = Number(li.getAttribute("data-step"));
        li.classList.toggle("is-active", s === n);
        li.classList.toggle("is-done", s < n);
      });
      bodies.forEach(function (b) {
        b.classList.toggle("is-active", Number(b.getAttribute("data-step-body")) === n);
      });
    }
    document.querySelectorAll("[data-cr-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cur = document.querySelector(".cr-co-step.is-active");
        var n = cur ? Number(cur.getAttribute("data-step-body")) : 1;
        show(Math.min(n + 1, 3));
      });
    });
    document.querySelectorAll("[data-cr-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cur = document.querySelector(".cr-co-step.is-active");
        var n = cur ? Number(cur.getAttribute("data-step-body")) : 1;
        show(Math.max(n - 1, 1));
      });
    });
  })();

  // Admin sidebar toggle on mobile
  document.querySelectorAll("[data-cr-admin-menu]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sb = document.querySelector("[data-cr-admin-sidebar]");
      if (sb) sb.classList.toggle("is-open");
    });
  });

  // Color swatch toggle (decorative)
  document.querySelectorAll(".cr-swatch").forEach(function (sw) {
    sw.addEventListener("click", function () {
      var parent = sw.parentElement;
      if (parent) parent.querySelectorAll(".cr-swatch").forEach(function (s) { s.classList.remove("is-active"); });
      sw.classList.add("is-active");
    });
  });

  // Qty stepper delegation (if cart renders steppers with data-cr-qty)
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches("[data-cr-qty-inc], [data-cr-qty-dec]")) {
      var wrap = t.closest("[data-cr-qty]");
      if (!wrap) return;
      var input = wrap.querySelector("input");
      if (!input) return;
      var cur = parseInt(input.value, 10) || 1;
      cur = t.matches("[data-cr-qty-inc]") ? cur + 1 : Math.max(1, cur - 1);
      input.value = String(cur);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  // === E-COMMERCE OVERHAUL handlers ===
  // Admin: bulk select-all
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches("[data-eo-check-all]")) {
      var checked = t.checked;
      document.querySelectorAll(".eo-row-check").forEach(function (cb) { cb.checked = checked; });
    }
    // Admin: order status auto-submit
    if (t.matches("[data-eo-status-select]")) {
      var form = t.closest("[data-eo-status-form]");
      if (form) form.submit();
    }
  });

  // Delete confirmations for admin single-delete forms are inline via onsubmit.

  // Filter form: auto-submit on change
  var filterForm = document.querySelector("[data-eo-filter-form]");
  if (filterForm) {
    filterForm.addEventListener("change", function (e) {
      var tgt = e.target;
      if (!(tgt instanceof HTMLElement)) return;
      // Only auto-submit for checkboxes/radios; let number inputs wait for Apply
      if (tgt.matches("input[type=checkbox], input[type=radio]")) {
        // Don't auto-submit if within data-eo-multi with range inputs, etc.
        filterForm.submit();
      }
    });
  }

  // Admin search: submit on Enter (default) - no extra JS needed. Also submit on debounce for live UX:
  var adminSearch = document.querySelector(".eo-admin-search-form input[name=q]");
  if (adminSearch) {
    var tmr;
    adminSearch.addEventListener("input", function () {
      clearTimeout(tmr);
      tmr = setTimeout(function () { adminSearch.form.submit(); }, 450);
    });
  }

})();
