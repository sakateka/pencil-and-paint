/**
 * What the game says, in five languages.
 *
 * Two things here are not string swapping and are worth knowing about.
 *
 * Counting: English needs two forms and Russian needs three ("1 плотва",
 * "2 плотвы", "5 плотв"), and which form goes with which number is a rule per
 * language that nobody should be writing by hand. `Intl.PluralRules` knows all
 * of them, so a countable phrase is stored as a small set of forms keyed by the
 * categories it returns.
 *
 * Listing: "a carp and 2 boots" is not a comma and the word "and" — the
 * separators, the position of the conjunction and the spacing all differ.
 * `Intl.ListFormat` does that properly for every language here.
 *
 * There is no right-to-left language in this set. Arabic and Hebrew would need
 * the layout mirrored as well as the words replaced, which is a different piece
 * of work from this one.
 */

export const LANGUAGES = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  zh: '中文',
} as const;

export type Lang = keyof typeof LANGUAGES;

/** Forms of a countable phrase, keyed by `Intl.PluralRules` categories. */
interface Plural {
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

interface Dictionary {
  readonly [key: string]: string | Plural;
}

const en: Dictionary = {
  'intro.tagline1': 'Someone left the world half-finished, in graphite.',
  'intro.tagline2': 'Only what is near you remembers its colours.',
  'intro.drag': 'drag to walk',
  'intro.gather': 'Gather the spilled paint pots to widen the colour.',
  'intro.start': 'Start walking',
  'intro.building': 'drawing the valley… {n}%',

  'hud.pots': 'paint pots',
  'hud.reach': 'colour reaches {n} steps',

  'hint.default': 'the world is only coloured where you stand — go and find the rest',
  'hint.awake': 'the whole page is awake',
  'hint.lastPot': 'one last pot still in graphite',
  'hint.further': 'the colour reaches a little further now',
  'hint.potsLeft': { one: '{n} pot still in graphite', other: '{n} pots still in graphite' },

  'note.firstPet': 'she does not open her eyes — but she knows you are there',
  'note.fire': 'the fire catches. there is nowhere else to be',
  'note.firstFish': 'a small one. you put it back',
  'note.restQuiet': 'the valley is quiet. it is not finished being drawn',
  'note.restBirds': 'somewhere above you, the birds have started up again',

  'prompt.pet': 'pet the cat',
  'prompt.purring': 'she is purring',
  'prompt.fish': 'fish here',
  'prompt.wait': 'wait for it…',
  'prompt.now': 'now!',
  'prompt.gotAway': 'it got away',
  'prompt.packUp': 'pack up',
  'prompt.rest': 'lie in the hammock',
  'prompt.draw': 'draw something',
  'prompt.climb': 'climb up',
  'prompt.climbDown': 'climb down',
  'prompt.getUp': 'get up',
  'note.climbedIn': 'nobody can see you up here, which is the whole idea',
  'note.climbedDown': 'back down on the grass',
  'note.drew': 'it is on the easel now',
  'studio.title': 'somebody left this here',
  'studio.clear': 'start again',
  'studio.close': 'keep it and go',
  'studio.empty': 'nothing kept yet',
  'studio.kept': 'something you drew',
  'studio.delete': 'throw it away',
  'studio.colour': 'colour',
  'studio.rubber': 'rub out',
  'studio.nib': 'brush size',

  'said.roach': 'a roach!',
  'said.crucian': 'a crucian carp!',
  'said.carp': 'a carp!',
  'said.catfish': 'a catfish!',
  'said.boot': 'an old boot',
  'said.shoe': "somebody's shoe",
  'said.treasure': 'something gold…',

  'creel.title': 'you packed up',
  'creel.empty': 'nothing but weed, this time',
  'creel.roach': { one: 'a roach', other: '{n} roach' },
  'creel.crucian': { one: 'a crucian carp', other: '{n} crucian carp' },
  'creel.carp': { one: 'a carp', other: '{n} carp' },
  'creel.catfish': { one: 'a catfish', other: '{n} catfish' },
  'creel.boot': { one: 'an old boot', other: '{n} old boots' },
  'creel.shoe': { one: 'a lost shoe', other: '{n} lost shoes' },
  'creel.treasure': { one: 'something gold', other: '{n} gold things' },

  'done.title': 'The world remembers.',
  'done.sub': 'Every pot found in {time}. Stay as long as you like — the colour is yours now.',
  'done.again': 'Start a new world',
  'done.open': 'read the note again',
  'done.tuck': 'put the note away',

  'corner.source': 'source',
  'corner.sourceTitle': 'View the source on GitHub',
  'corner.stats': 'Show performance diagnostics',
  'corner.lang': 'Language',
};

const es: Dictionary = {
  'intro.tagline1': 'Alguien dejó el mundo a medio terminar, en grafito.',
  'intro.tagline2': 'Sólo lo que está cerca de ti recuerda sus colores.',
  'intro.drag': 'arrastra para caminar',
  'intro.gather': 'Recoge los botes de pintura derramados para ensanchar el color.',
  'intro.start': 'Echar a andar',
  'intro.building': 'dibujando el valle… {n}%',

  'hud.pots': 'botes de pintura',
  'hud.reach': 'el color llega a {n} pasos',

  'hint.default': 'el mundo sólo tiene color donde estás — ve a buscar el resto',
  'hint.awake': 'la página entera está despierta',
  'hint.lastPot': 'queda un último bote en grafito',
  'hint.further': 'ahora el color llega un poco más lejos',
  'hint.potsLeft': {
    one: 'queda {n} bote en grafito',
    many: 'quedan {n} botes en grafito',
    other: 'quedan {n} botes en grafito',
  },

  'note.firstPet': 'no abre los ojos — pero sabe que estás ahí',
  'note.fire': 'prende el fuego. no hay otro sitio donde estar',
  'note.firstFish': 'pequeño. lo devuelves al agua',
  'note.restQuiet': 'el valle está callado. aún no lo terminan de dibujar',
  'note.restBirds': 'en algún lugar sobre ti, los pájaros han vuelto a empezar',

  'prompt.pet': 'acariciar a la gata',
  'prompt.purring': 'está ronroneando',
  'prompt.fish': 'pescar aquí',
  'prompt.wait': 'espera…',
  'prompt.now': '¡ahora!',
  'prompt.gotAway': 'se escapó',
  'prompt.packUp': 'recoger',
  'prompt.rest': 'tumbarse en la hamaca',
  'prompt.draw': 'dibujar algo',
  'prompt.climb': 'subir',
  'prompt.climbDown': 'bajar',
  'prompt.getUp': 'levantarse',
  'note.climbedIn': 'aquí arriba no te ve nadie, que es de lo que se trata',
  'note.climbedDown': 'otra vez abajo, sobre la hierba',
  'note.drew': 'ya está en el caballete',
  'studio.title': 'alguien dejó esto aquí',
  'studio.clear': 'empezar de nuevo',
  'studio.close': 'guardar y salir',
  'studio.empty': 'aún no guardaste nada',
  'studio.kept': 'algo que dibujaste',
  'studio.delete': 'tirarlo',
  'studio.colour': 'color',
  'studio.rubber': 'borrar',
  'studio.nib': 'grosor del pincel',

  'said.roach': '¡una bermejuela!',
  'said.crucian': '¡un carpín!',
  'said.carp': '¡una carpa!',
  'said.catfish': '¡un siluro!',
  'said.boot': 'una bota vieja',
  'said.shoe': 'el zapato de alguien',
  'said.treasure': 'algo dorado…',

  'creel.title': 'recogiste el campamento',
  'creel.empty': 'sólo algas, esta vez',
  'creel.roach': { one: 'una bermejuela', many: '{n} bermejuelas', other: '{n} bermejuelas' },
  'creel.crucian': { one: 'un carpín', many: '{n} carpines', other: '{n} carpines' },
  'creel.carp': { one: 'una carpa', many: '{n} carpas', other: '{n} carpas' },
  'creel.catfish': { one: 'un siluro', many: '{n} siluros', other: '{n} siluros' },
  'creel.boot': { one: 'una bota vieja', many: '{n} botas viejas', other: '{n} botas viejas' },
  'creel.shoe': { one: 'un zapato perdido', many: '{n} zapatos perdidos', other: '{n} zapatos perdidos' },
  'creel.treasure': { one: 'algo dorado', many: '{n} cosas doradas', other: '{n} cosas doradas' },

  'done.title': 'El mundo se acuerda.',
  'done.sub': 'Todos los botes encontrados en {time}. Quédate lo que quieras — el color ya es tuyo.',
  'done.again': 'Empezar otro mundo',
  'done.open': 'volver a leer la nota',
  'done.tuck': 'guardar la nota',

  'corner.source': 'código',
  'corner.sourceTitle': 'Ver el código en GitHub',
  'corner.stats': 'Mostrar diagnóstico de rendimiento',
  'corner.lang': 'Idioma',
};

const pt: Dictionary = {
  'intro.tagline1': 'Alguém deixou o mundo por acabar, a grafite.',
  'intro.tagline2': 'Só o que está perto de ti lembra as suas cores.',
  'intro.drag': 'arrasta para andar',
  'intro.gather': 'Junta os potes de tinta derramados para alargar a cor.',
  'intro.start': 'Começar a andar',
  'intro.building': 'a desenhar o vale… {n}%',

  'hud.pots': 'potes de tinta',
  'hud.reach': 'a cor chega a {n} passos',

  'hint.default': 'o mundo só tem cor onde tu estás — vai procurar o resto',
  'hint.awake': 'a página inteira está acordada',
  'hint.lastPot': 'falta um último pote a grafite',
  'hint.further': 'agora a cor chega um pouco mais longe',
  'hint.potsLeft': {
    one: 'falta {n} pote a grafite',
    many: 'faltam {n} potes a grafite',
    other: 'faltam {n} potes a grafite',
  },

  'note.firstPet': 'não abre os olhos — mas sabe que estás ali',
  'note.fire': 'a fogueira pega. não há outro sítio onde estar',
  'note.firstFish': 'pequeno. voltas a pô-lo na água',
  'note.restQuiet': 'o vale está calado. ainda não o acabaram de desenhar',
  'note.restBirds': 'algures por cima de ti, os pássaros recomeçaram',

  'prompt.pet': 'fazer festas à gata',
  'prompt.purring': 'está a ronronar',
  'prompt.fish': 'pescar aqui',
  'prompt.wait': 'espera…',
  'prompt.now': 'agora!',
  'prompt.gotAway': 'fugiu',
  'prompt.packUp': 'arrumar',
  'prompt.rest': 'deitar na rede',
  'prompt.draw': 'desenhar alguma coisa',
  'prompt.climb': 'subir',
  'prompt.climbDown': 'descer',
  'prompt.getUp': 'levantar-se',
  'note.climbedIn': 'aqui em cima ninguém te vê, que é a ideia toda',
  'note.climbedDown': 'outra vez em baixo, na erva',
  'note.drew': 'já está no cavalete',
  'studio.title': 'alguém deixou isto aqui',
  'studio.clear': 'começar de novo',
  'studio.close': 'guardar e sair',
  'studio.empty': 'ainda não guardaste nada',
  'studio.kept': 'algo que desenhaste',
  'studio.delete': 'deitar fora',
  'studio.colour': 'cor',
  'studio.rubber': 'apagar',
  'studio.nib': 'espessura do pincel',

  'said.roach': 'um ruivaco!',
  'said.crucian': 'um pimpão!',
  'said.carp': 'uma carpa!',
  'said.catfish': 'um peixe-gato!',
  'said.boot': 'uma bota velha',
  'said.shoe': 'o sapato de alguém',
  'said.treasure': 'algo dourado…',

  'creel.title': 'arrumaste o campo',
  'creel.empty': 'só ervas, desta vez',
  'creel.roach': { one: 'um ruivaco', many: '{n} ruivacos', other: '{n} ruivacos' },
  'creel.crucian': { one: 'um pimpão', many: '{n} pimpões', other: '{n} pimpões' },
  'creel.carp': { one: 'uma carpa', many: '{n} carpas', other: '{n} carpas' },
  'creel.catfish': { one: 'um peixe-gato', many: '{n} peixes-gato', other: '{n} peixes-gato' },
  'creel.boot': { one: 'uma bota velha', many: '{n} botas velhas', other: '{n} botas velhas' },
  'creel.shoe': { one: 'um sapato perdido', many: '{n} sapatos perdidos', other: '{n} sapatos perdidos' },
  'creel.treasure': { one: 'algo dourado', many: '{n} coisas douradas', other: '{n} coisas douradas' },

  'done.title': 'O mundo lembra-se.',
  'done.sub': 'Todos os potes encontrados em {time}. Fica o tempo que quiseres — a cor já é tua.',
  'done.again': 'Começar outro mundo',
  'done.open': 'ler a nota outra vez',
  'done.tuck': 'guardar a nota',

  'corner.source': 'código',
  'corner.sourceTitle': 'Ver o código no GitHub',
  'corner.stats': 'Mostrar diagnóstico de desempenho',
  'corner.lang': 'Idioma',
};

const ru: Dictionary = {
  'intro.tagline1': 'Кто-то оставил мир недорисованным, в графите.',
  'intro.tagline2': 'Только то, что рядом с тобой, помнит свои цвета.',
  'intro.drag': 'веди пальцем, чтобы идти',
  'intro.gather': 'Собери рассыпанные банки с краской, чтобы цвет стал шире.',
  'intro.start': 'Пойти гулять',
  'intro.building': 'рисуем долину… {n}%',

  'hud.pots': 'банок с краской',
  'hud.reach': 'цвет достаёт на {n} шагов',

  'hint.default': 'мир цветной только там, где ты стоишь — иди и найди остальное',
  'hint.awake': 'вся страница проснулась',
  'hint.lastPot': 'осталась последняя банка в графите',
  'hint.further': 'теперь цвет достаёт немного дальше',
  'hint.potsLeft': {
    one: 'осталась {n} банка в графите',
    few: 'осталось {n} банки в графите',
    many: 'осталось {n} банок в графите',
    other: 'осталось {n} банок в графите',
  },

  'note.firstPet': 'она не открывает глаз — но знает, что ты рядом',
  'note.fire': 'костёр занялся. больше некуда идти',
  'note.firstFish': 'маленькая. ты отпускаешь её обратно',
  'note.restQuiet': 'в долине тихо. её ещё не дорисовали',
  'note.restBirds': 'где-то над тобой снова запели птицы',

  'prompt.pet': 'погладить кошку',
  'prompt.purring': 'она мурлычет',
  'prompt.fish': 'рыбачить здесь',
  'prompt.wait': 'подожди…',
  'prompt.now': 'тяни!',
  'prompt.gotAway': 'сорвалась',
  'prompt.packUp': 'собраться',
  'prompt.rest': 'лечь в гамак',
  'prompt.draw': 'что-нибудь нарисовать',
  'prompt.climb': 'забраться наверх',
  'prompt.climbDown': 'спуститься',
  'prompt.getUp': 'встать',
  'note.climbedIn': 'здесь наверху тебя никто не видит — в этом весь смысл',
  'note.climbedDown': 'снова внизу, на траве',
  'note.drew': 'теперь это стоит на мольберте',
  'studio.title': 'кто-то оставил это здесь',
  'studio.clear': 'начать заново',
  'studio.close': 'оставить и выйти',
  'studio.empty': 'пока ничего не сохранено',
  'studio.kept': 'то, что ты нарисовал',
  'studio.delete': 'выбросить',
  'studio.colour': 'цвет',
  'studio.rubber': 'стереть',
  'studio.nib': 'толщина кисти',

  'said.roach': 'плотва!',
  'said.crucian': 'карась!',
  'said.carp': 'карп!',
  'said.catfish': 'сом!',
  'said.boot': 'старый сапог',
  'said.shoe': 'чей-то ботинок',
  'said.treasure': 'что-то золотое…',

  'creel.title': 'ты собрал лагерь',
  'creel.empty': 'в этот раз одни водоросли',
  /*
   * The tally uses the plain nominative after a number — "5 плотва", not
   * "5 плотв".
   *
   * Declining it would be right in a sentence and is wrong here: this is a
   * scoreboard, and a scoreboard names the thing and counts it. The prose
   * around it still declines properly — see `hint.potsLeft`, which reads
   * "осталось 5 банок в графите" because that one *is* a sentence.
   */
  'creel.roach': { one: 'плотва', other: '{n} плотва' },
  'creel.crucian': { one: 'карась', other: '{n} карась' },
  'creel.carp': { one: 'карп', other: '{n} карп' },
  'creel.catfish': { one: 'сом', other: '{n} сом' },
  'creel.boot': { one: 'старый сапог', other: '{n} сапог' },
  'creel.shoe': { one: 'потерянный ботинок', other: '{n} ботинок' },
  'creel.treasure': { one: 'что-то золотое', other: '{n} золотая вещица' },

  'done.title': 'Мир помнит.',
  'done.sub': 'Все банки найдены за {time}. Оставайся сколько хочешь — цвет теперь твой.',
  'done.again': 'Начать новый мир',
  'done.open': 'перечитать записку',
  'done.tuck': 'убрать записку',

  'corner.source': 'исходники',
  'corner.sourceTitle': 'Посмотреть исходники на GitHub',
  'corner.stats': 'Показать диагностику производительности',
  'corner.lang': 'Язык',
};

const zh: Dictionary = {
  'intro.tagline1': '有人把这个世界画到一半就搁下了，只剩铅笔线。',
  'intro.tagline2': '只有靠近你的地方，还记得自己的颜色。',
  'intro.drag': '拖动来走路',
  'intro.gather': '把散落的颜料罐捡起来，让颜色铺得更远。',
  'intro.start': '出发',
  'intro.building': '正在画这片山谷… {n}%',

  'hud.pots': '颜料罐',
  'hud.reach': '颜色能铺到 {n} 步',

  'hint.default': '只有你站着的地方才有颜色 — 去把其余的找回来',
  'hint.awake': '整张纸都醒了',
  'hint.lastPot': '还剩最后一罐留在铅笔线里',
  'hint.further': '颜色铺得比刚才远了一点',
  'hint.potsLeft': { other: '还有 {n} 罐留在铅笔线里' },

  'note.firstPet': '她没有睁眼 — 但她知道你在',
  'note.fire': '火生起来了。再没有别处可去',
  'note.firstFish': '很小的一条。你把它放回水里',
  'note.restQuiet': '山谷很安静。它还没被画完',
  'note.restBirds': '在你头顶的某处，鸟又叫起来了',

  'prompt.pet': '摸摸猫',
  'prompt.purring': '她在呼噜',
  'prompt.fish': '在这儿钓鱼',
  'prompt.wait': '等一等…',
  'prompt.now': '就是现在！',
  'prompt.gotAway': '跑掉了',
  'prompt.packUp': '收拾',
  'prompt.rest': '躺进吊床',
  'prompt.draw': '画点什么',
  'prompt.climb': '爬上去',
  'prompt.climbDown': '爬下来',
  'prompt.getUp': '起身',
  'note.climbedIn': '在上面谁也看不见你，这就是重点',
  'note.climbedDown': '又回到草地上了',
  'note.drew': '它现在立在画架上了',
  'studio.title': '有人把这个落在了这里',
  'studio.clear': '重来',
  'studio.close': '留下并离开',
  'studio.empty': '还什么都没留下',
  'studio.kept': '你画的东西',
  'studio.delete': '扔掉',
  'studio.colour': '颜色',
  'studio.rubber': '擦掉',
  'studio.nib': '笔的粗细',

  'said.roach': '一条稣鱼！',
  'said.crucian': '一条鲫鱼！',
  'said.carp': '一条鲤鱼！',
  'said.catfish': '一条鲶鱼！',
  'said.boot': '一只旧靴子',
  'said.shoe': '谁的鞋子',
  'said.treasure': '金色的东西…',

  'creel.title': '你收拾好了',
  'creel.empty': '这回只有水草',
  'creel.roach': { other: '{n} 条稣鱼' },
  'creel.crucian': { other: '{n} 条鲫鱼' },
  'creel.carp': { other: '{n} 条鲤鱼' },
  'creel.catfish': { other: '{n} 条鲶鱼' },
  'creel.boot': { other: '{n} 只旧靴子' },
  'creel.shoe': { other: '{n} 只丢掉的鞋' },
  'creel.treasure': { other: '{n} 件金色的东西' },

  'done.title': '这个世界记得。',
  'done.sub': '所有颜料罐都在 {time} 内找齐了。想待多久都行 — 颜色已经是你的了。',
  'done.again': '开一个新世界',
  'done.open': '再读一遍那张字条',
  'done.tuck': '把字条收起来',

  'corner.source': '源码',
  'corner.sourceTitle': '在 GitHub 上查看源码',
  'corner.stats': '显示性能诊断',
  'corner.lang': '语言',
};

const DICTIONARIES: Record<Lang, Dictionary> = { en, es, pt, ru, zh };

/** Every key English has. Anything missing elsewhere falls back to it. */
export const KEYS = Object.keys(en);

const STORED = 'pencil:lang';

let current: Lang = 'en';
let plurals = new Intl.PluralRules('en');
let lists = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** Which of ours the browser is asking for, or English. */
export function detectLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORED);
    if (saved && saved in DICTIONARIES) return saved as Lang;
  } catch {
    // private browsing; the browser's own preference will do
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    // `pt-BR` and `zh-Hans-CN` both start with a language we have.
    const base = tag.toLowerCase().split('-')[0];
    if (base in DICTIONARIES) return base as Lang;
  }
  return 'en';
}

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  current = lang;
  plurals = new Intl.PluralRules(lang);
  lists = new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' });
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORED, lang);
  } catch {
    // as above: the choice simply will not survive the tab
  }
}

/**
 * One phrase.
 *
 * `n` picks the plural form where there is one, and every `{name}` in the
 * result is replaced from `params`. A missing key falls back to English rather
 * than to the key itself: a half-translated game should read oddly in one
 * language, not show its own source code.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const entry = DICTIONARIES[current][key] ?? en[key];
  if (entry === undefined) return key;
  let text: string;
  if (typeof entry === 'string') {
    text = entry;
  } else {
    const n = Number(params.n ?? 0);
    const category = plurals.select(n) as keyof Plural;
    text = entry[category] ?? entry.other;
  }
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * Every `data-i18n` element on the page, plus the few labels that live in
 * attributes rather than in text.
 *
 * Kept here rather than in the Ui so the title card can be translated before
 * anything is built — the card is on screen for the whole bake, and until this
 * ran there it sat in English while the valley was drawn.
 */
export function translateDom(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    // `n: 0` so a countable phrase reads sensibly before anything has counted
    // anything — the live value replaces it the moment there is one.
    if (key) el.textContent = t(key, { n: 0 });
  }

  /*
   * The picker is filled here rather than by the Ui, for the same reason the
   * rest of this runs early: the Ui is not built until the valley is, and an
   * empty select sitting in the corner for the whole bake is worse than no
   * picker at all.
   */
  const picker = document.getElementById('lang') as HTMLSelectElement | null;
  if (picker) {
    if (picker.options.length === 0) {
      for (const [code, name] of Object.entries(LANGUAGES)) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        picker.append(option);
      }
    }
    picker.value = current;
  }
  const attr = (id: string, title: string, label = title) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.title = title;
    el.setAttribute('aria-label', label);
  };
  attr('ghlink', t('corner.sourceTitle'));
  attr('stats', `${t('corner.stats')} (F)`, t('corner.stats'));
  attr('lang', t('corner.lang'));
}

/** Keys this language is missing, which fall back to English. */
export function missingKeys(lang: Lang): string[] {
  return KEYS.filter((key) => !(key in DICTIONARIES[lang]));
}

/** "a carp and 2 boots", joined the way this language joins things. */
export function list(parts: string[]): string {
  return lists.format(parts);
}
