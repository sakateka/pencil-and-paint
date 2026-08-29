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
  'studio.collection': 'and these were here all along',
  // Named ahead of themselves: only the lion hangs on the easel so far, and the
  // rest are being re-photographed. Their names are done in all five languages
  // and there is no sense throwing that away and doing it again.
  'painting.frogs': 'the frogs on the pond',
  'painting.hen': 'the hen and her chick',
  'painting.owl': 'the owl in the wood',
  'painting.elephant': 'the elephant nobody believes in',
  'painting.house': 'the house on the hill',
  'painting.bullfinch': 'a bullfinch on the rowan',
  'painting.cat': 'the cat in the long grass',
  'painting.lion': 'a lion, mane and all',

  'said.roach': 'a roach!',
  'said.crucian': 'a crucian carp!',
  'said.carp': 'a carp!',
  'said.catfish': 'a catfish!',
  'said.boot': 'an old boot',
  'said.shoe': "somebody's shoe",
  'said.treasure': 'something gold…',

  /*
   * The heading on the card that goes up when a session ends.
   *
   * It used to say "you packed up", which is a fact about the camp rather than
   * about the fishing, and the card is only ever a ledger of what came out of
   * the water. With nothing caught it reads "the catch — nothing but weed,
   * this time", which is still a sentence about fishing.
   */
  'creel.title': 'the catch',
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

  'prompt.sit': 'sit for a while',
  'prompt.sitBench': 'sit on the bench',
  'prompt.lieHay': 'lie back in the hay',
  'prompt.standUp': 'get up',
  'note.satDown': 'nothing to do here but wait',
  'note.stoodUp': 'you stretch, and the wood is a wood again',
  'note.satBench': 'you sit, and for a minute the valley gets on without you',
  'note.leftBench': 'you stand up, and the path is still there',
  'note.lainHay': 'the hay gives under you, and smells of last summer',
  'note.leftHay': 'you get up, picking straw out of your collar',
  'note.elephant': 'something enormous is standing in the trees',
  'note.hedgehog': 'something small has decided you are part of the field',

  'corner.sourceTitle': 'View the source on GitHub',
  'corner.stats': 'Show performance diagnostics',
  'corner.lang': 'Language',
};

const es: Dictionary = {
  'intro.tagline1': 'Alguien dejó este mundo a medio dibujar, a lápiz.',
  'intro.tagline2': 'Solo lo que tienes cerca recuerda sus colores.',
  'intro.drag': 'arrastra para caminar',
  'intro.gather': 'Recoge los botes de pintura esparcidos para que el color llegue más lejos.',
  'intro.start': 'Echar a andar',
  'intro.building': 'dibujando el valle… {n}%',

  'hud.pots': 'botes de pintura',
  'hud.reach': 'el color alcanza {n} pasos',

  'hint.default': 'el mundo solo tiene color donde estás — sal a buscar el resto',
  'hint.awake': 'la página entera está despierta',
  'hint.lastPot': 'queda un último bote aún dibujado a lápiz',
  'hint.further': 'ahora el color llega un poco más lejos',
  'hint.potsLeft': {
    one: 'queda {n} bote aún dibujado a lápiz',
    many: 'quedan {n} botes aún dibujados a lápiz',
    other: 'quedan {n} botes aún dibujados a lápiz',
  },

  'note.firstPet': 'no abre los ojos — pero sabe que estás ahí',
  'note.fire': 'la hoguera prende. no hay mejor sitio donde estar',
  'note.firstFish': 'es pequeño. lo devuelves al agua',
  'note.restQuiet': 'el valle está en silencio. aún no han terminado de dibujarlo',
  'note.restBirds': 'en algún lugar sobre ti, los pájaros han vuelto a cantar',

  'prompt.pet': 'acariciar a la gata',
  'prompt.purring': 'está ronroneando',
  'prompt.fish': 'pescar aquí',
  'prompt.wait': 'espera…',
  'prompt.now': '¡ahora!',
  'prompt.gotAway': 'se escapó',
  'prompt.packUp': 'levantar el campamento',
  'prompt.rest': 'tumbarse en la hamaca',
  'prompt.draw': 'dibujar algo',
  'prompt.climb': 'subir',
  'prompt.climbDown': 'bajar',
  'prompt.getUp': 'levantarse',
  'note.climbedIn': 'aquí arriba no te ve nadie, y esa es la idea',
  'note.climbedDown': 'de nuevo en la hierba',
  'note.drew': 'ya está en el caballete',
  'studio.title': 'alguien dejó esto aquí',
  'studio.clear': 'empezar de nuevo',
  'studio.close': 'guardarlo y salir',
  'studio.empty': 'aún no hay nada guardado',
  'studio.kept': 'un dibujo tuyo',
  'studio.delete': 'tirarlo',
  'studio.colour': 'color',
  'studio.rubber': 'borrar',
  'studio.nib': 'grosor del pincel',
  'studio.collection': 'y estos ya estaban aquí desde el principio',
  'painting.frogs': 'las ranas del estanque',
  'painting.hen': 'la gallina y su pollito',
  'painting.owl': 'el búho del bosque',
  'painting.elephant': 'el elefante en el que nadie cree',
  'painting.house': 'la casa de la colina',
  'painting.bullfinch': 'un camachuelo en el serbal',
  'painting.cat': 'el gato entre la hierba alta',
  'painting.lion': 'un león, con melena y todo',

  'said.roach': '¡un rutilo!',
  'said.crucian': '¡un carpín!',
  'said.carp': '¡una carpa!',
  'said.catfish': '¡un siluro!',
  'said.boot': 'una bota vieja',
  'said.shoe': 'el zapato de alguien',
  'said.treasure': 'algo dorado…',

  'creel.title': 'la captura',
  'creel.empty': 'solo algas, esta vez',
  'creel.roach': { one: 'un rutilo', many: '{n} rutilos', other: '{n} rutilos' },
  'creel.crucian': { one: 'un carpín', many: '{n} carpines', other: '{n} carpines' },
  'creel.carp': { one: 'una carpa', many: '{n} carpas', other: '{n} carpas' },
  'creel.catfish': { one: 'un siluro', many: '{n} siluros', other: '{n} siluros' },
  'creel.boot': { one: 'una bota vieja', many: '{n} botas viejas', other: '{n} botas viejas' },
  'creel.shoe': { one: 'un zapato perdido', many: '{n} zapatos perdidos', other: '{n} zapatos perdidos' },
  'creel.treasure': { one: 'algo dorado', many: '{n} cosas doradas', other: '{n} cosas doradas' },

  'done.title': 'El mundo se acuerda.',
  'done.sub': 'Has encontrado todos los botes en {time}. Quédate todo el tiempo que quieras — ahora el color es tuyo.',
  'done.again': 'Empezar un mundo nuevo',
  'done.open': 'volver a leer la nota',
  'done.tuck': 'guardar la nota',

  'prompt.sit': 'sentarte un rato',
  'prompt.sitBench': 'sentarte en el banco',
  'prompt.lieHay': 'tumbarte en el heno',
  'prompt.standUp': 'levantarte',
  'note.satDown': 'aquí no hay nada que hacer salvo esperar',
  'note.stoodUp': 'te estiras, y el bosque vuelve a ser un bosque',
  'note.satBench': 'te sientas, y por un minuto el valle sigue sin ti',
  'note.leftBench': 'te levantas, y el camino sigue ahí',
  'note.lainHay': 'el heno cede bajo tu peso y huele al verano pasado',
  'note.leftHay': 'te levantas y te quitas la paja del cuello',
  'note.elephant': 'algo enorme está de pie entre los árboles',
  'note.hedgehog': 'algo pequeño ha decidido que eres parte del campo',

  'corner.sourceTitle': 'Ver el código en GitHub',
  'corner.stats': 'Mostrar datos de rendimiento',
  'corner.lang': 'Idioma',
};

const pt: Dictionary = {
  'intro.tagline1': 'Alguém deixou este mundo a meio, desenhado a grafite.',
  'intro.tagline2': 'Só o que está perto de ti se lembra das suas cores.',
  'intro.drag': 'arrasta para andar',
  'intro.gather': 'Junta os boiões de tinta espalhados para a cor chegar mais longe.',
  'intro.start': 'Começar a andar',
  'intro.building': 'a desenhar o vale… {n}%',

  'hud.pots': 'boiões de tinta',
  'hud.reach': 'a cor alcança {n} passos',

  'hint.default': 'o mundo só ganha cor onde tu estás — vai à procura do resto',
  'hint.awake': 'a página inteira está acordada',
  'hint.lastPot': 'falta um último boião ainda desenhado a grafite',
  'hint.further': 'agora a cor chega um pouco mais longe',
  'hint.potsLeft': {
    one: 'falta {n} boião ainda desenhado a grafite',
    many: 'faltam {n} boiões ainda desenhados a grafite',
    other: 'faltam {n} boiões ainda desenhados a grafite',
  },

  'note.firstPet': 'não abre os olhos — mas sabe que estás ali',
  'note.fire': 'a fogueira pega. não há melhor sítio onde estar',
  'note.firstFish': 'é pequeno. voltas a pô-lo na água',
  'note.restQuiet': 'o vale está em silêncio. ainda não acabaram de o desenhar',
  'note.restBirds': 'algures por cima de ti, os pássaros voltaram a cantar',

  'prompt.pet': 'fazer festas à gata',
  'prompt.purring': 'está a ronronar',
  'prompt.fish': 'pescar aqui',
  'prompt.wait': 'espera…',
  'prompt.now': 'agora!',
  'prompt.gotAway': 'fugiu',
  'prompt.packUp': 'levantar o acampamento',
  'prompt.rest': 'deitar-se na rede',
  'prompt.draw': 'desenhar alguma coisa',
  'prompt.climb': 'subir',
  'prompt.climbDown': 'descer',
  'prompt.getUp': 'levantar-se',
  'note.climbedIn': 'aqui em cima ninguém te vê, e essa é precisamente a ideia',
  'note.climbedDown': 'de volta cá abaixo, na relva',
  'note.drew': 'agora está no cavalete',
  'studio.title': 'alguém deixou isto aqui',
  'studio.clear': 'começar de novo',
  'studio.close': 'guardá-lo e sair',
  'studio.empty': 'ainda não há nada guardado',
  'studio.kept': 'um desenho teu',
  'studio.delete': 'deitar fora',
  'studio.colour': 'cor',
  'studio.rubber': 'apagar',
  'studio.nib': 'espessura do pincel',
  'studio.collection': 'e estes já cá estavam desde o início',
  'painting.frogs': 'as rãs do lago',
  'painting.hen': 'a galinha e o seu pinto',
  'painting.owl': 'a coruja do bosque',
  'painting.elephant': 'o elefante em que ninguém acredita',
  'painting.house': 'a casa na colina',
  'painting.bullfinch': 'um dom-fafe na tramazeira',
  'painting.cat': 'o gato na erva alta',
  'painting.lion': 'um leão, com juba e tudo',

  'said.roach': 'uma pardelha-dos-alpes!',
  'said.crucian': 'um pimpão!',
  'said.carp': 'uma carpa!',
  'said.catfish': 'um peixe-gato!',
  'said.boot': 'uma bota velha',
  'said.shoe': 'o sapato de alguém',
  'said.treasure': 'algo dourado…',

  'creel.title': 'a captura',
  'creel.empty': 'só algas, desta vez',
  'creel.roach': { one: 'uma pardelha-dos-alpes', many: '{n} pardelhas-dos-alpes', other: '{n} pardelhas-dos-alpes' },
  'creel.crucian': { one: 'um pimpão', many: '{n} pimpões', other: '{n} pimpões' },
  'creel.carp': { one: 'uma carpa', many: '{n} carpas', other: '{n} carpas' },
  'creel.catfish': { one: 'um peixe-gato', many: '{n} peixes-gato', other: '{n} peixes-gato' },
  'creel.boot': { one: 'uma bota velha', many: '{n} botas velhas', other: '{n} botas velhas' },
  'creel.shoe': { one: 'um sapato perdido', many: '{n} sapatos perdidos', other: '{n} sapatos perdidos' },
  'creel.treasure': { one: 'algo dourado', many: '{n} coisas douradas', other: '{n} coisas douradas' },

  'done.title': 'O mundo lembra-se.',
  'done.sub': 'Encontraste todos os boiões em {time}. Fica o tempo que quiseres — agora a cor é tua.',
  'done.again': 'Começar um mundo novo',
  'done.open': 'voltar a ler a nota',
  'done.tuck': 'guardar a nota',

  'prompt.sit': 'sentar um bocado',
  'prompt.sitBench': 'sentar no banco',
  'prompt.lieHay': 'deitar no feno',
  'prompt.standUp': 'levantar-te',
  'note.satDown': 'aqui não há nada a fazer senão esperar',
  'note.stoodUp': 'espreguiças-te, e o bosque volta a ser um bosque',
  'note.satBench': 'sentas-te, e por um minuto o vale segue sem ti',
  'note.leftBench': 'levantas-te, e o caminho continua ali',
  'note.lainHay': 'o feno cede debaixo de ti e cheira ao verão passado',
  'note.leftHay': 'levantas-te, a tirar palha do colarinho',
  'note.elephant': 'algo enorme está parado entre as árvores',
  'note.hedgehog': 'algo pequeno decidiu que você faz parte do campo',

  'corner.sourceTitle': 'Ver o código no GitHub',
  'corner.stats': 'Mostrar dados de desempenho',
  'corner.lang': 'Idioma',
};

const ru: Dictionary = {
  'intro.tagline1': 'Кто-то оставил этот мир недорисованным — в карандашных штрихах.',
  'intro.tagline2': 'Лишь то, что рядом с тобой, помнит свои краски.',
  'intro.drag': 'веди пальцем, чтобы идти',
  'intro.gather': 'Собирай разбросанные банки с краской — и цвет будет разливаться всё дальше.',
  'intro.start': 'Пойти гулять',
  'intro.building': 'рисуем долину… {n}%',

  'hud.pots': 'банок с краской',
  'hud.reach': 'цвет простирается на {n} шагов',

  'hint.default': 'мир становится цветным лишь рядом с тобой — иди и посмотри, что там дальше',
  'hint.awake': 'вся страница проснулась',
  'hint.lastPot': 'осталась последняя нераскрашенная банка',
  'hint.further': 'теперь цвет простирается чуть дальше',
  'hint.potsLeft': {
    one: 'осталась {n} нераскрашенная банка',
    few: 'осталось {n} нераскрашенные банки',
    many: 'осталось {n} нераскрашенных банок',
    other: 'осталось {n} нераскрашенной банки',
  },

  'note.firstPet': 'она не открывает глаз — но всё равно знает, что ты рядом',
  'note.fire': 'костёр разгорелся. больше нигде не хочется быть',
  'note.firstFish': 'маленькая рыбёшка. ты отпускаешь её обратно в воду',
  'note.restQuiet': 'в долине тихо. её ещё не дорисовали',
  'note.restBirds': 'где-то над тобой снова запели птицы',

  'prompt.pet': 'погладить кошку',
  'prompt.purring': 'она мурлычет',
  'prompt.fish': 'порыбачить здесь',
  'prompt.wait': 'подожди…',
  'prompt.now': 'тяни!',
  'prompt.gotAway': 'ушла',
  'prompt.packUp': 'свернуть лагерь',
  'prompt.rest': 'лечь в гамак',
  'prompt.draw': 'что-нибудь нарисовать',
  'prompt.climb': 'забраться наверх',
  'prompt.climbDown': 'спуститься',
  'prompt.getUp': 'встать',
  'note.climbedIn': 'здесь наверху тебя никто не видит — в этом и весь смысл',
  'note.climbedDown': 'снова внизу, на траве',
  'note.drew': 'теперь рисунок стоит на мольберте',
  'studio.title': 'кто-то оставил это здесь',
  'studio.clear': 'начать заново',
  'studio.close': 'сохранить и уйти',
  'studio.empty': 'пока ничего не сохранено',
  'studio.kept': 'твой рисунок',
  'studio.delete': 'выбросить',
  'studio.colour': 'цвет',
  'studio.rubber': 'стереть',
  'studio.nib': 'толщина кисти',
  'studio.collection': 'а ведь они всё это время были здесь',
  'painting.frogs': 'лягушки в пруду',
  'painting.hen': 'курица с цыплёнком',
  'painting.owl': 'сова в лесу',
  'painting.elephant': 'слон, в которого никто не верит',
  'painting.house': 'дом на холме',
  'painting.bullfinch': 'снегирь на рябине',
  'painting.cat': 'кот в высокой траве',
  'painting.lion': 'лев — с гривой, как полагается',

  'said.roach': 'плотва!',
  'said.crucian': 'карась!',
  'said.carp': 'карп!',
  'said.catfish': 'сом!',
  'said.boot': 'старый сапог',
  'said.shoe': 'чей-то ботинок',
  'said.treasure': 'что-то золотое…',

  'creel.title': 'улов',
  'creel.empty': 'на этот раз только водоросли',
  'creel.roach': {
    one: '{n} плотва',
    few: '{n} плотвы',
    many: '{n} плотв',
    other: '{n} плотвы',
  },
  'creel.crucian': {
    one: '{n} карась',
    few: '{n} карася',
    many: '{n} карасей',
    other: '{n} карася',
  },
  'creel.carp': {
    one: '{n} карп',
    few: '{n} карпа',
    many: '{n} карпов',
    other: '{n} карпа',
  },
  'creel.catfish': {
    one: '{n} сом',
    few: '{n} сома',
    many: '{n} сомов',
    other: '{n} сома',
  },
  'creel.boot': {
    one: '{n} старый сапог',
    few: '{n} старых сапога',
    many: '{n} старых сапог',
    other: '{n} старого сапога',
  },
  'creel.shoe': {
    one: '{n} потерянный ботинок',
    few: '{n} потерянных ботинка',
    many: '{n} потерянных ботинок',
    other: '{n} потерянного ботинка',
  },
  'creel.treasure': {
    one: '{n} золотая вещица',
    few: '{n} золотые вещицы',
    many: '{n} золотых вещиц',
    other: '{n} золотой вещицы',
  },

  'done.title': 'Мир помнит.',
  'done.sub': 'Все банки найдены за {time}. Оставайся сколько хочешь — цвет теперь твой.',
  'done.again': 'Начать новый мир',
  'done.open': 'перечитать записку',
  'done.tuck': 'убрать записку',

  'prompt.sit': 'посидеть немного',
  'prompt.sitBench': 'сесть на скамейку',
  'prompt.lieHay': 'полежать на сене',
  'prompt.standUp': 'встать',
  'note.satDown': 'здесь нечего делать — только ждать',
  'note.stoodUp': 'ты потягиваешься, и лес снова просто лес',
  'note.satBench': 'ты садишься, и минуту долина обходится без тебя',
  'note.leftBench': 'ты встаёшь, и тропинка всё там же',
  'note.lainHay': 'сено проминается под тобой и пахнет прошлым летом',
  'note.leftHay': 'ты поднимаешься, вытаскивая соломинки из-за ворота',
  'note.elephant': 'что-то огромное стоит между деревьев',
  'note.hedgehog': 'кто-то маленький решил, что ты — часть поля',

  'corner.sourceTitle': 'Посмотреть исходники на GitHub',
  'corner.stats': 'Показать диагностику производительности',
  'corner.lang': 'Язык',
};

const zh: Dictionary = {
  'intro.tagline1': '有人把这个世界画到一半就搁下了，只剩铅笔线。',
  'intro.tagline2': '只有你身边的地方还记得自己的色彩。',
  'intro.drag': '拖动屏幕即可行走',
  'intro.gather': '把散落的颜料罐捡起来，让颜色铺得更远。',
  'intro.start': '出发',
  'intro.building': '正在描绘这片山谷……{n}%',

  'hud.pots': '颜料罐',
  'hud.reach': '颜色能延伸到{n}步外',

  'hint.default': '世界只有你身边有颜色——去找回其他地方的色彩吧',
  'hint.awake': '整张纸都醒了',
  'hint.lastPot': '还剩最后一罐没有上色',
  'hint.further': '颜色又向外延伸了一点',
  'hint.potsLeft': { other: '还有{n}罐没有上色' },

  'note.firstPet': '她没有睁开眼睛，却知道你就在身边',
  'note.fire': '篝火燃起来了。此刻哪儿也不想去',
  'note.firstFish': '很小的一条。你把它放回水里',
  'note.restQuiet': '山谷静悄悄的。它还没有画完',
  'note.restBirds': '在你头顶的某处，鸟儿又唱了起来',

  'prompt.pet': '摸摸猫',
  'prompt.purring': '她在轻轻打呼噜',
  'prompt.fish': '在这儿钓鱼',
  'prompt.wait': '耐心等着……',
  'prompt.now': '就是现在！',
  'prompt.gotAway': '它跑了',
  'prompt.packUp': '收拾营地',
  'prompt.rest': '躺进吊床',
  'prompt.draw': '画点什么',
  'prompt.climb': '爬上去',
  'prompt.climbDown': '爬下来',
  'prompt.getUp': '起身',
  'note.climbedIn': '躲在这里谁也看不见你——要的就是这样',
  'note.climbedDown': '又回到草地上了',
  'note.drew': '画已经摆上画架了',
  'studio.title': '有人把这个留在了这里',
  'studio.clear': '重新开始',
  'studio.close': '保存并离开',
  'studio.empty': '还没有保存的画',
  'studio.kept': '你画的一幅画',
  'studio.delete': '扔掉',
  'studio.colour': '颜色',
  'studio.rubber': '擦掉',
  'studio.nib': '画笔粗细',
  'studio.collection': '原来它们一直都在这里',
  'painting.frogs': '池塘里的青蛙',
  'painting.hen': '母鸡和它的小鸡',
  'painting.owl': '林子里的猫头鹰',
  'painting.elephant': '那头没人相信存在的大象',
  'painting.house': '山坡上的房子',
  'painting.bullfinch': '花楸树上的红腹灰雀',
  'painting.cat': '长草丛里的猫',
  'painting.lion': '一头狮子，连鬃毛都有',

  'said.roach': '一条拟鲤！',
  'said.crucian': '一条鲫鱼！',
  'said.carp': '一条鲤鱼！',
  'said.catfish': '一条鲶鱼！',
  'said.boot': '一只旧靴子',
  'said.shoe': '不知道是谁的鞋',
  'said.treasure': '金色的东西……',

  'creel.title': '渔获',
  'creel.empty': '这回只有水草',
  'creel.roach': { other: '{n}条拟鲤' },
  'creel.crucian': { other: '{n}条鲫鱼' },
  'creel.carp': { other: '{n}条鲤鱼' },
  'creel.catfish': { other: '{n}条鲶鱼' },
  'creel.boot': { other: '{n}只旧靴子' },
  'creel.shoe': { other: '{n}只遗失的鞋' },
  'creel.treasure': { other: '{n}件金色的东西' },

  'done.title': '世界记得这一切。',
  'done.sub': '你用{time}找齐了所有颜料罐。想待多久都可以——现在，颜色属于你了。',
  'done.again': '开启新世界',
  'done.open': '再读一遍那张字条',
  'done.tuck': '把字条收起来',

  'prompt.sit': '坐一会儿',
  'prompt.sitBench': '在长椅上坐坐',
  'prompt.lieHay': '躺进干草堆',
  'prompt.standUp': '站起来',
  'note.satDown': '这里没别的事可做，只能等',
  'note.stoodUp': '你伸了个懒腰，林子又只是林子了',
  'note.satBench': '你坐下来，山谷有一分钟不必等你',
  'note.leftBench': '你站起身，小路还在那里',
  'note.lainHay': '干草在身下陷下去，闻起来像去年的夏天',
  'note.leftHay': '你起身，从领口里挑出草秆',
  'note.elephant': '有个庞然大物站在树林里',
  'note.hedgehog': '有个小家伙认定你也是这片田野的一部分',

  'corner.sourceTitle': '在 GitHub 上查看源码',
  'corner.stats': '显示性能数据',
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
/**
 * Things wanting to hear that the language changed.
 *
 * The Ui subscribes; it cannot own the picker's `change` handler itself,
 * because it does not exist while the title card is on screen — which is
 * precisely when somebody is looking for the language picker.
 */
const listeners = new Set<() => void>();

export function onLanguageChange(fn: () => void): void {
  listeners.add(fn);
}

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
      /*
       * Listened to here, the first time the options are filled.
       *
       * This used to be the Ui's, and the Ui is not built until somebody has
       * pressed Start and the valley has finished baking — so for the whole
       * time the title card was up, the one screen where the picker is the
       * only thing to interact with, choosing a language did nothing at all.
       */
      picker.addEventListener('change', () => {
        setLanguage(picker.value as Lang);
        translateDom();
        picker.blur();
        for (const fn of listeners) fn();
      });
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
