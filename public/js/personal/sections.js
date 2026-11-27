// Both party links show the greeting and the host's latest update. The personal link adds the share button,
// RSVP deadline banner, published table assignment, and reply form in page order, coordinating mid-session deadline
// closing through an explicit callback seam.
import { UI } from '../i18n.js';
import { renderDeadline } from './deadline.js';
import { renderReply } from './reply.js';

function renderShare(_party, page) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-small';
  button.textContent = page.copy.showFriend;
  button.addEventListener('click', page.shareView);
  return button;
}

// Shows the party's table on the personal link page once the host publishes the seating plan.
function renderTable(party, { lang }) {
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

const sections = [renderShare, renderDeadline, renderTable, renderReply];

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
  if (!viewOnly) {
    const deadlineClosedListeners = [];
    let closed = Boolean(party.deadlineClosed);
    const sectionPage = {
      ...page,
      onDeadlineClosed(listener) {
        deadlineClosedListeners.push(listener);
      },
      closeDeadline(message = null) {
        if (closed) return;
        closed = true;
        for (const listener of deadlineClosedListeners) listener(message);
      },
    };
    container.append(...sections.map((render) => render(party, sectionPage)).filter(Boolean));
  }
  container.hidden = false;
}
