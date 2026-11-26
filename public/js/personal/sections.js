// Both party links show the greeting. The personal link adds the sections in page order.
import { renderDeadline } from './deadline.js';
import { renderReply } from './reply.js';

function renderShare(party, page) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-small';
  button.textContent = page.copy.showFriend;
  button.addEventListener('click', page.shareView);
  return button;
}

const sections = [renderShare, renderDeadline, renderReply];

export function showPersonalSections(party, page, viewOnly) {
  const container = document.getElementById('personalSections');
  const greeting = document.createElement('h2');
  greeting.textContent = page.copy.greeting(party.name);
  container.replaceChildren(greeting);
  if (!viewOnly) container.append(...sections.map((render) => render(party, page)).filter(Boolean));
  container.hidden = false;
}
