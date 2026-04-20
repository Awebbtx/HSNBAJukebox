const STYLE_ID = "layout-editor-style";
const STORAGE_PREFIX = "hsnba-layout-order";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .layout-controls {
      position: relative;
      display: flex;
      gap: 0.45rem;
      align-items: center;
      padding: 0.2rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.04);
    }

    .layout-btn {
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      color: #e8edf2;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.3rem 0.7rem;
      cursor: pointer;
    }

    .layout-btn:hover {
      border-color: rgba(245,166,35,0.7);
      color: #f5a623;
    }

    .layout-controls-host {
      display: inline-flex;
      align-items: center;
      margin-left: auto;
      margin-right: 0.4rem;
    }

    @media (max-width: 760px) {
      .layout-controls-host {
        order: 4;
        width: 100%;
        margin: 0.35rem 0 0;
        justify-content: flex-end;
      }
    }

    body.layout-editing [data-layout-item] {
      cursor: grab;
      position: relative;
      user-select: none;
      outline: 1px dashed rgba(245,166,35,0.45);
      outline-offset: 2px;
      transition: outline-color 120ms ease, background-color 120ms ease;
    }

    body.layout-editing [data-layout-item]::after {
      content: "⠿";
      position: absolute;
      bottom: 0.35rem;
      right: 0.4rem;
      font-size: 1rem;
      color: rgba(245,166,35,0.95);
      pointer-events: none;
      z-index: 3;
    }

    body.layout-editing [data-layout-item].dragging {
      opacity: 0.45;
      cursor: grabbing;
    }

    body.layout-editing [data-layout-item].drag-floating {
      position: fixed !important;
      left: -9999px !important;
      top: -9999px !important;
      width: var(--layout-drag-width, auto) !important;
      pointer-events: none !important;
      opacity: 0 !important;
      margin: 0 !important;
      z-index: -1 !important;
    }

    body.layout-editing .layout-drag-placeholder {
      border: 1px dashed rgba(245,166,35,0.7);
      border-radius: 8px;
      background: rgba(245,166,35,0.14);
      min-height: 44px;
      box-sizing: border-box;
    }

    body.layout-editing [data-layout-container].layout-drop-active {
      outline: 1px solid rgba(245,166,35,0.55);
      outline-offset: 6px;
      border-radius: 10px;
    }
  `;
  document.head.appendChild(style);
}

function getContainerKey(container, index) {
  const id = container.getAttribute("data-layout-container") || `container-${index}`;
  return `${STORAGE_PREFIX}:${window.location.pathname}:${id}`;
}

function getItemId(item) {
  return item.getAttribute("data-layout-id") || "";
}

function saveOrder(container, storageKey) {
  const ids = Array.from(container.querySelectorAll("[data-layout-item]"))
    .map((item) => getItemId(item))
    .filter(Boolean);
  if (!ids.length) return;
  localStorage.setItem(storageKey, JSON.stringify(ids));
}

function restoreOrder(container, storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;

  let savedIds = [];
  try {
    savedIds = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(savedIds) || !savedIds.length) return;

  const byId = new Map();
  for (const item of container.querySelectorAll("[data-layout-item]")) {
    const id = getItemId(item);
    if (id) byId.set(id, item);
  }

  for (const id of savedIds) {
    const item = byId.get(id);
    if (item) container.appendChild(item);
  }
}

function createControls(onToggle, onReset) {
  const host = document.createElement("div");
  host.className = "layout-controls-host";

  const controls = document.createElement("div");
  controls.className = "layout-controls";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "layout-btn";
  toggleBtn.classList.add("layout-edit-toggle");
  toggleBtn.textContent = "Edit";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "layout-btn";
  resetBtn.classList.add("layout-reset-btn");
  resetBtn.textContent = "Reset";

  toggleBtn.addEventListener("click", () => {
    const editing = onToggle();
    toggleBtn.textContent = editing ? "Done" : "Edit";
  });

  resetBtn.addEventListener("click", onReset);

  controls.appendChild(toggleBtn);
  controls.appendChild(resetBtn);
  host.appendChild(controls);

  const topBar = document.querySelector(".top-bar");
  const logoutBtn = topBar?.querySelector("#logoutBtn, .btn-ghost");
  if (topBar && logoutBtn) {
    topBar.insertBefore(host, logoutBtn);
  } else if (topBar) {
    topBar.appendChild(host);
  } else {
    document.body.appendChild(host);
  }
}

function initLayoutEditor() {
  const containers = Array.from(document.querySelectorAll("[data-layout-container]"));
  if (!containers.length) return;

  injectStyles();

  const defaults = new Map();
  const containerMeta = new Map();

  containers.forEach((container, index) => {
    const storageKey = getContainerKey(container, index);
    containerMeta.set(container, storageKey);
    defaults.set(container, Array.from(container.querySelectorAll("[data-layout-item]"))
      .map((item) => getItemId(item))
      .filter(Boolean));
    restoreOrder(container, storageKey);
  });

  let editing = false;
  let draggedItem = null;
  let sourceContainer = null;
  let activeContainer = null;
  let placeholder = null;
  let dragHideTimer = null;

  const setEditing = (value) => {
    editing = value;
    document.body.classList.toggle("layout-editing", editing);
    for (const container of containers) {
      for (const item of container.querySelectorAll("[data-layout-item]")) {
        item.draggable = editing;
      }
    }
    return editing;
  };

  const onDragStart = (event) => {
    if (!editing) return;
    const item = event.target.closest("[data-layout-item]");
    if (!item) return;
    draggedItem = item;
    sourceContainer = item.parentElement;
    placeholder = document.createElement("div");
    placeholder.className = "layout-drag-placeholder";
    const rect = item.getBoundingClientRect();
    placeholder.style.height = `${Math.max(44, Math.round(rect.height))}px`;
    placeholder.style.width = `${Math.max(120, Math.round(rect.width))}px`;
    if (sourceContainer) {
      sourceContainer.insertBefore(placeholder, item);
    }
    item.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", getItemId(item));
    }
    window.clearTimeout(dragHideTimer);
    dragHideTimer = window.setTimeout(() => {
      if (draggedItem === item) {
        item.style.setProperty("--layout-drag-width", `${Math.max(120, Math.round(rect.width))}px`);
        item.classList.add("drag-floating");
      }
    }, 0);
  };

  const getDropReferenceNode = (container, clientX, clientY) => {
    const siblings = Array.from(container.querySelectorAll("[data-layout-item]:not(.dragging)"));
    if (!siblings.length) return null;

    let bestSibling = null;
    let bestRect = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const sibling of siblings) {
      const rect = sibling.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const distance = Math.hypot(clientX - centerX, clientY - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSibling = sibling;
        bestRect = rect;
      }
    }

    if (!bestSibling || !bestRect) return null;

    const midY = bestRect.top + (bestRect.height / 2);
    const midX = bestRect.left + (bestRect.width / 2);
    const closeToMiddleY = Math.abs(clientY - midY) <= Math.max(8, bestRect.height * 0.12);
    const insertBefore = clientY < midY || (closeToMiddleY && clientX < midX);
    return insertBefore ? bestSibling : bestSibling.nextSibling;
  };

  const setActiveContainer = (container) => {
    if (activeContainer === container) return;
    if (activeContainer) {
      activeContainer.classList.remove("layout-drop-active");
    }
    activeContainer = container || null;
    if (activeContainer) {
      activeContainer.classList.add("layout-drop-active");
    }
  };

  const onDragOver = (event) => {
    if (!editing || !draggedItem) return;
    const container = event.currentTarget;
    event.preventDefault();
    setActiveContainer(container);

    const referenceNode = getDropReferenceNode(container, event.clientX, event.clientY);
    if (!placeholder) return;
    if (!referenceNode) {
      container.appendChild(placeholder);
      return;
    }
    container.insertBefore(placeholder, referenceNode);
  };

  const finishDrag = () => {
    if (!draggedItem) return;

    window.clearTimeout(dragHideTimer);
    draggedItem.classList.remove("drag-floating");
    draggedItem.style.removeProperty("--layout-drag-width");

    if (placeholder && placeholder.parentElement) {
      placeholder.parentElement.insertBefore(draggedItem, placeholder);
      placeholder.remove();
    }

    draggedItem.classList.remove("dragging");
    setActiveContainer(null);

    if (sourceContainer && containerMeta.has(sourceContainer)) {
      saveOrder(sourceContainer, containerMeta.get(sourceContainer));
    }
    const currentContainer = draggedItem.parentElement;
    if (currentContainer && containerMeta.has(currentContainer)) {
      saveOrder(currentContainer, containerMeta.get(currentContainer));
    }

    draggedItem = null;
    sourceContainer = null;
    placeholder = null;
    dragHideTimer = null;
  };

  const onDragEnd = () => {
    finishDrag();
  };

  const onDrop = (event) => {
    if (!editing) return;
    event.preventDefault();
    setActiveContainer(event.currentTarget || null);
    finishDrag();
  };

  containers.forEach((container) => {
    container.addEventListener("dragstart", onDragStart);
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);
    container.addEventListener("dragend", onDragEnd);
  });

  document.addEventListener("click", (event) => {
    if (!editing) return;
    const anchor = event.target.closest("a");
    if (anchor && anchor.closest("[data-layout-item]")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  createControls(
    () => setEditing(!editing),
    () => {
      for (const container of containers) {
        const defaultIds = defaults.get(container) || [];
        const byId = new Map();
        for (const item of container.querySelectorAll("[data-layout-item]")) {
          const id = getItemId(item);
          if (id) byId.set(id, item);
        }
        for (const id of defaultIds) {
          const item = byId.get(id);
          if (item) container.appendChild(item);
        }
        const storageKey = containerMeta.get(container);
        if (storageKey) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  );

  setEditing(false);
}

initLayoutEditor();
