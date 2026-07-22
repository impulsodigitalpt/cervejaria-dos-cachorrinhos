(function () {
  "use strict";

  const bootstrap = window.__BACKOFFICE_BOOTSTRAP__ && typeof window.__BACKOFFICE_BOOTSTRAP__ === "object"
    ? window.__BACKOFFICE_BOOTSTRAP__
    : {};
  const ALLERGENS = [
    "Glúten", "Crustáceos", "Ovos", "Peixe", "Amendoins", "Soja", "Leite",
    "Frutos de casca rija", "Aipo", "Mostarda", "Sésamo", "Sulfitos", "Tremoço", "Moluscos",
  ];
  const ALLOWED_TEMPLATES = new Set(["menu-classic", "menu-editorial", "menu-pop"]);
  const state = {
    data: null,
    selectedCategoryId: "",
    dirty: false,
    needsPublish: false,
    authenticated: false,
    pendingImage: "",
    githubToken: "",
  };
  const refs = {};
  let toastTimer = null;

  function queryRefs() {
    [
      "login-view", "login-form", "pin-input", "toggle-pin", "login-error", "app-view",
      "header-business-name", "save-status", "open-menu-link", "category-list", "category-empty",
      "no-category-state", "category-workspace", "workspace-title", "workspace-description", "item-count",
      "item-list", "items-empty", "category-dialog", "category-form", "category-dialog-title", "category-id",
      "category-name", "category-description", "category-enabled", "item-dialog", "item-form", "item-dialog-title",
      "item-id", "item-name", "item-description", "item-price", "item-tags", "item-available", "item-featured",
      "item-enabled", "item-image", "item-image-preview", "remove-item-image", "allergen-grid", "import-file",
      "publish-dialog", "publish-form", "publish-repository", "github-token", "publish-error", "publish-submit",
      "qr-dialog", "qr-business-name", "qr-code", "qr-url", "download-qr", "print-qr", "toast",
    ].forEach((id) => { refs[toCamel(id)] = document.getElementById(id); });
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function text(value, fallback = "") {
    const result = String(value == null ? "" : value).trim();
    return result || fallback;
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function uniqueId(candidate, used, prefix) {
    let value = text(candidate, makeId(prefix));
    while (used.has(value)) value = makeId(prefix);
    used.add(value);
    return value;
  }

  function normalizeMenu(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
    const business = source.business && typeof source.business === "object" ? source.business : {};
    const categoryIds = new Set();
    return {
      version: 1,
      updatedAt: text(source.updatedAt, new Date().toISOString()),
      business: {
        name: text(business.name, text(bootstrap.businessName, "Menu digital")),
        logo: validImage(business.logo) ? business.logo : text(bootstrap.logo, ""),
      },
      settings: {
        enabled: settings.enabled !== false,
        template: ALLOWED_TEMPLATES.has(settings.template) ? settings.template : ALLOWED_TEMPLATES.has(bootstrap.template) ? bootstrap.template : "menu-classic",
        title: text(settings.title, "A nossa carta").slice(0, 80),
        subtitle: text(settings.subtitle, "Descobre o que preparámos para ti.").slice(0, 220),
        currency: /^[A-Z]{3}$/.test(settings.currency || "") ? settings.currency : "EUR",
        locale: text(settings.locale, "pt-PT"),
        note: text(settings.note, "Preços com IVA incluído à taxa legal em vigor.").slice(0, 180),
        showUnavailable: settings.showUnavailable !== false,
      },
      categories: (Array.isArray(source.categories) ? source.categories : [])
        .filter((category) => category && typeof category === "object")
        .slice(0, 80)
        .map((category, categoryIndex) => {
          const itemIds = new Set();
          return {
            id: uniqueId(category.id, categoryIds, "cat"),
            name: text(category.name, `Categoria ${categoryIndex + 1}`).slice(0, 60),
            description: text(category.description).slice(0, 180),
            enabled: category.enabled !== false,
            items: (Array.isArray(category.items) ? category.items : [])
              .filter((item) => item && typeof item === "object")
              .slice(0, 250)
              .map((item, itemIndex) => ({
                id: uniqueId(item.id, itemIds, "item"),
                name: text(item.name, `Item ${itemIndex + 1}`).slice(0, 90),
                description: text(item.description).slice(0, 320),
                priceCents: finitePrice(item.priceCents),
                image: validImage(item.image) ? item.image : "",
                enabled: item.enabled !== false,
                available: item.available !== false,
                featured: item.featured === true,
                tags: cleanStringList(item.tags, 8, 30),
                allergens: cleanStringList(item.allergens, 14, 40),
              })),
          };
        }),
    };
  }

  function finitePrice(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(9999999, Math.round(number))) : null;
  }

  function cleanStringList(value, limit, maxLength) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => text(item).slice(0, maxLength)).filter(Boolean))].slice(0, limit);
  }

  function validImage(value) {
    const source = text(value);
    return /^(data:image\/(?:jpeg|png|webp);base64,|(?:\.\.\/)?assets\/|https?:\/\/)/i.test(source);
  }

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  function button(label, action, className = "mini-button") {
    const node = el("button", className, label);
    node.type = "button";
    node.dataset.action = action;
    return node;
  }

  function selectedCategory() {
    return state.data?.categories.find((category) => category.id === state.selectedCategoryId) || null;
  }

  function findItem(category, itemId) {
    return category?.items.find((item) => item.id === itemId) || null;
  }

  function menuUrl() {
    try { return new URL(bootstrap.menuUrl || "../menu/", window.location.href).href; }
    catch (_) { return "../menu/"; }
  }

  function draftKey() {
    return `impulso-menu-draft:${text(bootstrap.slug, window.location.pathname)}`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.hidden = false;
    toastTimer = window.setTimeout(() => { refs.toast.hidden = true; }, 3400);
  }

  function setFormError(target, message) {
    target.textContent = message || "";
    target.hidden = !message;
  }

  function setStatus(mode, label) {
    refs.saveStatus.className = `header-status${mode ? ` is-${mode}` : ""}`;
    refs.saveStatus.querySelector("span").textContent = label;
  }

  function markDirty() {
    state.dirty = true;
    state.needsPublish = true;
    state.data.updatedAt = new Date().toISOString();
    setStatus("dirty", "Alterações por guardar");
    saveDraft(false);
  }

  function saveDraft(showMessage = true) {
    try {
      localStorage.setItem(draftKey(), JSON.stringify(state.data));
      if (showMessage) showToast("Rascunho guardado neste browser.");
    } catch (_) {
      if (showMessage) showToast("O browser não conseguiu guardar o rascunho. Descarrega uma cópia JSON.");
    }
  }

  function restoreDraft(published) {
    try {
      const raw = localStorage.getItem(draftKey());
      if (!raw) return published;
      const draft = normalizeMenu(JSON.parse(raw));
      const draftTime = new Date(draft.updatedAt).getTime() || 0;
      const publishedTime = new Date(published.updatedAt).getTime() || 0;
      if (draftTime >= publishedTime) {
        state.needsPublish = true;
        window.setTimeout(() => showToast("Rascunho anterior recuperado neste browser."), 250);
        return draft;
      }
    } catch (_) {
      try { localStorage.removeItem(draftKey()); } catch (_) { /* Storage can be unavailable in private mode. */ }
    }
    return published;
  }

  async function sha256(value) {
    if (!window.crypto?.subtle) throw new Error("Este browser não suporta validação segura do PIN.");
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setFormError(refs.loginError, "");
    const pin = refs.pinInput.value.trim();
    if (!/^\d{4,10}$/.test(pin)) {
      setFormError(refs.loginError, "Introduz o PIN numérico de 4 a 10 dígitos.");
      return;
    }
    try {
      const expected = text(bootstrap.accessPinHash).toLowerCase();
      const supplied = await sha256(pin);
      if (expected && supplied !== expected) {
        setFormError(refs.loginError, "PIN incorreto. Confirma o código entregue com o website.");
        refs.pinInput.select();
        return;
      }
      await loadData();
      state.authenticated = true;
      refs.loginView.hidden = true;
      refs.appView.hidden = false;
      refs.pinInput.value = "";
    } catch (error) {
      state.authenticated = false;
      refs.loginView.hidden = false;
      refs.appView.hidden = true;
      setFormError(refs.loginError, error.message || "Não foi possível validar o PIN.");
    }
  }

  async function loadData() {
    let raw = bootstrap.menuData || {};
    try {
      const path = bootstrap.menuDataPath || "../menu/menu-data.json";
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      raw = await response.json();
    } catch (_) {
      // The generated bootstrap is a complete first-run fallback.
    }
    state.data = restoreDraft(normalizeMenu(raw));
    state.selectedCategoryId = state.data.categories[0]?.id || "";
    refs.headerBusinessName.textContent = state.data.business.name;
    refs.openMenuLink.href = menuUrl();
    bindSettings();
    render();
    setStatus(state.needsPublish ? "dirty" : "", state.needsPublish ? "Rascunho por publicar" : "Sem alterações");
  }

  function bindSettings() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.dataset.setting;
      const value = state.data.settings[key];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value == null ? "" : value;
    });
  }

  function render() {
    renderCategories();
    renderWorkspace();
  }

  function renderCategories() {
    refs.categoryList.replaceChildren();
    refs.categoryEmpty.hidden = state.data.categories.length > 0;
    state.data.categories.forEach((category, index) => {
      const row = el("div", `category-row${category.id === state.selectedCategoryId ? " is-active" : ""}`);
      const main = button("", "select-category", "category-row-main");
      main.dataset.categoryId = category.id;
      main.append(el("strong", "", category.name));
      main.append(el("small", "", `${category.items.length} ${category.items.length === 1 ? "item" : "itens"}${category.enabled ? "" : " · escondida"}`));
      const controls = el("div", "category-controls");
      const up = button("↑", "move-category-up");
      const down = button("↓", "move-category-down");
      up.dataset.categoryId = category.id;
      down.dataset.categoryId = category.id;
      up.disabled = index === 0;
      down.disabled = index === state.data.categories.length - 1;
      controls.append(up, down);
      row.append(main, controls);
      refs.categoryList.append(row);
    });
  }

  function renderWorkspace() {
    const category = selectedCategory();
    refs.noCategoryState.hidden = Boolean(category);
    refs.categoryWorkspace.hidden = !category;
    if (!category) return;
    refs.workspaceTitle.textContent = category.name;
    refs.workspaceDescription.textContent = category.description || (category.enabled ? "Categoria visível no menu público." : "Esta categoria está escondida no menu público.");
    refs.itemCount.textContent = `${category.items.length} ${category.items.length === 1 ? "item" : "itens"}`;
    refs.itemList.replaceChildren();
    refs.itemsEmpty.hidden = category.items.length > 0;
    category.items.forEach((item, index) => refs.itemList.append(renderAdminItem(category, item, index)));
  }

  function renderAdminItem(category, item, index) {
    const article = el("article", `admin-item${item.enabled ? "" : " is-hidden"}`);
    const media = el("div", "admin-item-image");
    if (item.image) {
      const image = el("img");
      image.src = item.image;
      image.alt = "";
      media.append(image);
    } else {
      media.append(el("span", "", "◇"));
    }
    const copy = el("div", "admin-item-copy");
    const titleRow = el("div", "admin-item-title");
    titleRow.append(el("strong", "", item.name));
    if (item.priceCents !== null) titleRow.append(el("span", "price", formatMoney(item.priceCents)));
    copy.append(titleRow);
    if (item.description) copy.append(el("p", "", item.description));
    const badges = el("div", "admin-badges");
    if (item.featured) badges.append(el("span", "admin-badge featured", "Sugestão"));
    if (!item.available) badges.append(el("span", "admin-badge unavailable", "Indisponível"));
    if (!item.enabled) badges.append(el("span", "admin-badge", "Escondido"));
    item.allergens.slice(0, 2).forEach((allergen) => badges.append(el("span", "admin-badge", allergen)));
    if (badges.childNodes.length) copy.append(badges);
    const actions = el("div", "admin-item-actions");
    const up = button("↑", "move-item-up");
    const down = button("↓", "move-item-down");
    const availability = button(item.available ? "Pausar" : "Ativar", "toggle-item-available", "edit-button");
    const edit = button("Editar", "edit-item", "edit-button");
    const remove = button("×", "remove-item");
    [up, down, availability, edit, remove].forEach((node) => { node.dataset.itemId = item.id; node.dataset.categoryId = category.id; });
    up.disabled = index === 0;
    down.disabled = index === category.items.length - 1;
    remove.title = "Remover item";
    actions.append(up, down, availability, edit, remove);
    article.append(media, copy, actions);
    return article;
  }

  function formatMoney(cents) {
    try {
      return new Intl.NumberFormat(state.data.settings.locale || "pt-PT", { style: "currency", currency: state.data.settings.currency || "EUR" }).format(cents / 100);
    } catch (_) {
      return `${(cents / 100).toFixed(2).replace(".", ",")} ${state.data.settings.currency}`;
    }
  }

  function moveInList(list, index, direction) {
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return false;
    [list[index], list[target]] = [list[target], list[index]];
    return true;
  }

  function openCategoryDialog(category = null) {
    refs.categoryForm.reset();
    refs.categoryId.value = category?.id || "";
    refs.categoryName.value = category?.name || "";
    refs.categoryDescription.value = category?.description || "";
    refs.categoryEnabled.checked = category ? category.enabled !== false : true;
    refs.categoryDialogTitle.textContent = category ? "Editar categoria" : "Nova categoria";
    refs.categoryDialog.showModal();
    window.setTimeout(() => refs.categoryName.focus(), 40);
  }

  function saveCategory(event) {
    event.preventDefault();
    if (!refs.categoryForm.reportValidity()) return;
    const id = refs.categoryId.value;
    let category = state.data.categories.find((item) => item.id === id);
    if (!category) {
      category = { id: makeId("cat"), name: "", description: "", enabled: true, items: [] };
      state.data.categories.push(category);
    }
    category.name = refs.categoryName.value.trim();
    category.description = refs.categoryDescription.value.trim();
    category.enabled = refs.categoryEnabled.checked;
    state.selectedCategoryId = category.id;
    refs.categoryDialog.close();
    markDirty();
    render();
  }

  function removeCategory(category) {
    const message = category.items.length
      ? `Remover “${category.name}” e os ${category.items.length} itens que contém?`
      : `Remover a categoria “${category.name}”?`;
    if (!window.confirm(message)) return;
    const index = state.data.categories.findIndex((item) => item.id === category.id);
    state.data.categories.splice(index, 1);
    state.selectedCategoryId = state.data.categories[Math.min(index, state.data.categories.length - 1)]?.id || "";
    markDirty();
    render();
  }

  function buildAllergenOptions(selected = []) {
    refs.allergenGrid.replaceChildren();
    ALLERGENS.forEach((name) => {
      const label = el("label", "check-field");
      const input = el("input");
      input.type = "checkbox";
      input.value = name;
      input.checked = selected.includes(name);
      label.append(input, el("span", "", name));
      refs.allergenGrid.append(label);
    });
  }

  function openItemDialog(item = null) {
    refs.itemForm.reset();
    refs.itemId.value = item?.id || "";
    refs.itemName.value = item?.name || "";
    refs.itemDescription.value = item?.description || "";
    refs.itemPrice.value = item?.priceCents == null ? "" : (item.priceCents / 100).toFixed(2);
    refs.itemTags.value = item?.tags?.join(", ") || "";
    refs.itemAvailable.checked = item ? item.available !== false : true;
    refs.itemFeatured.checked = item?.featured === true;
    refs.itemEnabled.checked = item ? item.enabled !== false : true;
    state.pendingImage = item?.image || "";
    updateImagePreview();
    buildAllergenOptions(item?.allergens || []);
    refs.itemDialogTitle.textContent = item ? "Editar item" : "Novo item";
    refs.itemDialog.showModal();
    window.setTimeout(() => refs.itemName.focus(), 40);
  }

  function updateImagePreview() {
    refs.itemImagePreview.replaceChildren();
    if (!state.pendingImage) {
      refs.itemImagePreview.append(el("span", "", "Sem fotografia"));
      refs.removeItemImage.hidden = true;
      return;
    }
    const image = el("img");
    image.src = state.pendingImage;
    image.alt = "Pré-visualização";
    refs.itemImagePreview.append(image);
    refs.removeItemImage.hidden = false;
  }

  async function compressImage(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Escolhe uma imagem JPG, PNG ou WebP.");
    if (file.size > 8 * 1024 * 1024) throw new Error("A fotografia não pode exceder 8 MB.");
    const source = await fileToDataUrl(file);
    const image = await loadImage(source);
    const maxDimension = 1100;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    let result = canvas.toDataURL("image/jpeg", .82);
    if (result.length > 850000) result = canvas.toDataURL("image/jpeg", .68);
    if (result.length > 1250000) throw new Error("Não foi possível otimizar esta fotografia. Escolhe uma imagem mais pequena.");
    return result;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Não foi possível ler a fotografia."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("A fotografia parece estar danificada."));
      image.src = source;
    });
  }

  async function handleItemImage() {
    const file = refs.itemImage.files?.[0];
    if (!file) return;
    try {
      state.pendingImage = await compressImage(file);
      updateImagePreview();
    } catch (error) {
      refs.itemImage.value = "";
      showToast(error.message);
    }
  }

  function saveItem(event) {
    event.preventDefault();
    if (!refs.itemForm.reportValidity()) return;
    const category = selectedCategory();
    if (!category) return;
    const id = refs.itemId.value;
    let item = findItem(category, id);
    if (!item) {
      item = { id: makeId("item") };
      category.items.push(item);
    }
    item.name = refs.itemName.value.trim();
    item.description = refs.itemDescription.value.trim();
    item.priceCents = refs.itemPrice.value === "" ? null : Math.round(Math.max(0, Number(refs.itemPrice.value)) * 100);
    item.image = state.pendingImage;
    item.enabled = refs.itemEnabled.checked;
    item.available = refs.itemAvailable.checked;
    item.featured = refs.itemFeatured.checked;
    item.tags = [...new Set(refs.itemTags.value.split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 8);
    item.allergens = [...refs.allergenGrid.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    refs.itemDialog.close();
    markDirty();
    renderWorkspace();
    renderCategories();
  }

  function removeItem(category, item) {
    if (!window.confirm(`Remover “${item.name}” do menu?`)) return;
    const index = category.items.findIndex((entry) => entry.id === item.id);
    category.items.splice(index, 1);
    markDirty();
    render();
  }

  async function saveMenu() {
    state.data.updatedAt = new Date().toISOString();
    saveDraft(false);
    const apiPath = text(bootstrap.apiPath);
    const localApi = apiPath && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
    if (!localApi) {
      state.dirty = false;
      setStatus("dirty", "Rascunho por publicar");
      showToast("Rascunho guardado neste browser. Usa Publicar para o colocar online.");
      return;
    }
    try {
      setStatus("", "A guardar...");
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu: state.data }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Erro ${response.status}`);
      state.data = normalizeMenu(payload.menu || payload.data || state.data);
      state.dirty = false;
      state.needsPublish = Boolean(bootstrap.github?.repo);
      localStorage.removeItem(draftKey());
      setStatus("saved", state.needsPublish ? "Guardado localmente" : "Guardado");
      bindSettings();
      render();
      showToast("Menu guardado. A pré-visualização já foi atualizada.");
    } catch (error) {
      setStatus("dirty", "Erro ao guardar");
      showToast(error.message || "Não foi possível guardar o menu.");
    }
  }

  function exportMenu() {
    state.data.updatedAt = new Date().toISOString();
    const blob = new Blob([`${JSON.stringify(state.data, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `menu-${text(bootstrap.slug, "digital")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Cópia do menu descarregada.");
  }

  async function importMenu(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("A cópia JSON não pode exceder 10 MB.");
      return;
    }
    try {
      const imported = normalizeMenu(JSON.parse(await file.text()));
      if (!window.confirm(`Importar ${imported.categories.length} categorias e substituir o rascunho atual?`)) return;
      state.data = imported;
      state.data.updatedAt = new Date().toISOString();
      state.selectedCategoryId = state.data.categories[0]?.id || "";
      bindSettings();
      markDirty();
      render();
      showToast("Cópia importada. Confirma e publica quando estiver pronta.");
    } catch (_) {
      showToast("O ficheiro não contém um menu JSON válido.");
    } finally {
      refs.importFile.value = "";
    }
  }

  function openPublishDialog() {
    const github = bootstrap.github && typeof bootstrap.github === "object" ? bootstrap.github : {};
    refs.publishRepository.textContent = github.owner && github.repo ? `${github.owner}/${github.repo}` : "Repositório ainda não associado";
    refs.githubToken.value = "";
    setFormError(refs.publishError, github.owner && github.repo ? "" : "Publica primeiro o website pelo Gerador de Sites ou descarrega a cópia JSON.");
    refs.publishSubmit.disabled = !(github.owner && github.repo);
    refs.publishDialog.showModal();
  }

  function bytesToBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  async function githubRequest(url, token, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `GitHub devolveu o erro ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function publishMenu(event) {
    event.preventDefault();
    const github = bootstrap.github && typeof bootstrap.github === "object" ? bootstrap.github : {};
    const token = refs.githubToken.value.trim();
    if (!token) {
      setFormError(refs.publishError, "Introduz uma credencial GitHub temporária.");
      return;
    }
    if (!github.owner || !github.repo) {
      setFormError(refs.publishError, "Este website ainda não está associado a um repositório GitHub.");
      return;
    }
    refs.publishSubmit.disabled = true;
    refs.publishSubmit.textContent = "A publicar...";
    setFormError(refs.publishError, "");
    state.githubToken = token;
    try {
      const owner = encodeURIComponent(github.owner);
      const repo = encodeURIComponent(github.repo);
      const branch = github.branch || "main";
      const path = "menu/menu-data.json";
      const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      await githubRequest("https://api.github.com/user", state.githubToken);
      let sha = "";
      try {
        const current = await githubRequest(`${endpoint}?ref=${encodeURIComponent(branch)}`, state.githubToken);
        sha = current.sha || "";
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      state.data.updatedAt = new Date().toISOString();
      const body = {
        message: `Atualizar menu digital de ${state.data.business.name}`,
        content: bytesToBase64(`${JSON.stringify(state.data, null, 2)}\n`),
        branch,
      };
      if (sha) body.sha = sha;
      await githubRequest(endpoint, state.githubToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      state.githubToken = "";
      refs.githubToken.value = "";
      state.dirty = false;
      state.needsPublish = false;
      localStorage.removeItem(draftKey());
      refs.publishDialog.close();
      setStatus("saved", "Publicado no GitHub");
      showToast("Menu publicado. O GitHub Pages pode demorar alguns instantes a atualizar.");
    } catch (error) {
      state.githubToken = "";
      refs.githubToken.value = "";
      const message = error.status === 409
        ? "O menu foi alterado noutro local. Atualiza a página antes de tentar novamente."
        : error.status === 401 || error.status === 403
          ? "A credencial não é válida ou não tem permissão Contents: write neste repositório."
          : error.message || "Não foi possível publicar no GitHub.";
      setFormError(refs.publishError, message);
    } finally {
      refs.publishSubmit.disabled = false;
      refs.publishSubmit.textContent = "Publicar agora";
    }
  }

  function renderQr() {
    refs.qrBusinessName.textContent = state.data.business.name;
    refs.qrUrl.textContent = menuUrl();
    refs.qrCode.replaceChildren();
    if (typeof window.QRCode !== "function") {
      refs.qrCode.append(el("p", "form-error", "Não foi possível gerar o QR Code neste browser."));
      return;
    }
    new window.QRCode(refs.qrCode, {
      text: menuUrl(),
      width: 520,
      height: 520,
      colorDark: "#101412",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  }

  function openQr() {
    renderQr();
    refs.qrDialog.showModal();
  }

  function downloadQr() {
    const canvas = refs.qrCode.querySelector("canvas");
    const image = refs.qrCode.querySelector("img");
    if (!canvas && !image?.src) {
      showToast("O QR Code ainda não está pronto.");
      return;
    }
    const sourceCanvas = canvas || imageToCanvas(image);
    const quietZone = Math.max(32, Math.round(sourceCanvas.width * .08));
    const output = document.createElement("canvas");
    output.width = sourceCanvas.width + quietZone * 2;
    output.height = sourceCanvas.height + quietZone * 2;
    const context = output.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(sourceCanvas, quietZone, quietZone);
    const link = document.createElement("a");
    link.href = output.toDataURL("image/png");
    link.download = `qr-menu-${text(bootstrap.slug, "digital")}.png`;
    link.click();
  }

  function imageToCanvas(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 520;
    canvas.height = image.naturalHeight || 520;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function handleAction(event) {
    const target = event.target.closest("[data-action]");
    if (!target || !state.authenticated) return;
    const action = target.dataset.action;
    const category = state.data.categories.find((item) => item.id === (target.dataset.categoryId || state.selectedCategoryId));
    const item = findItem(category, target.dataset.itemId);
    if (action === "logout") {
      state.githubToken = "";
      window.location.reload();
    } else if (action === "save") saveMenu();
    else if (action === "open-publish") openPublishDialog();
    else if (action === "open-qr") openQr();
    else if (action === "export") exportMenu();
    else if (action === "import") refs.importFile.click();
    else if (action === "add-category") openCategoryDialog();
    else if (action === "edit-category" && selectedCategory()) openCategoryDialog(selectedCategory());
    else if (action === "select-category" && category) { state.selectedCategoryId = category.id; render(); }
    else if (action === "move-category-up" && category) {
      if (moveInList(state.data.categories, state.data.categories.indexOf(category), -1)) { markDirty(); render(); }
    } else if (action === "move-category-down" && category) {
      if (moveInList(state.data.categories, state.data.categories.indexOf(category), 1)) { markDirty(); render(); }
    } else if (action === "remove-category" && category) removeCategory(category);
    else if (action === "add-item" && selectedCategory()) openItemDialog();
    else if (action === "edit-item" && item) openItemDialog(item);
    else if (action === "remove-item" && item) removeItem(category, item);
    else if (action === "move-item-up" && item) {
      if (moveInList(category.items, category.items.indexOf(item), -1)) { markDirty(); render(); }
    } else if (action === "move-item-down" && item) {
      if (moveInList(category.items, category.items.indexOf(item), 1)) { markDirty(); render(); }
    } else if (action === "toggle-item-available" && item) {
      item.available = !item.available;
      markDirty();
      render();
    }
  }

  function bindEvents() {
    refs.loginForm.addEventListener("submit", handleLogin);
    refs.togglePin.addEventListener("click", () => {
      const visible = refs.pinInput.type === "text";
      refs.pinInput.type = visible ? "password" : "text";
      refs.togglePin.textContent = visible ? "Mostrar" : "Ocultar";
      refs.togglePin.setAttribute("aria-label", visible ? "Mostrar PIN" : "Ocultar PIN");
    });
    document.addEventListener("click", handleAction);
    document.querySelectorAll(".modal [value='cancel']").forEach((control) => {
      control.addEventListener("click", (event) => {
        event.preventDefault();
        control.closest("dialog")?.close();
      });
    });
    refs.categoryForm.addEventListener("submit", saveCategory);
    refs.itemForm.addEventListener("submit", saveItem);
    refs.itemImage.addEventListener("change", handleItemImage);
    refs.removeItemImage.addEventListener("click", () => {
      state.pendingImage = "";
      refs.itemImage.value = "";
      updateImagePreview();
    });
    refs.importFile.addEventListener("change", () => importMenu(refs.importFile.files?.[0]));
    refs.publishForm.addEventListener("submit", publishMenu);
    refs.downloadQr.addEventListener("click", downloadQr);
    refs.printQr.addEventListener("click", () => window.print());
    document.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.setting;
        state.data.settings[key] = input.type === "checkbox" ? input.checked : input.value;
        markDirty();
      });
      input.addEventListener("change", () => {
        if (input.dataset.setting === "template") showToast("O novo estilo aparece ao abrir o menu.");
      });
    });
    window.addEventListener("beforeunload", (event) => {
      state.githubToken = "";
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function enhanceCategoryRemoval() {
    const observer = new MutationObserver(() => {
      refs.categoryList.querySelectorAll(".category-row").forEach((row) => {
        if (row.querySelector("[data-action='remove-category']")) return;
        const categoryId = row.querySelector("[data-category-id]")?.dataset.categoryId;
        const controls = row.querySelector(".category-controls");
        if (!categoryId || !controls) return;
        const edit = button("✎", "edit-category-inline");
        const remove = button("×", "remove-category");
        edit.dataset.categoryId = categoryId;
        remove.dataset.categoryId = categoryId;
        edit.title = "Editar categoria";
        remove.title = "Remover categoria";
        edit.addEventListener("click", () => {
          const category = state.data.categories.find((item) => item.id === categoryId);
          if (category) openCategoryDialog(category);
        });
        controls.append(edit, remove);
      });
    });
    observer.observe(refs.categoryList, { childList: true });
  }

  function init() {
    queryRefs();
    bindEvents();
    enhanceCategoryRemoval();
    refs.pinInput.focus();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
