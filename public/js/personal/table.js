// Shows the party's table on the personal link page once the host publishes the seating plan.
import { UI } from '../i18n.js';

export function renderTable(party, { lang }) {
  if (!party.table) return null;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'personalTable';
  panel.setAttribute('aria-labelledby', 'personalTableHeading');
  const heading = document.createElement('h2');
  heading.id = 'personalTableHeading';
  heading.textContent = UI[lang].seating.guestHeading;
  const name = document.createElement('p');
  name.textContent = party.table;
  panel.append(heading, name);
  return panel;
}
