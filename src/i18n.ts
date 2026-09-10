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
  'intro.tagline1': 'Someone drew this world in pencil and left it for you to colour.',
  'intro.tagline2': 'As you walk, the world fills with colour around you.',
  'intro.drag': 'drag to walk',
  'intro.gather': 'Collect paint pots to spread colour further.',
  'intro.start': 'Start walking',
  'intro.building': 'drawing the valley… {n}%',
  'intro.details': 'loading details',
  'intro.copy': 'copy',
  'intro.copied': 'copied',
  'intro.selected': 'selected — long-press to copy',

  'hud.pots': 'paint pots',
  'hud.reach': 'colour reaches {n} steps',

  'hint.default': 'follow the paths and look for paint pots',
  'hint.awake': 'the whole world is full of colour',
  'hint.lastPot': 'just one paint pot left to find',
  'hint.further': 'your colours reach a little further now',
  'hint.potsLeft': { one: '{n} paint pot left to find', other: '{n} paint pots left to find' },

  'note.firstPet': 'she does not open her eyes — but she knows you are there',
  'note.fire': 'the fire is crackling. stay and warm up',
  'note.firstFish': 'your first catch. what else might be in the pond?',
  'note.restQuiet': 'the valley is quiet. lie back, there is no hurry',
  'note.restBirds': 'somewhere above you, the birds have started up again',
  'prompt.fish': 'fish here',
  'prompt.wait': 'wait for it…',
  'prompt.now': 'now!',
  'prompt.gotAway': 'it got away',
  'prompt.packUp': 'put the fishing rod away',
  'prompt.rest': 'lie in the hammock',
  'prompt.draw': 'draw something',
  'prompt.climb': 'climb up',
  'prompt.climbDown': 'climb down',
  'prompt.getUp': 'get up',
  'note.climbedIn': 'up here, you have a hiding place all to yourself',
  'note.climbedDown': 'back down on the grass',
  'note.drew': 'it is on the easel now',
  'studio.title': 'a place to draw',
  'studio.clear': 'start again',
  'studio.close': 'keep it and go',
  'studio.empty': 'your drawings will go here',
  'studio.kept': 'something you drew',
  'studio.delete': 'throw it away',
  'studio.colour': 'colour',
  'studio.rubber': 'rub out',
  'studio.nib': 'brush size',
  'studio.collection': 'more pictures to look at',
  // Named ahead of themselves: only the lion hangs on the easel so far, and the
  // rest are being re-photographed. Their names are done in all five languages
  // and there is no sense throwing that away and doing it again.
  'painting.frogs': 'the frogs on the pond',
  'painting.hen': 'the hen and her chick',
  'painting.owl': 'the owl in the wood',
  'painting.elephant': 'an elephant in the clouds',
  'painting.house': 'the house on the hill',
  'painting.bullfinch': 'a bullfinch on the rowan',
  'painting.cat': 'the cat in the long grass',
  'painting.lion': 'a lion with a shaggy mane',

  'said.roach': 'a roach!',
  'said.crucian': 'a crucian carp!',
  'said.carp': 'a carp!',
  'said.catfish': 'a catfish!',
  'said.boot': 'an old boot',
  'said.shoe': 'somebody\'s shoe',
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

  'done.title': 'The world is coloured in!',
  'done.sub': 'All the paint pots found in {time}. You can stay and play as long as you like.',
  'done.again': 'Play again',
  'done.open': 'read the note again',
  'done.tuck': 'put the note away',

  'prompt.sit': 'sit for a while',
  'prompt.sitBench': 'sit on the bench',
  'prompt.lieHay': 'lie back in the hay',
  'prompt.standUp': 'get up',
  'note.satDown': 'take a rest and watch the sky',
  'note.stoodUp': 'you stretch and head back into the woods',
  'note.satBench': 'you sit down to enjoy the quiet valley',
  'note.leftBench': 'time to wander down the path again',
  'note.lainHay': 'the hay gives under you, and smells of last summer',
  'note.leftHay': 'you get up, picking straw out of your collar',
  'note.elephant': 'look up — a cloud has taken the shape of an elephant',
  'prompt.look.well': 'look down the well',
  'prompt.look.scarecrow': 'look at the scarecrow',
  'closer.done': 'leave',
  'closer.well.title': 'inside the well',
  'closer.well.line': 'it is cool and dark down there. moss grows where the light reaches',
  'closer.scarecrow.title': 'the scarecrow\'s face',
  'closer.scarecrow.line': 'two different buttons for eyes and a crooked stitched smile. someone made this by hand',
  'note.hedgehog': 'a little hedgehog has come to sit beside you',

  'corner.sourceTitle': 'View the source on GitHub',
  'corner.stats': 'Show performance diagnostics',
  'corner.lang': 'Language',
};

const es: Dictionary = {
  'intro.tagline1': 'Alguien dibujó este mundo a lápiz y lo dejó para que tú lo colorees.',
  'intro.tagline2': 'A tu paso, el mundo se llena de color a tu alrededor.',
  'intro.drag': 'arrastra para caminar',
  'intro.gather': 'Recoge botes de pintura para que el color llegue más lejos.',
  'intro.start': 'Echar a andar',
  'intro.building': 'dibujando el valle… {n}%',
  'intro.details': 'detalles de la carga',
  'intro.copy': 'copiar',
  'intro.copied': 'copiado',
  'intro.selected': 'seleccionado: mantén pulsado para copiar',

  'hud.pots': 'botes de pintura',
  'hud.reach': 'el color alcanza {n} pasos',

  'hint.default': 'sigue los caminos y busca botes de pintura',
  'hint.awake': 'todo el mundo está lleno de color',
  'hint.lastPot': 'solo falta un bote de pintura',
  'hint.further': 'ahora tus colores llegan un poco más lejos',
  'hint.potsLeft': {
    one: 'queda {n} bote por encontrar',
    many: 'quedan {n} botes por encontrar',
    other: 'quedan {n} botes por encontrar',
  },

  'note.firstPet': 'no abre los ojos — pero sabe que estás ahí',
  'note.fire': 'el fuego crepita. quédate a calentarte',
  'note.firstFish': 'tu primera captura. ¿qué más habrá en el estanque?',
  'note.restQuiet': 'el valle está tranquilo. descansa, no hay prisa',
  'note.restBirds': 'en algún lugar sobre ti, los pájaros han vuelto a cantar',
  'prompt.fish': 'pescar aquí',
  'prompt.wait': 'espera…',
  'prompt.now': '¡ahora!',
  'prompt.gotAway': 'se escapó',
  'prompt.packUp': 'guardar la caña',
  'prompt.rest': 'tumbarse en la hamaca',
  'prompt.draw': 'dibujar algo',
  'prompt.climb': 'subir',
  'prompt.climbDown': 'bajar',
  'prompt.getUp': 'levantarse',
  'note.climbedIn': 'aquí arriba tienes un escondite para ti',
  'note.climbedDown': 'de nuevo en la hierba',
  'note.drew': 'ya está en el caballete',
  'studio.title': 'un lugar para dibujar',
  'studio.clear': 'empezar de nuevo',
  'studio.close': 'guardar y salir',
  'studio.empty': 'aquí estarán tus dibujos',
  'studio.kept': 'un dibujo tuyo',
  'studio.delete': 'tirarlo',
  'studio.colour': 'color',
  'studio.rubber': 'borrar',
  'studio.nib': 'grosor del pincel',
  'studio.collection': 'más cuadros para mirar',
  'painting.frogs': 'las ranas del estanque',
  'painting.hen': 'la gallina y su pollito',
  'painting.owl': 'el búho del bosque',
  'painting.elephant': 'un elefante entre las nubes',
  'painting.house': 'la casa de la colina',
  'painting.bullfinch': 'un camachuelo en el serbal',
  'painting.cat': 'el gato entre la hierba alta',
  'painting.lion': 'un león de melena espesa',

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

  'done.title': '¡El mundo está coloreado!',
  'done.sub': 'Has encontrado todos los botes en {time}. Puedes quedarte a jugar todo lo que quieras.',
  'done.again': 'Volver a jugar',
  'done.open': 'volver a leer la nota',
  'done.tuck': 'guardar la nota',

  'prompt.sit': 'sentarte un rato',
  'prompt.sitBench': 'sentarte en el banco',
  'prompt.lieHay': 'tumbarte en el heno',
  'prompt.standUp': 'levantarte',
  'note.satDown': 'descansa un rato y mira el cielo',
  'note.stoodUp': 'te estiras y vuelves al bosque',
  'note.satBench': 'te sientas a disfrutar de la calma del valle',
  'note.leftBench': 'es hora de seguir paseando por el camino',
  'note.lainHay': 'el heno cede bajo tu peso y huele al verano pasado',
  'note.leftHay': 'te levantas y te quitas la paja del cuello',
  'note.elephant': 'mira el cielo: una nube ha tomado forma de elefante',
  'prompt.look.well': 'asomarse al pozo',
  'prompt.look.scarecrow': 'mirar el espantapájaros',
  'closer.done': 'irse',
  'closer.well.title': 'dentro del pozo',
  'closer.well.line': 'ahí abajo está fresco y oscuro. el musgo crece hasta donde llega la luz',
  'closer.scarecrow.title': 'la cara del espantapájaros',
  'closer.scarecrow.line': 'dos botones distintos hacen de ojos y una sonrisa está cosida un poco torcida. alguien lo hizo a mano',
  'note.hedgehog': 'un pequeño erizo se ha acercado a sentarse contigo',

  'corner.sourceTitle': 'Ver el código en GitHub',
  'corner.stats': 'Mostrar datos de rendimiento',
  'corner.lang': 'Idioma',
};

const pt: Dictionary = {
  'intro.tagline1': 'Alguém desenhou este mundo a lápis e deixou-o para tu o colorires.',
  'intro.tagline2': 'Por onde passas, o mundo ganha cor à tua volta.',
  'intro.drag': 'arrasta para andar',
  'intro.gather': 'Junta boiões de tinta para a cor chegar mais longe.',
  'intro.start': 'Começar a andar',
  'intro.building': 'a desenhar o vale… {n}%',
  'intro.details': 'detalhes do carregamento',
  'intro.copy': 'copiar',
  'intro.copied': 'copiado',
  'intro.selected': 'selecionado: mantém premido para copiar',

  'hud.pots': 'boiões de tinta',
  'hud.reach': 'a cor alcança {n} passos',

  'hint.default': 'segue os caminhos e procura boiões de tinta',
  'hint.awake': 'o mundo inteiro está cheio de cor',
  'hint.lastPot': 'só falta um boião de tinta',
  'hint.further': 'agora as tuas cores chegam um pouco mais longe',
  'hint.potsLeft': {
    one: 'falta encontrar {n} boião',
    many: 'faltam encontrar {n} boiões',
    other: 'faltam encontrar {n} boiões',
  },

  'note.firstPet': 'não abre os olhos — mas sabe que estás ali',
  'note.fire': 'a fogueira está a crepitar. fica a aquecer-te',
  'note.firstFish': 'já apanhaste alguma coisa! que mais haverá no lago?',
  'note.restQuiet': 'o vale está sossegado. descansa, não há pressa',
  'note.restBirds': 'algures por cima de ti, os pássaros voltaram a cantar',
  'prompt.fish': 'pescar aqui',
  'prompt.wait': 'espera…',
  'prompt.now': 'agora!',
  'prompt.gotAway': 'fugiu',
  'prompt.packUp': 'guardar a cana',
  'prompt.rest': 'deitar-se na rede',
  'prompt.draw': 'desenhar alguma coisa',
  'prompt.climb': 'subir',
  'prompt.climbDown': 'descer',
  'prompt.getUp': 'levantar-se',
  'note.climbedIn': 'aqui em cima tens um esconderijo só teu',
  'note.climbedDown': 'de volta cá abaixo, na relva',
  'note.drew': 'agora está no cavalete',
  'studio.title': 'um lugar para desenhar',
  'studio.clear': 'começar de novo',
  'studio.close': 'guardar e sair',
  'studio.empty': 'os teus desenhos vão ficar aqui',
  'studio.kept': 'um desenho teu',
  'studio.delete': 'deitar fora',
  'studio.colour': 'cor',
  'studio.rubber': 'apagar',
  'studio.nib': 'espessura do pincel',
  'studio.collection': 'mais quadros para ver',
  'painting.frogs': 'as rãs do lago',
  'painting.hen': 'a galinha e o seu pinto',
  'painting.owl': 'a coruja do bosque',
  'painting.elephant': 'um elefante nas nuvens',
  'painting.house': 'a casa na colina',
  'painting.bullfinch': 'um dom-fafe na tramazeira',
  'painting.cat': 'o gato na erva alta',
  'painting.lion': 'um leão com uma grande juba',

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

  'done.title': 'O mundo está todo colorido!',
  'done.sub': 'Encontraste todos os boiões em {time}. Podes ficar a brincar o tempo que quiseres.',
  'done.again': 'Jogar outra vez',
  'done.open': 'voltar a ler a nota',
  'done.tuck': 'guardar a nota',

  'prompt.sit': 'sentar um bocado',
  'prompt.sitBench': 'sentar no banco',
  'prompt.lieHay': 'deitar no feno',
  'prompt.standUp': 'levantar-te',
  'note.satDown': 'descansa um pouco e olha para o céu',
  'note.stoodUp': 'espreguiças-te e voltas ao bosque',
  'note.satBench': 'sentas-te a aproveitar o sossego do vale',
  'note.leftBench': 'é hora de voltar a passear pelo caminho',
  'note.lainHay': 'o feno cede debaixo de ti e cheira ao verão passado',
  'note.leftHay': 'levantas-te, a tirar palha do colarinho',
  'note.elephant': 'olha para o céu — uma nuvem tomou a forma de um elefante',
  'prompt.look.well': 'olhar dentro do poço',
  'prompt.look.scarecrow': 'olhar para o espantalho',
  'closer.done': 'ir embora',
  'closer.well.title': 'dentro do poço',
  'closer.well.line': 'lá em baixo está fresco e escuro. o musgo cresce até onde chega a luz',
  'closer.scarecrow.title': 'o rosto do espantalho',
  'closer.scarecrow.line': 'dois botões diferentes fazem de olhos e o sorriso ficou um pouco torto. alguém o coseu à mão',
  'note.hedgehog': 'um pequeno ouriço veio sentar-se ao teu lado',

  'corner.sourceTitle': 'Ver o código no GitHub',
  'corner.stats': 'Mostrar dados de desempenho',
  'corner.lang': 'Idioma',
};

const ru: Dictionary = {
  'intro.tagline1': 'Этот мир нарисован карандашом. Давай его раскрасим!',
  'intro.tagline2': 'Там, где ты идёшь, всё вокруг становится цветным.',
  'intro.drag': 'веди пальцем, чтобы идти',
  'intro.gather': 'Собирай банки с краской, чтобы раскрасить весь мир.',
  'intro.start': 'Пойти гулять',
  'intro.building': 'рисуем долину… {n}%',
  'intro.details': 'подробности загрузки',
  'intro.copy': 'скопировать',
  'intro.copied': 'скопировано',
  'intro.selected': 'выделено — задержи палец, чтобы скопировать',

  'hud.pots': 'банок с краской',
  'hud.reach': { one: 'краски хватает на {n} шаг', few: 'краски хватает на {n} шага', many: 'краски хватает на {n} шагов', other: 'краски хватает на {n} шага' },

  'hint.default': 'гуляй по тропинкам и ищи банки с краской',
  'hint.awake': 'теперь весь мир цветной',
  'hint.lastPot': 'осталось найти одну банку с краской',
  'hint.further': 'теперь можно раскрасить ещё больше',
  'hint.potsLeft': {
    one: 'осталось найти {n} банку',
    few: 'осталось найти {n} банки',
    many: 'осталось найти {n} банок',
    other: 'осталось найти {n} банки',
  },

  'note.firstPet': 'кошка не открывает глаз, но чувствует, что ты рядом',
  'note.fire': 'в костре потрескивают дрова. можно погреться',
  'note.firstFish': 'первый улов! интересно, что ещё есть в пруду?',
  'note.restQuiet': 'в долине тихо. можно полежать и никуда не спешить',
  'note.restBirds': 'где-то над тобой снова запели птицы',
  'prompt.fish': 'порыбачить здесь',
  'prompt.wait': 'подожди…',
  'prompt.now': 'тяни!',
  'prompt.gotAway': 'ушла',
  'prompt.packUp': 'убрать удочку',
  'prompt.rest': 'лечь в гамак',
  'prompt.draw': 'что-нибудь нарисовать',
  'prompt.climb': 'забраться наверх',
  'prompt.climbDown': 'спуститься',
  'prompt.getUp': 'встать',
  'note.climbedIn': 'здесь наверху у тебя свой укромный уголок',
  'note.climbedDown': 'снова внизу, на траве',
  'note.drew': 'теперь рисунок стоит на мольберте',
  'studio.title': 'здесь можно рисовать',
  'studio.clear': 'начать заново',
  'studio.close': 'сохранить рисунок',
  'studio.empty': 'здесь будут твои рисунки',
  'studio.kept': 'твой рисунок',
  'studio.delete': 'выбросить',
  'studio.colour': 'цвет',
  'studio.rubber': 'стереть',
  'studio.nib': 'толщина кисти',
  'studio.collection': 'ещё картины — можно посмотреть',
  'painting.frogs': 'лягушки в пруду',
  'painting.hen': 'курица с цыплёнком',
  'painting.owl': 'сова в лесу',
  'painting.elephant': 'слон в облаках',
  'painting.house': 'дом на холме',
  'painting.bullfinch': 'снегирь на рябине',
  'painting.cat': 'кот в высокой траве',
  'painting.lion': 'лев с лохматой гривой',

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

  'done.title': 'Мир раскрашен!',
  'done.sub': 'Все банки с краской найдены за {time}. Можно остаться и играть сколько захочешь.',
  'done.again': 'Играть заново',
  'done.open': 'перечитать записку',
  'done.tuck': 'убрать записку',

  'prompt.sit': 'посидеть немного',
  'prompt.sitBench': 'сесть на скамейку',
  'prompt.lieHay': 'полежать на сене',
  'prompt.standUp': 'встать',
  'note.satDown': 'можно отдохнуть и посмотреть на небо',
  'note.stoodUp': 'ты потягиваешься и возвращаешься в лес',
  'note.satBench': 'ты садишься отдохнуть. как же здесь тихо',
  'note.leftBench': 'можно снова отправляться по тропинке',
  'note.lainHay': 'сено проминается под тобой и пахнет прошлым летом',
  'note.leftHay': 'ты поднимаешься, вытаскивая соломинки из-за ворота',
  'note.elephant': 'смотри, в небе облако превратилось в слона',
  'prompt.look.well': 'заглянуть в колодец',
  'prompt.look.scarecrow': 'рассмотреть пугало',
  'closer.done': 'уйти',
  'closer.well.title': 'внутри колодца',
  'closer.well.line': 'внизу темно и прохладно. мох растёт только там, куда попадает свет',
  'closer.scarecrow.title': 'лицо пугала',
  'closer.scarecrow.line': 'вместо глаз — две разные пуговицы, а улыбка пришита чуть криво. кто-то смастерил его своими руками',
  'note.hedgehog': 'маленький ёжик пришёл посидеть рядом с тобой',

  'corner.sourceTitle': 'Посмотреть исходники на GitHub',
  'corner.stats': 'Показать диагностику производительности',
  'corner.lang': 'Язык',
};

const zh: Dictionary = {
  'intro.tagline1': '有人用铅笔画好了这个世界，等你来涂上颜色。',
  'intro.tagline2': '你走到哪里，身边的景物就会变成彩色。',
  'intro.drag': '拖动屏幕即可行走',
  'intro.gather': '捡起散落的颜料罐，让更多地方变成彩色。',
  'intro.start': '出发',
  'intro.building': '正在描绘这片山谷……{n}%',
  'intro.details': '加载详情',
  'intro.copy': '复制',
  'intro.copied': '已复制',
  'intro.selected': '已选中 — 长按即可复制',

  'hud.pots': '颜料罐',
  'hud.reach': '颜色能延伸到{n}步外',

  'hint.default': '沿着小路走走，找找颜料罐吧',
  'hint.awake': '整个世界都有颜色了',
  'hint.lastPot': '只剩最后一罐颜料啦',
  'hint.further': '现在能给更远的地方涂上颜色了',
  'hint.potsLeft': { other: '还有{n}罐颜料没找到' },

  'note.firstPet': '猫咪没有睁开眼睛，却知道你就在身边',
  'note.fire': '篝火噼啪作响。留下来暖和一下吧',
  'note.firstFish': '钓上来啦！池塘里还会有什么呢？',
  'note.restQuiet': '山谷静悄悄的。躺着歇一会儿，不用急着走',
  'note.restBirds': '在你头顶的某处，鸟儿又唱了起来',
  'prompt.fish': '在这儿钓鱼',
  'prompt.wait': '耐心等着……',
  'prompt.now': '就是现在！',
  'prompt.gotAway': '它跑了',
  'prompt.packUp': '收起鱼竿',
  'prompt.rest': '躺进吊床',
  'prompt.draw': '画点什么',
  'prompt.climb': '爬上去',
  'prompt.climbDown': '爬下来',
  'prompt.getUp': '起身',
  'note.climbedIn': '这里是只属于你的小小藏身处',
  'note.climbedDown': '又回到草地上了',
  'note.drew': '画已经摆上画架了',
  'studio.title': '在这里画画吧',
  'studio.clear': '重新开始',
  'studio.close': '保存画作',
  'studio.empty': '你的画会保存在这里',
  'studio.kept': '你画的一幅画',
  'studio.delete': '扔掉',
  'studio.colour': '颜色',
  'studio.rubber': '擦掉',
  'studio.nib': '画笔粗细',
  'studio.collection': '还有这些画可以欣赏',
  'painting.frogs': '池塘里的青蛙',
  'painting.hen': '母鸡和它的小鸡',
  'painting.owl': '林子里的猫头鹰',
  'painting.elephant': '云中的大象',
  'painting.house': '山坡上的房子',
  'painting.bullfinch': '花楸树上的红腹灰雀',
  'painting.cat': '长草丛里的猫',
  'painting.lion': '鬃毛蓬松的狮子',

  'said.roach': '一条拟鲤！',
  'said.crucian': '一条鲫鱼！',
  'said.carp': '一条鲤鱼！',
  'said.catfish': '一条鲶鱼！',
  'said.boot': '一只旧靴子',
  'said.shoe': '不知道是谁的鞋',
  'said.treasure': '金色的东西……',

  'creel.title': '钓到了什么',
  'creel.empty': '这回只有水草',
  'creel.roach': { other: '{n}条拟鲤' },
  'creel.crucian': { other: '{n}条鲫鱼' },
  'creel.carp': { other: '{n}条鲤鱼' },
  'creel.catfish': { other: '{n}条鲶鱼' },
  'creel.boot': { other: '{n}只旧靴子' },
  'creel.shoe': { other: '{n}只遗失的鞋' },
  'creel.treasure': { other: '{n}件金色的东西' },

  'done.title': '整个世界都涂好颜色了！',
  'done.sub': '你用{time}找齐了所有颜料罐。留下来继续玩吧，想待多久都可以。',
  'done.again': '再玩一次',
  'done.open': '再读一遍那张字条',
  'done.tuck': '把字条收起来',

  'prompt.sit': '坐一会儿',
  'prompt.sitBench': '在长椅上坐坐',
  'prompt.lieHay': '躺进干草堆',
  'prompt.standUp': '站起来',
  'note.satDown': '歇一会儿，看看天空吧',
  'note.stoodUp': '你伸了个懒腰，回到林间',
  'note.satBench': '你坐下来，静静地欣赏山谷',
  'note.leftBench': '又可以沿着小路去散步了',
  'note.lainHay': '干草软软的，带着晒过太阳的香味',
  'note.leftHay': '你起身，从领口里挑出草秆',
  'note.elephant': '抬头看，一朵云变成了大象的模样',
  'prompt.look.well': '往井里看',
  'prompt.look.scarecrow': '看看稻草人',
  'closer.done': '离开',
  'closer.well.title': '往井里瞧',
  'closer.well.line': '井里又凉又暗。有光照到的地方长着青苔',
  'closer.scarecrow.title': '稻草人的脸',
  'closer.scarecrow.line': '两颗不同的纽扣做眼睛，笑脸缝得有点歪。这是有人亲手做的',
  'note.hedgehog': '一只小刺猬过来陪你了',

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
