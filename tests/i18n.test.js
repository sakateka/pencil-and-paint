import { Suite } from './assert.js';
import { openGame } from './harness.js';

/**
 * Five languages, and the two things about them that are not string swapping.
 *
 * Counting: English needs two forms of a phrase and Russian needs three, and
 * the rule for which goes with which number is per language. Joining: "a carp
 * and 2 boots" is not a comma and the word "and" — the separators and the
 * conjunction differ, and Chinese does not put spaces around either.
 *
 * The rest of it is completeness. A key a language is missing falls back to
 * English, which reads as a slightly odd translation rather than as a fault —
 * so nothing but asking will find it.
 */
export async function run(url) {
  const suite = new Suite('i18n');
  const game = await openGame(url);

  try {
    const complete = await game.evaluate((pencil) => {
      const langs = pencil.i18n.languages();
      return {
        langs,
        keys: pencil.i18n.keys().length,
        gaps: Object.fromEntries(langs.map((l) => [l, pencil.i18n.missing(l)])),
      };
    });

    suite.equal(complete.langs.length, 5, 'five languages', complete.langs.join(', '));
    suite.atLeast(complete.keys, 30, 'and a phrase book worth translating');
    for (const [lang, missing] of Object.entries(complete.gaps)) {
      suite.equal(missing.length, 0, `${lang} is complete`, missing.slice(0, 6).join(', '));
    }

    // Every language says something different, and none of them says the key.
    const spread = await game.evaluate((pencil) => {
      const said = {};
      for (const lang of pencil.i18n.languages()) {
        pencil.i18n.setLanguage(lang);
        said[lang] = pencil.i18n.say('prompt.pet');
      }
      pencil.i18n.setLanguage('en');
      return said;
    });
    suite.equal(
      new Set(Object.values(spread)).size,
      5,
      'each language has its own words for it',
      Object.values(spread).join(' / '),
    );
    suite.ok(
      !Object.values(spread).some((v) => v.includes('.')),
      'and none of them leaks a key onto the screen',
      Object.values(spread).join(' / '),
    );

    /*
     * Counting, where the languages genuinely differ.
     *
     * The prose declines: Russian "осталось 5 банок" is a real sentence and
     * takes the genitive. The tally does not: it reads "5 плотва", the plain
     * nominative after a number, the way a scoreboard names a thing and counts
     * it rather than describing it.
     */
    const counting = await game.evaluate((pencil) => {
      const forms = (lang, key, ns) => {
        pencil.i18n.setLanguage(lang);
        return ns.map((n) => pencil.i18n.say(key, { n }));
      };
      const out = {
        enPots: forms('en', 'hint.potsLeft', [1, 2, 5]),
        ruPots: forms('ru', 'hint.potsLeft', [1, 2, 5]),
        enRoach: forms('en', 'creel.roach', [1, 2, 5]),
        ruRoach: forms('ru', 'creel.roach', [1, 2, 5]),
        zhRoach: forms('zh', 'creel.roach', [1, 5]),
      };
      pencil.i18n.setLanguage('en');
      return out;
    });

    suite.equal(counting.enPots[0], '1 pot still in graphite', 'English has a singular');
    suite.equal(counting.enPots[2], '5 pots still in graphite', 'and a plural');
    suite.equal(counting.ruPots[0], 'осталась 1 банка в графите', 'Russian declines for one');
    suite.equal(counting.ruPots[1], 'осталось 2 банки в графите', 'differently for a few');
    suite.equal(counting.ruPots[2], 'осталось 5 банок в графите', 'and differently again for many');

    suite.equal(counting.enRoach[0], 'a roach', 'a single fish is named, not counted');
    suite.equal(counting.enRoach[2], '5 roach', 'and roach do not take an s');
    suite.equal(counting.ruRoach[0], 'плотва', 'the Russian tally names one');
    suite.equal(counting.ruRoach[1], '2 плотва', 'and counts the rest in the nominative');
    suite.equal(counting.ruRoach[2], '5 плотва', 'however many there are');
    suite.equal(counting.zhRoach[0], counting.zhRoach[1].replace('5', '1'),
      'Chinese counts without changing the noun');

    // Joining a list, which is also per language.
    const joined = await game.evaluate((pencil) => {
      const out = {};
      for (const lang of pencil.i18n.languages()) {
        pencil.i18n.setLanguage(lang);
        out[lang] = pencil.i18n.list(['A', 'B', 'C']);
      }
      pencil.i18n.setLanguage('en');
      return out;
    });
    suite.equal(joined.en, 'A, B, and C', 'English joins with a comma and "and"');
    suite.ok(joined.ru.includes('и'), 'Russian uses и', joined.ru);
    suite.ok(joined.es.includes('y'), 'Spanish uses y', joined.es);
    suite.ok(!joined.zh.includes(', '), 'Chinese does not use spaced commas', joined.zh);

    /*
     * And the page itself changes, not just the dictionary. This goes through
     * the picker, because that is the only way anybody actually does it.
     */
    const onScreen = await game.evaluate((pencil) => {
      const read = () => ({
        hint: document.getElementById('hint').textContent,
        start: document.getElementById('startBtn').textContent,
        lang: document.documentElement.lang,
      });
      pencil.i18n.setLanguage('en');
      const before = read();
      pencil.i18n.setLanguage('ru');
      const after = read();
      pencil.i18n.setLanguage('en');
      return { before, after, back: read() };
    });

    suite.ok(onScreen.before.hint.length > 0, 'the hint says something in English');
    suite.ok(
      onScreen.after.hint !== onScreen.before.hint,
      'and something else in Russian',
      onScreen.after.hint,
    );
    suite.equal(onScreen.after.lang, 'ru', 'the document says which language it is in');
    suite.equal(onScreen.back.hint, onScreen.before.hint, 'and it changes back');

    // The picker itself, since it is the only control for this.
    const picker = await game.page.$eval('#lang', (el) => ({
      options: [...el.options].map((o) => o.value),
      shown: [...el.options].map((o) => o.textContent),
      value: el.value,
    }));
    suite.equal(picker.options.length, 5, 'the picker offers all five');
    suite.ok(
      picker.shown.every((name) => !/^[a-z]{2}$/.test(name)),
      'named in their own language, not by code',
      picker.shown.join(', '),
    );

    await game.page.selectOption('#lang', 'es');
    const spanish = await game.page.$eval('#startBtn', (el) => el.textContent);
    suite.equal(spanish, 'Echar a andar', 'picking one changes the page');
    // And it survives a reload, which is the point of remembering it.
    await game.page.reload();
    await game.page.waitForFunction(() => document.documentElement.lang === 'es', null, {
      timeout: 10000,
    });
    const remembered = await game.page.$eval('#startBtn', (el) => el.textContent);
    suite.equal(remembered, 'Echar a andar', 'and it is still there after a reload');

    suite.equal(game.errors.length, 0, 'no page errors', game.errors.join(' | '));
  } finally {
    await game.close();
  }
  return suite;
}
