// The tracker section of an open invitation's replies: the totals, the reply list, a refresh and the CSV download.
import { repliesCsv, repliesCsvName } from '../csv.js';
import { downloadCsv } from './download.js';
import { renderTotals } from './totals.js';

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

function show({ responses, totals }, { copy, formatTime }) {
  const { responses: count, yes, no, attending } = totals;
  renderTotals(document.getElementById('totals'), [
    [count, count === 1 ? copy.replyOne : copy.replyMany],
    [yes, yes === 1 ? copy.yesOne : copy.yesMany],
    [no, no === 1 ? copy.noOne : copy.noMany],
    [attending, attending === 1 ? copy.attendingOne : copy.attendingMany],
  ]);
  document
    .getElementById('responseList')
    .replaceChildren(
      ...responses.map((r) =>
        item(
          'reply',
          ['strong', r.name],
          ['span', r.attending ? copy.yesCount(r.partySize) : copy.no],
          ...(r.note ? [['p', r.note]] : []),
          ['span', `${r.updatedAt === r.createdAt ? copy.replied : copy.changed} ${formatTime(r.updatedAt)}`],
        ),
      ),
    );
  document.getElementById('noReplies').hidden = responses.length > 0;
  loadedReplies = responses;
}

export const section = { id: 'replies', modes: ['open'], init, show };
