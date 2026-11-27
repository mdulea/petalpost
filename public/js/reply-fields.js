// Unified client reply fields module shared by the open-mode reply form, the personal-link reply form, and the
// tracker host reply form. Owns single-vs-sub-event switching, menu-option disable synchronization, uniform numeric
// parsing, tab-to-space sanitization, note character counting, validation via makeReply, and focus targets.
// Sub-event names, menu option names and guest values always enter the DOM as textContent or input values.
import { UI } from './i18n.js';
import { charsLeft } from './invite.js';
import { answerTo, makeReply, REPLY_FIELDS, REPLY_LIMITS } from './rsvp.js';

// Attaches a live character counter after input, announcing once when typing reaches the limit.
// With codePoints, counts Unicode code points as makeReply does; otherwise sets maxLength and counts UTF-16 units.
export function attachCounter(input, limit, { lang, codePoints = false, liveRegion = null }) {
  const copy = UI[lang].editor;
  if (!codePoints) input.maxLength = limit;
  const counter = document.createElement('span');
  counter.className = 'counter';
  counter.id = `${input.id}Count`;
  counter.hidden = true;
  input.after(counter);
  input.setAttribute(
    'aria-describedby',
    [input.getAttribute('aria-describedby'), counter.id].filter(Boolean).join(' '),
  );
  const length = codePoints ? (text) => [...text].length : (text) => text.length;
  let count = 0;
  const refresh = () => {
    if (liveRegion) liveRegion.textContent = '';
    count = length(input.value);
    const left = charsLeft(count, limit);
    counter.hidden = left === null;
    counter.textContent = left === null ? '' : copy.charsLeft(left);
  };
  input.addEventListener('input', () => {
    const before = count;
    refresh();
    if (liveRegion && count >= limit && before < limit) liveRegion.textContent = copy.charsLeft(0);
  });
  refresh();
  return { refresh };
}

/**
 * One fieldset with a number input for each menu option of labels. Also used by the tracker's seat editor.
 * @param {{id: string, name: string}[]} labels
 * @param {{prefix: string, limit: number, lang: string}} options
 */
export function createMealFields(labels, { prefix, limit, lang }) {
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
    focusTarget: inputs[0]?.input ?? null,
    fill(reply) {
      for (const { id, input } of inputs) input.value = String(reply?.meals?.[id] ?? 0);
    },
    read() {
      return Object.fromEntries(inputs.map(({ id, input }) => [id, input.valueAsNumber]));
    },
  };
}

/**
 * One fieldset per sub-event with yes/no choices and a people count disabled unless yes is checked.
 * @param {{id: string, name: string}[]} labels
 * @param {{prefix: string, limit: number, lang: string}} options
 */
function createSubEventFields(labels, { prefix, limit, lang }) {
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
    focusTarget: rows[0]?.yes ?? null,
    sync,
    fill(reply, defaultSize) {
      for (const { id, yes, no, size } of rows) {
        const answer = reply ? answerTo(reply, id) : { attending: true, partySize: defaultSize };
        yes.checked = answer?.attending === true;
        no.checked = answer?.attending === false;
        size.value = String(answer?.attending ? answer.partySize : defaultSize);
      }
      sync();
    },
    read() {
      return Object.fromEntries(
        rows.map(({ id, yes, no, size }) => [
          id,
          { attending: yes.checked || (no.checked ? false : null), partySize: yes.checked ? size.valueAsNumber : 0 },
        ]),
      );
    },
    anyAttending() {
      return rows.some(({ yes }) => yes.checked);
    },
  };
}

// Builds standard attending/seats/note controls when the form does not supply existing static HTML inputs.
/**
 * @param {{
 *   prefix: string,
 *   ids?: { attending?: string, yes?: string, no?: string, seats?: string, note?: string },
 *   limit: number,
 *   copy: { attending: string, yes: string, no: string, seats: string, note: string, noteHint?: string },
 *   hasSubEvents: boolean,
 *   answersElement?: HTMLElement,
 *   mealsElement?: HTMLElement,
 * }} options
 */
function buildGeneratedControls({ prefix, ids = {}, limit, copy, hasSubEvents, answersElement, mealsElement }) {
  const fragment = document.createDocumentFragment();
  let attendingField = null;
  let yes = null;
  let no = null;
  let partySizeInput = null;

  if (hasSubEvents) {
    fragment.append(answersElement);
  } else {
    attendingField = document.createElement('div');
    attendingField.className = 'field';
    attendingField.setAttribute('role', 'radiogroup');
    const attendingId = ids.attending ?? `${prefix}Attending`;
    attendingField.setAttribute('aria-labelledby', attendingId);
    const label = document.createElement('span');
    label.className = 'field-label';
    label.id = attendingId;
    label.textContent = copy.attending;
    const choices = document.createElement('div');
    choices.className = 'choices';
    const makeChoice = (value, text, id, checked) => {
      const choiceLabel = document.createElement('label');
      choiceLabel.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'attending';
      input.value = value;
      if (id) input.id = id;
      input.checked = checked;
      choiceLabel.append(input, text);
      choices.append(choiceLabel);
      return input;
    };
    yes = makeChoice('yes', copy.yes, ids.yes, true);
    no = makeChoice('no', copy.no, ids.no, false);
    attendingField.append(label, choices);

    const seatsField = document.createElement('div');
    seatsField.className = 'field';
    const seatsId = ids.seats ?? `${prefix}Seats`;
    const seatsLabel = document.createElement('label');
    seatsLabel.htmlFor = seatsId;
    seatsLabel.textContent = copy.seats;
    partySizeInput = document.createElement('input');
    partySizeInput.className = 'input';
    partySizeInput.type = 'number';
    partySizeInput.name = 'partySize';
    partySizeInput.id = seatsId;
    partySizeInput.min = '1';
    partySizeInput.max = String(limit);
    partySizeInput.required = true;
    seatsField.append(seatsLabel, partySizeInput);
    fragment.append(attendingField, seatsField);
  }

  if (mealsElement) fragment.append(mealsElement);

  const noteField = document.createElement('div');
  noteField.className = 'field';
  const noteId = ids.note ?? `${prefix}Note`;
  const noteLabel = document.createElement('label');
  noteLabel.htmlFor = noteId;
  noteLabel.textContent = copy.note;
  const noteInput = document.createElement('textarea');
  noteInput.className = 'input';
  noteInput.name = 'note';
  noteInput.id = noteId;
  noteField.append(noteLabel, noteInput);
  if (copy.noteHint) {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.id = `${noteId}Hint`;
    hint.textContent = copy.noteHint;
    noteInput.setAttribute('aria-describedby', hint.id);
    noteField.append(hint);
  }
  fragment.append(noteField);

  return { fragment, attendingField, yes, no, partySizeInput, noteInput };
}

/**
 * Deep reply fields controller shared across open-mode, personal-link, and tracker host reply forms.
 * Accepts either existing static form controls (`existing`) or constructs its fields (`copy`, `ids`).
 * @param {{
 *   lang: string,
 *   limit: number,
 *   subEvents?: {id: string, name: string}[],
 *   menu?: {id: string, name: string}[],
 *   prefix: string,
 *   answerPrefix?: string,
 *   mealPrefix?: string,
 *   ids?: { attending?: string, yes?: string, no?: string, seats?: string, note?: string },
 *   copy?: { attending: string, yes: string, no: string, seats: string, note: string, noteHint?: string },
 *   existing?: {
 *     form: HTMLFormElement,
 *     nameInput?: HTMLInputElement,
 *     attendingField: HTMLElement,
 *     partySizeInput: HTMLInputElement,
 *     noteInput: HTMLTextAreaElement,
 *   },
 *   inlineErrors?: boolean,
 *   liveRegion?: HTMLElement | null,
 * }} options
 */
export function createReplyFields({
  lang,
  limit,
  subEvents = [],
  menu = [],
  prefix,
  answerPrefix = `${prefix}Answer`,
  mealPrefix = `${prefix}Meals`,
  ids = {},
  copy = null,
  existing = null,
  inlineErrors = false,
  liveRegion = null,
}) {
  const subEventIds = subEvents.map(({ id }) => id);
  const menuIds = menu.map(({ id }) => id);
  const answers = subEvents.length ? createSubEventFields(subEvents, { prefix: answerPrefix, limit, lang }) : null;
  const meals = menu.length ? createMealFields(menu, { prefix: mealPrefix, limit, lang }) : null;

  let form = existing?.form ?? null;
  let nameInput = existing?.nameInput ?? null;
  let attendingField = existing?.attendingField ?? null;
  let partySizeInput = existing?.partySizeInput ?? null;
  let noteInput = existing?.noteInput ?? null;
  let yesRadio = null;
  let noRadio = null;
  let answersField = null;
  let mealsField = null;
  let fragment = null;

  if (existing) {
    partySizeInput.max = String(limit);
    answersField = document.createElement('div');
    answersField.className = 'field';
    answersField.hidden = !answers;
    noteInput.closest('.field').before(answersField);
    if (answers) {
      answersField.prepend(answers.element);
      attendingField.hidden = true;
      /** @type {HTMLElement} */ (partySizeInput.closest('.field')).hidden = true;
    }
    mealsField = document.createElement('div');
    mealsField.className = 'field';
    mealsField.hidden = !meals;
    noteInput.closest('.field').before(mealsField);
    if (meals) mealsField.prepend(meals.element);
  } else {
    const built = buildGeneratedControls({
      prefix,
      ids,
      limit,
      copy,
      hasSubEvents: Boolean(answers),
      answersElement: answers?.element,
      mealsElement: meals?.element,
    });
    fragment = built.fragment;
    attendingField = built.attendingField;
    yesRadio = built.yes;
    noRadio = built.no;
    partySizeInput = built.partySizeInput;
    noteInput = built.noteInput;
  }

  const fieldCounters = [];
  if (nameInput) fieldCounters.push(attachCounter(nameInput, REPLY_LIMITS.name, { lang, liveRegion }));
  fieldCounters.push(attachCounter(noteInput, REPLY_LIMITS.note, { lang, codePoints: true, liveRegion }));
  const refreshCounters = () => {
    for (const c of fieldCounters) c.refresh();
  };

  const errorCopy = {
    ...UI[lang].guest.replyErrors({ ...REPLY_LIMITS, partySize: limit }),
    answers: UI[lang].subEventReplies.error(limit),
    meals: UI[lang].menu.error,
  };

  function attendingChecked() {
    if (answers) return answers.anyAttending();
    if (yesRadio && noRadio) return yesRadio.checked ? true : noRadio.checked ? false : null;
    const checked = /** @type {HTMLInputElement | null} */ (form?.querySelector('input[name="attending"]:checked'));
    return checked ? checked.value === 'yes' : null;
  }

  function sync() {
    if (partySizeInput) partySizeInput.disabled = !attendingChecked();
    answers?.sync();
    if (meals) meals.element.disabled = !attendingChecked();
  }

  function focusFor(fieldName) {
    if (fieldName === 'name') return nameInput;
    if (fieldName === 'attending') return yesRadio ?? form?.querySelector('input[name="attending"]') ?? null;
    if (fieldName === 'partySize') return partySizeInput;
    if (fieldName === 'answers') return answers?.focusTarget ?? null;
    if (fieldName === 'meals') return meals?.focusTarget ?? null;
    if (fieldName === 'note') return noteInput;
    return null;
  }

  // Inline per-field errors (used on open-mode reply form).
  /**
   * @type {{name: string, field: Element, focusTarget: () => HTMLElement | null,
   *   message: HTMLElement, describedBy: string | null}[]}
   */
  const errorSlots = [];
  if (inlineErrors && existing) {
    /** @type {Record<string, Element>} */
    const fieldsByName = {
      name: nameInput,
      attending: attendingField,
      partySize: partySizeInput,
      answers: answersField,
      meals: mealsField,
      note: noteInput,
    };
    for (const name of REPLY_FIELDS) {
      const field = fieldsByName[name];
      const message = document.createElement('p');
      message.className = 'field-error';
      message.id = `${name}Error`;
      message.hidden = true;
      field.closest('.field').append(message);
      errorSlots.push({
        name,
        field,
        focusTarget: () => focusFor(name),
        message,
        describedBy: field.getAttribute('aria-describedby'),
      });
    }
  }

  function showErrors(invalid) {
    if (!errorSlots.length) return;
    for (const { name, field, message, describedBy } of errorSlots) {
      const isInvalid = invalid.includes(name);
      message.hidden = !isInvalid;
      message.textContent = isInvalid ? errorCopy[name] : '';
      if (isInvalid) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
      const ariaIds = [describedBy, isInvalid ? message.id : null].filter(Boolean);
      if (ariaIds.length) field.setAttribute('aria-describedby', ariaIds.join(' '));
      else field.removeAttribute('aria-describedby');
    }
    errorSlots
      .find(({ name }) => invalid.includes(name))
      ?.focusTarget()
      ?.focus();
  }

  // Reads the raw reply fields with uniform numeric parsing and tab-to-space sanitization.
  function read(nameOverride) {
    const attending = attendingChecked();
    const note = noteInput.value.replaceAll('\t', ' ');
    return {
      ...(nameInput ? { name: nameInput.value } : nameOverride !== undefined ? { name: nameOverride } : {}),
      attending,
      partySize: !answers && attending ? partySizeInput.valueAsNumber : 0,
      ...(answers ? { answers: answers.read() } : {}),
      ...(meals ? { meals: meals.read() } : {}),
      note,
    };
  }

  // Validates the current fields through makeReply, returning {reply, invalid, errorMessage, focusTarget}.
  function validate(nameOverride) {
    const raw = read(nameOverride);
    const { reply, invalid } = makeReply(raw, { partySizeLimit: limit, subEventIds, menuIds });
    const first = invalid[0] ?? null;
    return {
      reply,
      invalid,
      errorMessage: first ? errorCopy[first] : null,
      focusTarget: first ? focusFor(first) : null,
    };
  }

  function fill(reply, defaultSize = 1) {
    if (nameInput && reply?.name !== undefined) nameInput.value = reply.name;
    if (answers) {
      answers.fill(reply, defaultSize);
    } else {
      const attending = reply?.attending ?? true;
      if (yesRadio && noRadio) {
        yesRadio.checked = attending;
        noRadio.checked = !attending;
      } else if (form) {
        const radio = /** @type {HTMLInputElement | null} */ (
          form.querySelector(`input[name="attending"][value="${attending ? 'yes' : 'no'}"]`)
        );
        if (radio) radio.checked = true;
      }
      if (partySizeInput) partySizeInput.value = String(reply?.attending ? reply.partySize : defaultSize);
    }
    meals?.fill(reply);
    noteInput.value = reply?.note ?? '';
    sync();
    refreshCounters();
  }

  function bind(targetForm) {
    form = targetForm;
    targetForm.addEventListener('change', sync);
  }

  if (existing?.form) bind(existing.form);

  return {
    fragment,
    bind,
    sync,
    fill,
    read,
    validate,
    showErrors,
    refreshCounters,
    focusName: () => nameInput?.focus(),
  };
}
