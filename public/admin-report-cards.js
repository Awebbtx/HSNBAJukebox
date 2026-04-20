/* Shared report card renderer — window.RC
   Load this as a plain <script> before any report page module scripts. */
(() => {
  "use strict";

  function esc(v) {
    return `${v ?? ""}`
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Renders a labelled detail field.
   * @param {string} label
   * @param {*}      value     — will be stringified; empty values are omitted
   * @param {object} [opts]
   * @param {boolean} [opts.fullWidth] — spans all columns, value rendered pre-wrap
   * @param {boolean} [opts.raw]       — treat value as already-safe HTML
   */
  function field(label, value, opts = {}) {
    const v = `${value ?? ""}`.trim();
    if (!v) return "";
    const display = opts.raw ? value : esc(v);
    const cls = `rc-field${opts.fullWidth ? " rc-field-full" : ""}`;
    return `<div class="${cls}">
  <span class="rc-label">${esc(label)}</span>
  <div class="rc-value">${display}</div>
</div>`;
  }

  /**
   * Renders a small summary chip shown on the card header row.
   * @param {string} label   — bold prefix (pass "" or null for no prefix)
   * @param {*}      value   — plain text value
   */
  function chip(label, value) {
    const v = `${value ?? ""}`.trim();
    if (!v) return "";
    const inner = label
      ? `<strong>${esc(label)}</strong>${esc(v)}`
      : esc(v);
    return `<span class="rc-chip">${inner}</span>`;
  }

  /**
   * Renders an inline status badge (appears after the title text).
   * @param {string} text
   * @param {"in"|"out"|"type"|"warn"|"info"} [type]
   */
  function badge(text, type = "type") {
    if (!`${text ?? ""}`.trim()) return "";
    return `<span class="rc-badge rc-badge-${esc(type)}">${esc(text)}</span>`;
  }

  /**
   * Renders a full record card.
   * @param {object} opts
   * @param {string}   [opts.thumb]   — image URL (optional)
   * @param {string}    opts.title    — primary heading HTML (already-safe or raw HTML link)
   * @param {string[]} [opts.chips]   — chip HTML strings from RC.chip()
   * @param {string[]} [opts.fields]  — field HTML strings from RC.field()
  * @param {string}   [opts.toggle]  — button label (default "Details")
  * @param {string}   [opts.headerAction] — optional action HTML shown before toggle
   */
  function card({ thumb, title, chips = [], fields = [], toggle = "Details", headerAction = "" }) {
    const thumbHtml = thumb
      ? `<img class="rc-thumb" src="${esc(thumb)}" alt="" loading="lazy">`
      : "";
    const chipsHtml = chips.filter(Boolean).join("");
    const fieldsHtml = fields.filter(Boolean).join("");
    const hasFields = fieldsHtml.length > 0;

    const toggleBtn = hasFields
      ? `<button class="rc-toggle" aria-expanded="false"
         >${esc(toggle)} <span class="rc-chevron" aria-hidden="true">▾</span></button>`
      : "";

    const detailPanel = hasFields
      ? `<div class="rc-details" hidden><div class="rc-dl">${fieldsHtml}</div></div>`
      : "";

    return `<div class="rc-card">
  <div class="rc-header" role="button" tabindex="0"
       onclick="(function(el){
         const d=el.closest('.rc-card').querySelector('.rc-details');
         if(!d)return;
         const btn=el.querySelector('.rc-toggle');
         const open=btn&&btn.getAttribute('aria-expanded')==='true';
         if(open){d.hidden=true;if(btn)btn.setAttribute('aria-expanded','false');}
         else{d.hidden=false;if(btn)btn.setAttribute('aria-expanded','true');}
       })(this)"
       onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
    ${thumbHtml}
    <div class="rc-main">
      <span class="rc-title">${title}</span>
      <div class="rc-chips">${chipsHtml}</div>
    </div>
    ${headerAction || ""}
    ${toggleBtn}
  </div>
  ${detailPanel}
</div>`;
  }

  /**
   * Wraps a group of cards under a labelled heading.
   * @param {string} title
   * @param {number} count
   * @param {string} cardsHtml — pre-rendered card HTML concatenated
   */
  function group(title, count, cardsHtml) {
    return `<div class="rc-group">
  <div class="rc-group-title">${esc(title)} <span>(${count})</span></div>
  <div class="rc-list">${cardsHtml}</div>
</div>`;
  }

  /**
   * Wraps cards in a list container with optional expand-all / collapse-all controls.
   * @param {string[]} cards   — card HTML strings
   * @param {number}  [count]  — total record count to display
   */
  function list(cards, count) {
    const total = count !== undefined ? count : cards.length;
    const controls = `<div class="rc-controls">
  <button class="rc-ctrl-btn" onclick="RC._expandAll(this.closest('.rc-controls').nextElementSibling)">Expand All</button>
  <button class="rc-ctrl-btn" onclick="RC._collapseAll(this.closest('.rc-controls').nextElementSibling)">Collapse All</button>
  <span class="rc-count">${total} record${total === 1 ? "" : "s"}</span>
</div>`;
    return `${controls}<div class="rc-list">${cards.join("")}</div>`;
  }

  function _expandAll(container) {
    container.querySelectorAll(".rc-details[hidden]").forEach((d) => {
      d.hidden = false;
    });
    container.querySelectorAll(".rc-toggle[aria-expanded='false']").forEach((btn) => {
      btn.setAttribute("aria-expanded", "true");
    });
  }

  function _collapseAll(container) {
    container.querySelectorAll(".rc-details:not([hidden])").forEach((d) => {
      d.hidden = true;
    });
    container.querySelectorAll(".rc-toggle[aria-expanded='true']").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  window.RC = { esc, field, chip, badge, card, group, list, _expandAll, _collapseAll };
})();
