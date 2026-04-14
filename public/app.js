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
    });
  }

  updateCartCount();
  attachAddToCart();
  renderCartPage();
  renderCheckoutPage();
  attachGallery();
  attachCarousel();
  attachRails();
})();
