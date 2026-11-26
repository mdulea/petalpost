// The meal counts of a reply in the guest's open-mode form, the personal link form and the tracker's reply forms, and
// the meal lines and totals in the tracker. Option names are host text and guest data is untrusted, so both enter the
// page as textContent.
import { UI } from './i18n.js';
import { mealTally } from './rsvp.js';

/**
 * One fieldset with a number input for each menu option of labels, from menuLabels in invite.js. prefix keeps the
 * input ids unique on the page, and limit is the most people one reply takes. The caller disables element, which is
 * the fieldset, while the reply declines.
 * @param {{id: string, name: string}[]} labels
 * @param {{prefix: string, limit: number, lang: string}} options
 */
export function mealFields(labels, { prefix, limit, lang }) {
  const copy = UI[lang].menu;
  const element = document.createElement('fieldset');
  element.className = 'meal-counts';
  const legend = document.createElement('legend');
  legend.className = 'field-label';
  legend.textContent = copy.legend;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.id = `${prefix}-hint`;
  hint.textContent = copy.hint;
  element.append(legend, hint);
  element.setAttribute('aria-describedby', hint.id);
  const inputs = labels.map(({ id, name }, i) => {
    const label = document.createElement('label');
    label.htmlFor = `${prefix}-${i}`;
    label.textContent = name;
    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'number';
    input.id = label.htmlFor;
    input.min = '0';
    input.max = String(limit);
    const row = document.createElement('div');
    row.className = 'meal-count';
    row.append(label, input);
    element.append(row);
    return { id, input };
  });
  return {
    element,
    focusTarget: inputs[0]?.input,
    // Shows the meal counts of reply, or 0 for each option without a count, such as before a reply.
    fill(reply) {
      for (const { id, input } of inputs) input.value = String(reply?.meals?.[id] ?? 0);
    },
    // The meals for makeReply. An empty or unreadable input gives NaN, which makeReply refuses.
    read() {
      return Object.fromEntries(inputs.map(({ id, input }) => [id, input.valueAsNumber]));
    },
  };
}

// The meal line of reply for the menu options of labels: the count of each option, or "not given" for an attending
// reply without meal counts, such as one saved before the host added the menu. A declined reply and an invitation
// without menu options have no line, so the result is null.
export function mealLine(labels, reply, lang) {
  if (!labels.length || !reply?.attending) return null;
  const copy = UI[lang].menu;
  if (!reply.meals) return copy.noCounts;
  return copy.counts(labels.map(({ id, name }) => copy.count({ name, count: reply.meals[id] ?? 0 })).join(', '));
}

// The meal totals of each menu option of labels over replies, as items for the tracker's totals list, and one item
// for the attending replies without meal counts when there are any. The list is empty without menu options.
export function mealTotals(labels, replies, lang) {
  if (!labels.length) return [];
  const copy = UI[lang].menu;
  const { options, missing } = mealTally(
    labels.map(({ id }) => id),
    replies,
  );
  const lines = options.map(({ count }, i) => copy.totals({ name: labels[i].name, count }));
  if (missing) lines.push(copy.missing(missing));
  return lines.map((text) => {
    const item = document.createElement('li');
    item.className = 'total total-line meal-total';
    item.textContent = text;
    return item;
  });
}
