// The tracker section of an open invitation's replies: the totals, the reply list, a refresh and the CSV download.
import { repliesCsv, repliesCsvName } from '../csv.js';
import { downloadCsv } from './download.js';

// The replies of the last load, which the CSV download writes.
let loadedReplies = [];

// Guest names and notes are untrusted text, so every value enters the page as textContent.
function item(className, ...parts) {
  const li = document.createElement('li');
  li.className = className;
  for (const [tag, text] of parts) {
    const el = document.createElement(tag);
    el.textContent = text;
    li.append(el);
  }
  return li;
}

function init({ lang, load }) {
  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('downloadCsv').addEventListener('click', () => {
    downloadCsv(repliesCsv(loadedReplies, lang), repliesCsvName(lang, new Date()));
  });
}

function show({ responses, totals }, { lang, locale, copy }) {
  const total = (n, one, many) => item('total', ['strong', String(n)], ['span', n === 1 ? one : many]);
  document
    .getElementById('totals')
    .replaceChildren(
      total(totals.responses, copy.replyOne, copy.replyMany),
      total(totals.yes, copy.yesOne, copy.yesMany),
      total(totals.no, copy.noOne, copy.noMany),
      total(totals.attending, copy.attendingOne, copy.attendingMany),
    );
  const when = (iso) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(lang === 'ro' ? { hour12: false } : {}),
    });
  document
    .getElementById('responseList')
    .replaceChildren(
      ...responses.map((r) =>
        item(
          'reply',
          ['strong', r.name],
          ['span', r.attending ? copy.yesCount(r.partySize) : copy.no],
          ...(r.note ? [['p', r.note]] : []),
          ['span', `${r.updatedAt === r.createdAt ? copy.replied : copy.changed} ${when(r.updatedAt)}`],
        ),
      ),
    );
  document.getElementById('noReplies').hidden = responses.length > 0;
  loadedReplies = responses;
}

export const section = { id: 'replies', modes: ['open'], init, show };
