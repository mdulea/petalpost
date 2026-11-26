// Sections of the authenticated personal link, in page order. Each section receives the same party read and
// returns its own element. Register another section here without changing existing sections.
import { renderReply } from './reply.js';

const sections = [renderReply];

export function showPersonalSections(party, page) {
  const container = document.getElementById('personalSections');
  const greeting = document.createElement('h2');
  greeting.textContent = page.copy.greeting(party.name);
  container.replaceChildren(greeting, ...sections.map((render) => render(party, page)));
  container.hidden = false;
}
