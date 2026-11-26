// The answers of a reply to each sub-event in the guest's open-mode form, the personal link form and the tracker's
// reply form, and the answer lines and totals in the tracker. Sub-event names are host text and guest data is
// untrusted, so both enter the page as textContent.
import { UI } from './i18n.js';
import { answerTo, subEventTally } from './rsvp.js';

/**
 * One fieldset for each sub-event of labels, from subEventLabels in invite.js, with a yes and a no choice and the
 * number of people, which is disabled while yes is not checked. prefix keeps the input ids and names unique on the
 * page, and limit is the most people one answer takes.
 * @param {{id: string, name: string}[]} labels
 * @param {{prefix: string, limit: number, lang: string}} options
 */
export function answerFields(labels, { prefix, limit, lang }) {
  const copy = UI[lang].subEventReplies;
  const element = document.createElement('div');
  element.className = 'sub-event-answers';
  const rows = labels.map(({ id, name }, i) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'sub-event-answer';
    const legend = document.createElement('legend');
    legend.className = 'field-label';
    legend.textContent = name;
    const choices = document.createElement('div');
    choices.className = 'choices';
    const choice = (value, text) => {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${prefix}-${i}-attending`;
      input.value = value;
      label.append(input, text);
      choices.append(label);
      return input;
    };
    const yes = choice('yes', copy.yes);
    const no = choice('no', copy.no);
    const sizeLabel = document.createElement('label');
    sizeLabel.htmlFor = `${prefix}-${i}-size`;
    sizeLabel.textContent = copy.people;
    const size = document.createElement('input');
    size.className = 'input';
    size.type = 'number';
    size.id = sizeLabel.htmlFor;
    size.name = `${prefix}-${i}-size`;
    size.min = '1';
    size.max = String(limit);
    fieldset.append(legend, choices, sizeLabel, size);
    return { id, yes, no, size };
  });
  element.append(...rows.map(({ yes }) => yes.closest('fieldset')));
  const sync = () => {
    for (const { yes, size } of rows) size.disabled = !yes.checked;
  };
  element.addEventListener('change', sync);
  return {
    element,
    focusTarget: rows[0]?.yes,
    // Shows the answers of reply. Without a reply, each sub-event shows yes with defaultSize people. A reply without
    // an answer to a sub-event, such as one saved before the host added it, leaves both choices unchecked.
    fill(reply, defaultSize) {
      for (const { id, yes, no, size } of rows) {
        const answer = reply ? answerTo(reply, id) : { attending: true, partySize: defaultSize };
        yes.checked = answer?.attending === true;
        no.checked = answer?.attending === false;
        size.value = String(answer?.attending ? answer.partySize : defaultSize);
      }
      sync();
    },
    // The answers for makeReply. A sub-event without a checked choice has a null attending, which makeReply refuses.
    read() {
      return Object.fromEntries(
        rows.map(({ id, yes, no, size }) => [
          id,
          { attending: yes.checked || (no.checked ? false : null), partySize: yes.checked ? size.valueAsNumber : 0 },
        ]),
      );
    },
  };
}

// The line of one answer, from answerTo in rsvp.js, to the sub-event called name.
export function answerLine(name, answer, lang) {
  const copy = UI[lang].subEventReplies;
  return copy.line(name, answer ? copy.answer(answer) : copy.noAnswer);
}

// A list of the answers of reply, one line for each sub-event of labels.
export function answerList(labels, reply, lang) {
  const list = document.createElement('ul');
  list.className = 'sub-event-replies';
  for (const { id, name } of labels) {
    const item = document.createElement('li');
    item.textContent = answerLine(name, answerTo(reply, id), lang);
    list.append(item);
  }
  return list;
}

// The totals of each sub-event of labels over replies, as items for the tracker's totals list. The list is empty
// without sub-events.
export function answerTotals(labels, replies, lang) {
  const copy = UI[lang].subEventReplies;
  return subEventTally(
    labels.map(({ id }) => id),
    replies,
  ).map((totals, i) => {
    const item = document.createElement('li');
    item.className = 'total total-line';
    item.textContent = copy.totals({ name: labels[i].name, ...totals });
    return item;
  });
}
