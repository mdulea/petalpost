// Pure DOM-free formatters for sub-event answers, menu-option meal counts, and their tracker total lines.
// Listed in tests/check-dom-free.js so Node checks import it directly.
import { UI, normalizeLang } from './i18n.js';
import { answerTo, mealTally } from './rsvp.js';

// The line of one answer, from answerTo in rsvp.js, to the sub-event called name.
export function answerLine(name, answer, lang) {
  const copy = UI[normalizeLang(lang)].subEventReplies;
  return copy.line(name, answer ? copy.answer(answer) : copy.noAnswer);
}

// The answer lines of reply, one for each sub-event of labels in order.
export const answerLines = (labels, reply, lang) =>
  labels.map(({ id, name }) => answerLine(name, answerTo(reply, id), lang));

// The total lines of each sub-event of labels, from subEventTally or partySubEventTally in the same order.
export function answerTotalLines(labels, tallies, lang) {
  const copy = UI[normalizeLang(lang)].subEventReplies;
  return tallies.map((totals, i) => copy.totals({ name: labels[i].name, ...totals }));
}

// The meal line of reply for the menu options of labels: the count of each option, or "not given" for an attending
// reply without meal counts, such as one saved before the host added the menu. A declined reply and an invitation
// without menu options have no line, so the result is null.
export function mealLine(labels, reply, lang) {
  if (!labels.length || !reply?.attending) return null;
  const copy = UI[normalizeLang(lang)].menu;
  if (!reply.meals) return copy.noCounts;
  return copy.counts(labels.map(({ id, name }) => copy.count({ name, count: reply.meals[id] ?? 0 })).join(', '));
}

// The meal total lines of each menu option of labels over replies, plus a line for attending replies without meal
// counts when there are any. Empty without menu options.
export function mealTotalLines(labels, replies, lang) {
  if (!labels.length) return [];
  const copy = UI[normalizeLang(lang)].menu;
  const { options, missing } = mealTally(
    labels.map(({ id }) => id),
    replies,
  );
  const lines = options.map(({ count }, i) => copy.totals({ name: labels[i].name, count }));
  if (missing) lines.push(copy.missing(missing));
  return lines;
}
