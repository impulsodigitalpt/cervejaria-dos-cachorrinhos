(function () {
  "use strict";

  const bootstrap = window.__MENU_BOOTSTRAP__ && typeof window.__MENU_BOOTSTRAP__ === "object"
    ? window.__MENU_BOOTSTRAP__
    : {};
  const state = { data: null, query: "" };
  const refs = {
    businessName: document.querySelector("#business-name"),
    businessLogo: document.querySelector("#business-logo"),
    brandMark: document.querySelector("#brand-mark"),
    title: document.querySelector("#menu-title"),
    subtitle: document.querySelector("#menu-subtitle"),
    updated: document.querySelector("#menu-updated"),
    nav: document.querySelector("#category-nav"),
    search: document.querySelector("#menu-search"),
    clearSearch: document.querySelector("#clear-search"),
    status: document.querySelector("#menu-status"),
    sections: document.querySelector("#menu-sections"),
    footerName: document.querySelector("#footer-business-name"),
    footerNote: document.querySelector("#footer-note"),
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  function safeText(value, fallback = "") {
    const text = String(value == null ? "" : value).trim();
    return text || fallback;
  }

  function normalizeData(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
    const business = source.business && typeof source.business === "object" ? source.business : {};
    const allowedTemplates = new Set(["menu-classic", "menu-editorial", "menu-pop"]);
    const template = allowedTemplates.has(settings.template || source.template)
      ? settings.template || source.template
      : allowedTemplates.has(bootstrap.template) ? bootstrap.template : "menu-classic";
    const categories = Array.isArray(source.categories) ? source.categories : [];
    return {
      version: 1,
      updatedAt: source.updatedAt || "",
      business: {
        name: safeText(business.name, safeText(bootstrap.businessName, "Menu digital")),
        logo: safeText(business.logo, safeText(bootstrap.logo, "")),
      },
      settings: {
        enabled: settings.enabled !== false,
        template,
        title: safeText(settings.title, "A nossa carta"),
        subtitle: safeText(settings.subtitle, "Descobre o que preparámos para ti."),
        currency: /^[A-Z]{3}$/.test(settings.currency || "") ? settings.currency : "EUR",
        locale: safeText(settings.locale, "pt-PT"),
        note: safeText(settings.note, "Preços com IVA incluído à taxa legal em vigor."),
        showUnavailable: settings.showUnavailable !== false,
      },
      categories: categories
        .filter((category) => category && typeof category === "object" && category.enabled !== false)
        .map((category, categoryIndex) => ({
          id: safeText(category.id, `categoria-${categoryIndex + 1}`),
          name: safeText(category.name, `Categoria ${categoryIndex + 1}`),
          description: safeText(category.description),
          items: (Array.isArray(category.items) ? category.items : [])
            .filter((item) => item && typeof item === "object" && item.enabled !== false)
            .map((item, itemIndex) => ({
              id: safeText(item.id, `item-${categoryIndex + 1}-${itemIndex + 1}`),
              name: safeText(item.name, "Item"),
              description: safeText(item.description),
              priceCents: Number.isFinite(Number(item.priceCents)) ? Math.max(0, Math.round(Number(item.priceCents))) : null,
              image: safeText(item.image),
              enabled: item.enabled !== false,
              available: item.available !== false,
              featured: item.featured === true,
              allergens: Array.isArray(item.allergens) ? item.allergens.map((value) => safeText(value)).filter(Boolean).slice(0, 14) : [],
              tags: Array.isArray(item.tags) ? item.tags.map((value) => safeText(value)).filter(Boolean).slice(0, 8) : [],
            })),
        })),
    };
  }

  function money(value) {
    if (value === null || value === undefined) return "";
    try {
      return new Intl.NumberFormat(state.data.settings.locale, {
        style: "currency",
        currency: state.data.settings.currency,
      }).format(value / 100);
    } catch (_) {
      return `${(value / 100).toFixed(2).replace(".", ",")} ${state.data.settings.currency}`;
    }
  }

  function formattedDate(value) {
    if (!value) return "Atualizado recentemente";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Atualizado recentemente";
    return `Atualizado em ${new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "long", year: "numeric" }).format(date)}`;
  }

  function itemMatches(item, query) {
    if (!query) return true;
    return [item.name, item.description, ...item.tags, ...item.allergens]
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(query);
  }

  function renderItem(item) {
    const article = el("article", `menu-item${item.image ? "" : " no-image"}${item.available ? "" : " is-unavailable"}`);
    const copy = el("div", "item-copy");
    const top = el("div", "item-top");
    top.append(el("h3", "", item.name));
    const price = money(item.priceCents);
    if (price) top.append(el("span", "item-price", price));
    copy.append(top);
    if (item.description) copy.append(el("p", "item-description", item.description));
    const tags = el("div", "item-tags");
    if (item.featured) tags.append(el("span", "item-tag featured", "Sugestão da casa"));
    if (!item.available) tags.append(el("span", "unavailable-label", "Indisponível"));
    item.tags.forEach((tag) => tags.append(el("span", "item-tag", tag)));
    item.allergens.forEach((allergen) => tags.append(el("span", "item-tag", allergen)));
    if (tags.childNodes.length) copy.append(tags);
    article.append(copy);
    if (item.image) {
      const image = el("img", "item-image");
      image.src = item.image;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        image.remove();
        article.classList.add("no-image");
      });
      article.append(image);
    }
    return article;
  }

  function setStatus(title, message) {
    refs.status.replaceChildren();
    if (title) refs.status.append(el("h2", "", title));
    refs.status.append(el("p", "", message));
    refs.status.hidden = false;
    refs.sections.hidden = true;
  }

  function renderMenu() {
    const normalizedQuery = state.query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    refs.nav.replaceChildren();
    refs.sections.replaceChildren();
    let visibleItems = 0;

    state.data.categories.forEach((category) => {
      const items = category.items.filter((item) => {
        if (!state.data.settings.showUnavailable && !item.available) return false;
        return itemMatches(item, normalizedQuery);
      });
      if (normalizedQuery && !items.length) return;

      const navButton = el("button", "category-button", category.name);
      navButton.type = "button";
      navButton.dataset.target = category.id;
      navButton.addEventListener("click", () => {
        document.getElementById(`category-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      refs.nav.append(navButton);

      const section = el("section", "menu-category");
      section.id = `category-${category.id}`;
      const heading = el("div", "category-heading");
      heading.append(el("h2", "", category.name));
      heading.append(el("span", "", `${items.length} ${items.length === 1 ? "item" : "itens"}`));
      if (category.description) heading.append(el("p", "", category.description));
      section.append(heading);
      if (items.length) {
        const grid = el("div", "item-grid");
        items.forEach((item) => grid.append(renderItem(item)));
        section.append(grid);
        visibleItems += items.length;
      } else {
        section.append(el("div", "category-empty", "Esta categoria está a ser preparada."));
      }
      refs.sections.append(section);
    });

    if (normalizedQuery && !visibleItems) {
      setStatus("Sem resultados", `Não encontrámos nada para “${state.query.trim()}”. Experimenta outro termo.`);
      return;
    }
    if (!state.data.categories.length) {
      setStatus("Menu em atualização", "Estamos a preparar a carta. Volta em breve para descobrir as novidades.");
      return;
    }
    refs.status.hidden = true;
    refs.sections.hidden = false;
    refs.clearSearch.hidden = !state.query;
    updateActiveCategory();
  }

  function applyIdentity() {
    const data = state.data;
    document.body.classList.remove("theme-menu-classic", "theme-menu-editorial", "theme-menu-pop");
    document.body.classList.add(`theme-${data.settings.template}`);
    document.body.classList.remove("is-loading");
    document.title = `${data.settings.title} | ${data.business.name}`;
    refs.businessName.textContent = data.business.name;
    refs.footerName.textContent = data.business.name;
    refs.title.textContent = data.settings.title;
    refs.subtitle.textContent = data.settings.subtitle;
    refs.updated.textContent = formattedDate(data.updatedAt);
    refs.footerNote.textContent = data.settings.note;
    if (data.business.logo) {
      refs.businessLogo.src = data.business.logo;
      refs.businessLogo.alt = `Logótipo de ${data.business.name}`;
      refs.businessLogo.hidden = false;
      refs.brandMark.hidden = true;
    }
  }

  function updateActiveCategory() {
    const sections = [...refs.sections.querySelectorAll(".menu-category")];
    if (!sections.length) return;
    let active = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= 118) active = section;
    });
    const target = active.id.replace(/^category-/, "");
    refs.nav.querySelectorAll(".category-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.target === target);
    });
  }

  async function loadMenu() {
    try {
      const response = await fetch("menu-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = normalizeData(await response.json());
    } catch (_) {
      state.data = normalizeData(bootstrap.menuData || bootstrap);
    }
    applyIdentity();
    if (!state.data.settings.enabled) {
      setStatus("Menu indisponível", "Este menu está temporariamente indisponível.");
      return;
    }
    renderMenu();
  }

  refs.search.addEventListener("input", () => {
    state.query = refs.search.value;
    renderMenu();
  });
  refs.clearSearch.addEventListener("click", () => {
    state.query = "";
    refs.search.value = "";
    refs.search.focus();
    renderMenu();
  });
  window.addEventListener("scroll", updateActiveCategory, { passive: true });
  loadMenu();
})();
