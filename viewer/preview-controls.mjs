export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true'); if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `./icons.svg#${name}`); svg.append(use); return svg;
}
export function installIcons() { document.querySelectorAll('[data-icon]').forEach(node => node.prepend(icon(node.dataset.icon))); }

export class SelectControl {
  constructor(root, { label, iconName = 'cube', search = true, onChange }) {
    this.root = root; this.onChange = onChange; this.items = []; this.value = ''; this.opened = false; this.active = 0;
    const id = root.id;
    this.trigger = document.createElement('button'); this.trigger.className = 'select-trigger'; this.trigger.id = `${id}-trigger`;
    this.trigger.type = 'button'; this.trigger.setAttribute('role', 'combobox'); this.trigger.setAttribute('aria-label', label);
    this.trigger.setAttribute('aria-expanded', 'false'); this.trigger.setAttribute('aria-haspopup', 'listbox'); this.trigger.setAttribute('aria-controls', `${id}-options`);
    this.text = document.createElement('span'); this.text.className = 'select-value';
    this.trigger.append(icon(iconName, 'select-icon'), this.text, icon('chevron-down', 'select-chevron'));
    this.popup = document.createElement('div'); this.popup.className = 'select-popup'; this.popup.hidden = true; this.popup.setAttribute('popover', 'manual');
    if (search) {
      const wrap = document.createElement('div'); wrap.className = 'select-search-wrap';
      this.search = document.createElement('input'); this.search.type = 'search'; this.search.className = 'select-search'; this.search.placeholder = 'Найти в списке…';
      this.search.setAttribute('aria-label', `Поиск: ${label}`); this.search.setAttribute('role', 'combobox'); this.search.setAttribute('aria-controls', `${id}-options`); this.search.setAttribute('aria-expanded', 'true'); this.search.setAttribute('aria-autocomplete', 'list');
      wrap.append(icon('search'), this.search); this.popup.append(wrap);
      this.search.addEventListener('input', () => { this.active = 0; this.renderOptions(); });
    }
    this.list = document.createElement('div'); this.list.className = 'select-options'; this.list.id = `${id}-options`; this.list.setAttribute('role', 'listbox'); this.list.setAttribute('aria-label', label);
    this.popup.append(this.list); root.append(this.trigger, this.popup);
    this.trigger.addEventListener('click', () => this.opened ? this.close() : this.open());
    this.trigger.addEventListener('keydown', e => this.key(e)); this.search?.addEventListener('keydown', e => this.key(e));
    document.addEventListener('pointerdown', e => { if (this.opened && !root.contains(e.target)) this.close(false); });
    root.addEventListener('focusout', () => setTimeout(() => { if (this.opened && !root.contains(document.activeElement)) this.close(false); }, 0));
    window.addEventListener('resize', () => this.close(false));
  }
  setOptions(items) { this.items = items; if (!items.some(i => i.value === this.value)) this.value = items[0]?.value || ''; this.setValue(this.value); }
  setValue(value) { this.value = String(value); this.text.textContent = this.items.find(i => i.value === this.value)?.label || 'Не выбрано'; if (this.opened) this.renderOptions(); }
  filtered() { const term = this.search?.value.toLocaleLowerCase() || ''; return this.items.filter(i => i.label.toLocaleLowerCase().includes(term)); }
  renderOptions() {
    this.list.replaceChildren(); const items = this.filtered(); this.active = Math.max(0, Math.min(this.active, items.length - 1));
    for (const [index, item] of items.entries()) {
      const node = document.createElement('div'); node.className = 'select-option'; node.setAttribute('role', 'option'); node.id = `${this.root.id}-option-${index}`;
      node.setAttribute('aria-selected', String(item.value === this.value)); node.classList.toggle('is-highlighted', index === this.active);
      const text = document.createElement('span'); text.textContent = item.label; node.append(icon(item.icon || 'cube'), text, icon('check', 'option-check'));
      node.addEventListener('pointermove', () => { if (this.active !== index) { this.active = index; this.highlight(); } });
      node.addEventListener('pointerdown', e => e.preventDefault()); node.addEventListener('click', () => this.choose(item)); this.list.append(node);
    }
    if (!items.length) { const empty = document.createElement('div'); empty.className = 'select-empty'; empty.textContent = 'Ничего не найдено'; this.list.append(empty); }
    this.highlight();
  }
  highlight() {
    const nodes = [...this.list.querySelectorAll('[role=option]')]; nodes.forEach((n, i) => n.classList.toggle('is-highlighted', i === this.active));
    for (const target of [this.trigger, this.search].filter(Boolean)) {
      if (nodes[this.active]) target.setAttribute('aria-activedescendant', nodes[this.active].id); else target.removeAttribute('aria-activedescendant');
    }
    nodes[this.active]?.scrollIntoView({ block: 'nearest' });
  }
  open() {
    this.opened = true; if (this.search) this.search.value = ''; this.active = Math.max(0, this.items.findIndex(i => i.value === this.value));
    this.popup.hidden = false; this.popup.showPopover(); this.trigger.setAttribute('aria-expanded', 'true'); this.renderOptions();
    const b = this.trigger.getBoundingClientRect(), width = Math.min(Math.max(b.width, this.search ? 250 : b.width), innerWidth - 24);
    Object.assign(this.popup.style, { position: 'fixed', inset: 'auto', margin: '0', minWidth: '0', width: `${width}px`, left: `${Math.max(12, Math.min(b.left, innerWidth - width - 12))}px`, top: `${b.bottom + 6}px` });
    const height = this.popup.getBoundingClientRect().height;
    if (b.bottom + height + 12 > innerHeight && b.top > height + 12) this.popup.style.top = `${b.top - height - 6}px`;
    (this.search || this.trigger).focus();
  }
  close(restore = true) { this.opened = false; this.popup.hidePopover(); this.popup.hidden = true; this.trigger.setAttribute('aria-expanded', 'false'); this.trigger.removeAttribute('aria-activedescendant'); if (restore) this.trigger.focus(); }
  choose(item) { this.setValue(item.value); this.close(); this.onChange?.(item.value); }
  key(e) {
    if (e.key === 'Escape' && this.opened) { e.preventDefault(); this.close(); return; }
    if (e.key === 'Tab') { this.close(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); if (!this.opened) { this.open(); return; }
      const n = this.filtered().length; this.active = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (this.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(n, 1); this.highlight();
    } else if (e.key === 'Enter' && this.opened) { e.preventDefault(); const item = this.filtered()[this.active]; if (item) this.choose(item); }
  }
}
