/** Tiny DOM helpers shared by the UI panels. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(
  label: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function badge(text: string, kind: 'prov' | 'vendor' | 'assumed' | 'info'): HTMLSpanElement {
  return el('span', `badge badge-${kind}`, text);
}

export function statusBadge(status: 'vendor-datasheet' | 'provisional' | 'assumed'): HTMLSpanElement {
  switch (status) {
    case 'vendor-datasheet':
      return badge('VENDOR DATA', 'vendor');
    case 'provisional':
      return badge('PROVISIONAL', 'prov');
    case 'assumed':
      return badge('ASSUMED', 'assumed');
  }
}
