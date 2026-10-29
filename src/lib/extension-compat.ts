// Some browser security extensions annotate server HTML before React starts.
// Remove only the nonsemantic markers seen in the reported mismatch, including
// markers on Next's own metadata wrapper. Stop observing after initial startup.
export const extensionCompatibilityScript = `(() => {
  const isMarker = name => name === 'bis_skin_checked' || name === 'bis_register' || /^__processed_[a-f0-9_-]+$/i.test(name);
  const clean = element => {
    if (!(element instanceof Element)) return;
    for (const attribute of Array.from(element.attributes)) {
      if (isMarker(attribute.name)) element.removeAttribute(attribute.name);
    }
  };
  const scan = node => {
    if (!(node instanceof Element)) return;
    clean(node);
    node.querySelectorAll('*').forEach(clean);
  };
  scan(document.documentElement);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && isMarker(record.attributeName || '')) clean(record.target);
      else if (record.type === 'childList') record.addedNodes.forEach(scan);
    }
  });
  observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true});
  setTimeout(() => observer.disconnect(), 10000);
})();`;
