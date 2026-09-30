/** Minimal DOM helpers. Text goes in via textContent, never innerHTML, so
    customer-supplied strings cannot inject markup. */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;          // only for trusted, code-authored markup
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    }
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function field(labelText, control) {
  return el('label', { class: 'field' }, [el('span', { text: labelText }), control]);
}

export function select(options, value, onChange, attrs = {}) {
  const node = el('select', { ...attrs, onChange });
  for (const opt of options) {
    node.append(el('option', {
      value: opt.value,
      text: opt.label,
      selected: String(opt.value) === String(value)
    }));
  }
  return node;
}

export function numberInput(value, onInput, attrs = {}) {
  return el('input', {
    type: 'number', inputmode: 'decimal', min: '0', step: attrs.step || '1',
    value: value ?? 0, onInput, ...attrs
  });
}

let toastTimer;
export function toast(message, kind = 'info') {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.className = kind === 'error' ? 'toast toast--error' : 'toast';
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, kind === 'error' ? 6000 : 3000);
}

export function confirmAction(message) {
  return window.confirm(message);
}
