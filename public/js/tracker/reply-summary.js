// DOM-only tracker list and totals renderers for sub-event answers and menu-option meal counts.
// Pure text formatting lives in public/js/reply-format.js.
import { answerLines, answerTotalLines, mealTotalLines } from '../reply-format.js';

// A list of the answers of reply, one line for each sub-event of labels.
export function answerList(labels, reply, lang) {
  const list = document.createElement('ul');
  list.className = 'sub-event-replies';
  for (const text of answerLines(labels, reply, lang)) {
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  }
  return list;
}

// The totals of each sub-event of labels as items for the tracker's totals list.
export function answerTotals(labels, tallies, lang) {
  return answerTotalLines(labels, tallies, lang).map((text) => {
    const item = document.createElement('li');
    item.className = 'total total-line';
    item.textContent = text;
    return item;
  });
}

// The meal totals of each menu option of labels over replies as items for the tracker's totals list.
export function mealTotals(labels, replies, lang) {
  return mealTotalLines(labels, replies, lang).map((text) => {
    const item = document.createElement('li');
    item.className = 'total total-line meal-total';
    item.textContent = text;
    return item;
  });
}
