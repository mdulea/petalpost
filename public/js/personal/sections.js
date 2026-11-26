// Both party links show the greeting and the host's latest update. The personal link adds the sections in page order.
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

// The update is host text, so it enters the page as textContent.
function renderUpdate(updateNotice, copy) {
  const panel = document.createElement('section');
  panel.className = 'panel party-update';
  panel.id = 'partyUpdate';
  const heading = document.createElement('h3');
  heading.textContent = copy.updateHeading;
  const text = document.createElement('p');
  text.textContent = updateNotice;
  panel.append(heading, text);
  return panel;
}

export function showPersonalSections(party, page, viewOnly) {
  const container = document.getElementById('personalSections');
  const greeting = document.createElement('h2');
  greeting.textContent = page.copy.greeting(party.name);
  container.replaceChildren(greeting);
  if (party.updateNotice) container.append(renderUpdate(party.updateNotice, page.copy));
  if (!viewOnly) container.append(...sections.map((render) => render(party, page)).filter(Boolean));
  container.hidden = false;
}
