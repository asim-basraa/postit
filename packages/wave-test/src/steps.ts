/**
 * Wave's step library: a fixed vocabulary, the same for the prototype and the
 * built app. Every step names an element by its test id
 * (<screen>.<sections>.<DS id>.<label>) or a screen by its slug.
 */

export type StepKind = "open" | "click" | "fill" | "choose" | "pick" | "on" | "shows" | "chosen" | "visible" | "hidden";

export type MatchedStep = { kind: StepKind; testId?: string; screen?: string; value?: string };

const STR = '"((?:[^"\\\\]|\\\\.)*)"';
const unq = (s: string) => s.replace(/\\(.)/g, "$1");

export const STEPS: { kind: StepKind; pattern: RegExp; example: string; does: string; read: (m: RegExpExecArray) => MatchedStep }[] = [
  { kind: "open", pattern: new RegExp(`^I open the ${STR} screen$`), example: 'I open the "about-you" screen', does: "Prototype: plays that screen. App: opens its route.", read: (m) => ({ kind: "open", screen: unq(m[1]) }) },
  { kind: "click", pattern: new RegExp(`^I click ${STR}$`), example: 'I click "about-you.form.DS.button.continue"', does: "Clicks it.", read: (m) => ({ kind: "click", testId: unq(m[1]) }) },
  { kind: "fill", pattern: new RegExp(`^I fill ${STR} with ${STR}$`), example: 'I fill "about-you.form.DS.textField.full-name" with "Ada Lovelace"', does: "Types into the field inside it.", read: (m) => ({ kind: "fill", testId: unq(m[1]), value: unq(m[2]) }) },
  { kind: "choose", pattern: new RegExp(`^I choose ${STR}$`), example: 'I choose "about-you.form.DS.chip.founder-ceo"', does: "Picks a chip, radio, checkbox, card or segment (left as it is if already chosen).", read: (m) => ({ kind: "choose", testId: unq(m[1]) }) },
  { kind: "pick", pattern: new RegExp(`^I pick ${STR} in ${STR}$`), example: 'I pick "11–50 people" in "budget-timing.form.DS.select.company-size"', does: "Opens a select and picks the option.", read: (m) => ({ kind: "pick", value: unq(m[1]), testId: unq(m[2]) }) },
  { kind: "on", pattern: new RegExp(`^I am on the ${STR} screen$`), example: 'I am on the "your-project" screen', does: "The screen's root is on the page.", read: (m) => ({ kind: "on", screen: unq(m[1]) }) },
  { kind: "shows", pattern: new RegExp(`^${STR} shows ${STR}$`), example: '"qualified.main.DS.text.greeting" shows "Ada"', does: "Its text contains the words.", read: (m) => ({ kind: "shows", testId: unq(m[1]), value: unq(m[2]) }) },
  { kind: "chosen", pattern: new RegExp(`^${STR} is chosen$`), example: '"budget-timing.form.DS.segmentItem.usd" is chosen', does: "A choice is selected.", read: (m) => ({ kind: "chosen", testId: unq(m[1]) }) },
  { kind: "visible", pattern: new RegExp(`^${STR} is visible$`), example: '"about-you.form.DS.textField.your-role" is visible', does: "It is on screen.", read: (m) => ({ kind: "visible", testId: unq(m[1]) }) },
  { kind: "hidden", pattern: new RegExp(`^${STR} is hidden$`), example: '"about-you.form.DS.textField.your-role" is hidden', does: "It is not on screen.", read: (m) => ({ kind: "hidden", testId: unq(m[1]) }) },
];

export function matchStep(text: string): MatchedStep | null {
  for (const s of STEPS) {
    const m = s.pattern.exec(text.trim());
    if (m) return s.read(m);
  }
  return null;
}
