// Renders counts and their labels in a tracker totals list.
export function renderTotals(list, totals) {
  list.replaceChildren(
    ...totals.map(([n, text]) => {
      const item = document.createElement('li');
      item.className = 'total';
      const count = document.createElement('strong');
      count.textContent = String(n);
      const label = document.createElement('span');
      label.textContent = String(text);
      item.append(count, ' ', label);
      return item;
    }),
  );
}
