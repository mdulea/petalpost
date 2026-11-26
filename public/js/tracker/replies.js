// The tracker section of an open invitation's replies: the totals, the reply list, a refresh and the CSV download.
// With sub-events, the totals add a line for each sub-event, and each reply and the CSV add the answer to each.
import { repliesCsv, repliesCsvName } from '../csv.js';
import { subEventLabels } from '../invite.js';
import { answerTo } from '../rsvp.js';
import { answerLine, answerTotals } from '../sub-event-answers.js';
import { downloadCsv } from './download.js';
import { renderTotals } from './totals.js';

// The replies of the last load, which the CSV download writes.
let loadedReplies = [];
let loadedLabels = [];

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
    downloadCsv(repliesCsv(loadedReplies, lang, loadedLabels), repliesCsvName(lang, new Date()));
  });
}

function show({ responses, totals, invite }, { copy, formatTime, lang }) {
  const labels = subEventLabels(invite, lang);
  const { responses: count, yes, no, attending } = totals;
  renderTotals(document.getElementById('totals'), [
    [count, count === 1 ? copy.replyOne : copy.replyMany],
    [yes, yes === 1 ? copy.yesOne : copy.yesMany],
    [no, no === 1 ? copy.noOne : copy.noMany],
    [attending, attending === 1 ? copy.attendingOne : copy.attendingMany],
  ]);
  document.getElementById('totals').append(...answerTotals(labels, responses, lang));
  document
    .getElementById('responseList')
    .replaceChildren(
      ...responses.map((r) =>
        item(
          'reply',
          ['strong', r.name],
          ['span', r.attending ? copy.yesCount(r.partySize) : copy.no],
          ...labels.map(({ id, name }) => ['span', answerLine(name, answerTo(r, id), lang)]),
          ...(r.note ? [['p', r.note]] : []),
          ['span', `${r.updatedAt === r.createdAt ? copy.replied : copy.changed} ${formatTime(r.updatedAt)}`],
        ),
      ),
    );
  document.getElementById('noReplies').hidden = responses.length > 0;
  loadedReplies = responses;
  loadedLabels = labels;
}

export const section = { id: 'replies', modes: ['open'], init, show };
