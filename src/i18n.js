/** Local English/Russian presentation layer. Game template field values are never translated. */
export const LANGUAGE_KEY='h3tc-language';
export const initialLanguage=(stored,locale='en')=>['ru','en'].includes(stored)?stored:/^ru(?:[-_]|$)/i.test(locale)?'ru':'en';
const TRANSLATIONS={
 'карт ·':'maps ·','замечаний ·':'issues ·','сообщений парсера.':'parser warnings.',
 'Название':'Name','Минимальный размер':'Minimum size','Максимальный размер':'Maximum size',
 'Пакет SoD':'SoD pack','Метаданные пакета':'Pack metadata','Выбор городов':'Town selection',
 'Герои':'Heroes','Зеркальность':'Mirror','Теги':'Tags','Макс. раундов боя':'Max battle rounds',
 'Запрет найма героев':'Forbid hiring heroes','Счётчики полей':'Field counts','Типы зон':'Zone types',
 'Поля пакета':'Pack fields','Поля карты':'Map fields','Поля зоны':'Zone fields','Поля связей':'Connection fields',
 'Поддерживается запись координат в image_settings.':'Coordinates can be saved to image_settings.',
 'Позиции схемы сохраняются в браузере и доступны для экспорта в JSON.':'Diagram positions are saved in the browser and can be exported as JSON.',
 'У SoD нет метаданных пакета. Здесь можно редактировать настройки каждой карты или конвертировать пакет в HotA.':'SoD has no pack metadata. Edit each map individually or convert the pack to HotA.',
 'Положение зоны изменено':'Zone position changed',
 'ВСТРОЕННЫЕ ШАБЛОНЫ':'BUILT-IN TEMPLATES','Встроенные шаблоны':'Built-in templates',
 'Выберите встроенный шаблон…':'Select a built-in template…','Шаблон не выбран':'No template selected',
 'Выберите встроенный шаблон, откройте файл или создайте новый пакет.':'Choose a built-in template, open a file, or create a new pack.',
 'Открыть':'Open','Сохранить':'Save','Конвертировать':'Convert','Установить':'Install',
 'ТЕКУЩИЙ ПАКЕТ':'CURRENT PACK','Загрузите шаблон':'Load a template','Карты':'Maps',
 'Поиск карты...':'Search maps...','Настройки пакета':'Pack settings','Проверить шаблон':'Validate template',
 'Новый пакет':'New pack','Основано на':'Based on','ВИЗУАЛЬНЫЙ РЕДАКТОР':'VISUAL EDITOR',
 'Карта не выбрана':'No map selected','Зона':'Zone','Связь':'Connection','СВОЙСТВА':'PROPERTIES',
 'Выберите объект':'Select an item','Нажмите на зону, связь или карту':'Select a zone, connection or map',
 'Редактируйте на схеме':'Edit on the canvas',
 'Выберите зону или связь, чтобы настроить параметры шаблона.':'Select a zone or connection to edit template parameters.',
 'Автоматическая расстановка':'Auto layout','Раздвинуть зоны':'Spread zones','Сблизить зоны':'Bring zones closer',
 'Перенумеровать · Игроки первыми':'Renumber · Players first','Перенумеровать · Центр первым':'Renumber · Center first',
 'Перенумеровать · По порядку':'Renumber · In order','Дублировать шаблон':'Duplicate template','Удалить шаблон':'Delete template',
 'Экспорт графа в PNG':'Export graph to PNG',
 'Сохранить позиции всех карт (.h3tc-layout.json)':'Export positions of all maps (.h3tc-layout.json)',
 'Загрузить позиции (.h3tc-layout.json)':'Import positions (.h3tc-layout.json)',
 'Игрок':'Player','Сокровища':'Treasure','Нейтральная':'Neutral',
 'Перетащите шаблон сюда':'Drop a template here','Поддерживаются .h3t и .txt':'Supports .h3t and .txt',
 'Нет зон для отображения':'No zones to display','Добавьте первую зону или откройте шаблон.':'Add a zone or open a template.',
 'Добавить зону':'Add zone','Колёсико — масштаб · Перетаскивание фона — перемещение · Alt + перетаскивание зоны — связь':'Wheel — zoom · Drag canvas — pan · Alt + drag a zone — connect',
 'Все операции выполняются локально в браузере':'All operations run locally in your browser',
 'Открыть файл · Ctrl+O':'Open file · Ctrl+O','Сохранить файл · Ctrl+S':'Save file · Ctrl+S',
 'Формат экспорта':'Export format','Конвертировать в выбранный формат':'Convert to selected format',
 'Установить как приложение':'Install as an app','Установить приложение':'Install app',
 'Переключить светлую/тёмную тему':'Toggle light/dark theme','Переключить тему':'Toggle theme',
 'Инструкция и горячие клавиши':'Help and keyboard shortcuts','Справка':'Help',
 'Список карт':'Map list','Добавить карту':'Add map','Отменить · Ctrl+Z':'Undo · Ctrl+Z','Повторить · Ctrl+Y':'Redo · Ctrl+Y',
 'Инструменты':'Tools','Интерактивная схема зон и связей':'Interactive zone and connection graph',
 'Уменьшить':'Zoom out','Увеличить':'Zoom in','Вместить все зоны':'Fit all zones',
 'Закрыть панель свойств':'Close properties panel','Закрыть':'Close','Добавить':'Add',
 'Новый шаблон':'New template','Формат нового пакета':'New pack format',
 'Несохранённые изменения текущего пакета будут потеряны.':'Unsaved changes to the current pack will be lost.',
 'Отмена':'Cancel','Создать':'Create','Подтвердить':'Confirm','Дублировать':'Duplicate',
 'Удалить':'Delete','Удалить связь':'Delete connection','Подтверждение удаления':'Confirm deletion','Удаление шаблона':'Delete template',
 'Основное':'General','Города':'Towns','Содержимое':'Content','Ландшафт':'Terrain','Монстры':'Monsters',
 'Пакет':'Pack','Карта':'Map','Параметры пакета':'Pack properties','Параметры карты':'Map properties',
 'Параметры':'Parameters','Ограничения':'Restrictions','Статистика':'Statistics',
 'Тип зоны':'Zone type','Начальная зона игрока':'Player start zone','Стартовая зона компьютера':'Computer start zone',
 'Зона сокровищ':'Treasure zone','Перекрёсток':'Junction','Идентификатор и размер':'Identifier and size',
 'ID зоны':'Zone ID','Базовый размер':'Base size','Ограничения на размещение':'Placement restrictions',
 'Принадлежность':'Ownership','Игрок / владелец':'Player / owner',
 'Города игрока':'Player towns','Нейтральные города':'Neutral towns','Мин. городов':'Min. towns',
 'Мин. замков':'Min. castles','Плотность городов':'Town density','Плотность замков':'Castle density',
 'Разрешённые фракции':'Allowed factions','Города одного типа':'Towns of same type',
 'Сокровища':'Treasure','Минимум шахт':'Minimum mines','Плотность шахт':'Mine density',
 'Минимум':'Minimum','Максимум':'Maximum','Плотность':'Density',
 'Ландшафты':'Terrains','Как у города':'Match town','Охрана':'Guards','Сила':'Strength',
 'Пусто':'Empty','Без монстров':'No monsters','Слабые':'Weak','Средние (avg)':'Average (avg)',
 'Средние (average)':'Average','Сильные':'Strong',
 'Дополнительные настройки HotA':'Additional HotA settings',
 'Координаты для редактора HotA. Перемещение по схеме будет записано при сохранении.':'HotA editor coordinates. Moving a zone will update these when the file is saved.',
 'Дополнительные поля HotA':'Additional HotA fields','Дорога':'Road','Тип':'Type','Фиктивная':'Fictive',
 'Отталкивание портала':'Portal repulsion','Между зонами':'Between zones','Зона 1':'Zone 1','Зона 2':'Zone 2',
 'Ценность прохода':'Guard value','Широкая':'Wide','Пограничная охрана':'Border guard',
 'Минимум игроков':'Min. human players','Максимум игроков':'Max. human players',
 'Минимум позиций':'Min. total players','Максимум позиций':'Max. total players',
 'Дополнительные параметры карты':'Additional map options',
 'Артефакты':'Artifacts','Сборные артефакты':'Combination artifacts','Заклинания':'Spells',
 'Вторичные навыки':'Secondary skills','Объекты':'Objects','Горные преграды':'Rock blocks',
 'Разреженность зон':'Zone sparseness','Отключить особые недели':'Disable special weeks',
 'Исследование заклинаний':'Spell research','Анархия':'Anarchy','Имя':'Name','Описание':'Description',
 'Сообщения исходного файла':'Source file warnings',
 'Карты не найдены.':'No maps found.','Без названия':'Untitled','Новый пакет':'New pack',
 'Свойства выбранной зоны':'Selected zone properties','Свойства соединения':'Connection properties',
 'Проверка шаблона':'Template validation','Семантических проблем не обнаружено.':'No semantic problems found.',
 'Проверка не изменяет шаблон автоматически.':'Validation never modifies the template.',
 'Ошибка открытия':'Open failed','Поддерживаются текстовые шаблоны SoD, HotA 1.7.x и HotA 1.8.x.':'Text templates SoD, HotA 1.7.x and HotA 1.8.x are supported.',
 'Ошибка проверки':'Validation error','Найдены проблемы, которые необходимо проверить:':'Review the following problems:',
 'Сохранить как есть':'Save anyway','Предупреждение о кодировке':'Encoding warning',
 'Внимание: потеря данных':'Warning: data loss','Целевой формат не поддерживает некоторые поля:':'The target format does not support some fields:',
 'Исходный файл останется неизменным.':'The source file will remain unchanged.',
 'Всё равно конвертировать':'Convert anyway','Позиции загружены':'Positions imported',
 'Справка · H3 Template Studio':'Help · H3 Template Studio','Файлы':'Files','Полотно':'Canvas',
 'Горячие клавиши':'Keyboard shortcuts','Установка':'Installation','Установка приложения':'Install application',
 'Приложение устанавливается.':'App installation is in progress.',
 'Приложение уже открыто в установленном режиме.':'This app is already running in installed mode.',
 'Приложение установлено.':'App installed.',
 'Установка доступна через меню браузера при открытии сайта по HTTPS (например, на GitHub Pages).':'Install this app from your browser menu when opened over HTTPS (for example on GitHub Pages).',
 'После первого открытия сайт может работать без интернета; для больших шаблонов откройте локальные файлы после установки.':'After the first load, the site can work offline. Open large templates from local files after installing.',
 'Редактор работает локально:':'The editor works locally:','ваши шаблоны остаются в браузере и скачиваются на компьютер.':'your templates stay in the browser and are saved to your computer.',
 'На iPhone/iPad: Share → Add to Home Screen.':'On iPhone/iPad: Share → Add to Home Screen.',
 'Изменено':'Modified','Сохранено':'Saved','Сохранена':'Saved',
 'Отменено':'Undone','Повторено':'Redone','Загружен':'Loaded','Экспортировано':'Exported',
 'Создана карта':'Map created','Зона дублирована':'Zone duplicated','Добавлена зона':'Zone added',
 'Добавлена связь':'Connection added','Создана связь':'Connection created',
 'Удалена зона':'Zone deleted','Удалена связь':'Connection deleted',
 'Удалена карта':'Map deleted','Изменён ID зоны':'Zone ID changed',
 'Раздвинуты зоны':'Zones spread','Сближены зоны':'Zones brought closer','Расстановка зон':'Layout generated',
 'Перенумерованы зоны':'Zones renumbered',
 'Для связи нужны минимум две зоны.':'At least two zones are needed to create a connection.',
 'Выберите вторую зону':'Select the second zone',
 'Добавление связи отменено.':'Connection creation canceled.',
 'Перетащите на другую зону для создания связи.':'Drag to a different zone to create a connection.',
 'Нажмите на первую зону, затем на вторую. Или Alt + перетащите между ними.':'Click the first zone, then the second; or Alt + drag between them.',
 'ID зоны не должен быть пустым.':'Zone ID cannot be empty.',
 'Такой ID зоны уже существует.':'That zone ID already exists.',
 'В пакете должна оставаться хотя бы одна карта.':'The pack must contain at least one map.',
 'Проверка подсказок зон':'Zone hint validation',
 'Некоторые HotA-подсказки не изменены из-за неизвестного синтаксиса или ссылок:':'Some HotA hints were not updated because their syntax or references are unknown:',
 'Минимум шахт':'Minimum mines','Плотность шахт':'Mine density',
};
const PATTERNS=[
 [/^([✓●]) (Сохранено|Изменено)$/, (mark,word)=>mark+' '+translateText(word)],
 [/^(\d+) карт ·$/,n=>`${n} maps ·`],
 [/^(\d+) замечаний ·$/,n=>`${n} issues ·`],
 [/^(\d+) сообщений парсера\.$/,n=>`${n} parser warnings.`],
 [/^(\d+) карт$/,n=>`${n} maps`],[/^(\d+) зон$/,n=>`${n} zones`],[/^(\d+) связей$/,n=>`${n} connections`],
 [/^(\d+) зон · (\d+) связей$/, (a,b)=>`${a} zones · ${b} connections`],
 [/^Зона #(.*)$/,id=>`Zone #${id}`],[/^Связь (.*) ↔ (.*)$/, (a,b)=>`Connection ${a} ↔ ${b}`],
 [/^УРОВЕНЬ (\d+)$/,n=>`TIER ${n}`],
 [/^Открыт (.*) · (\d+) карт · (\d+) зон$/, (name,maps,zones)=>`Opened ${name} · ${maps} maps · ${zones} zones`],
 [/^Загружен: (.*)$/,name=>`Loaded: ${name}`],
 [/^Сохранено: (.*)$/,name=>`Saved: ${name}`],
 [/^Экспортировано: (.*)$/,name=>`Exported: ${name}`],
 [/^Отменено: (.*)$/,name=>`Undone: ${translateText(name)}`],
 [/^Повторено: (.*)$/,name=>`Redone: ${translateText(name)}`],
 [/^Изменено: (.*)$/,name=>`Changed: ${name}`],
 [/^Позиции восстановлены: (\d+) карт$/,n=>`Positions restored: ${n} maps`],
 [/^Удалить шаблон (.*)\?$/,name=>`Delete template ${name}?`],
 [/^Удалить (.*)\? Это действие можно отменить\.$/,name=>`Delete ${translateText(name)}? This can be undone.`],
 [/^зону (.*)$/,id=>`zone ${id}`],
 [/^Ещё (\d+) замечаний\.\.\.$/,n=>`${n} more issues...`],
 [/^Сообщения исходного файла \((\d+)\)$/,n=>`Source file warnings (${n})`],
 [/^(.+) карт · (.+) замечаний · (.+) сообщений парсера\.$/,(a,b,c)=>`${a} maps · ${b} issues · ${c} parser warnings.`],
 ];
export function translateText(text){
  const source=String(text??''),matched=source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const [,before,body,after]=matched;
  if(!/[А-Яа-яЁё]/.test(body))return source;
  let result=TRANSLATIONS[body];
  if(result===undefined){for(const [rx,formatter] of PATTERNS){const match=body.match(rx);if(match){result=formatter(...match.slice(1));break;}}}
  return result===undefined?source:before+result+after;
}
const nodeSources=new WeakMap(),attributeSources=new WeakMap();
let currentLanguage='en';
function translateNode(node){
  if(!node||!node.parentElement||node.parentElement.closest('script,style,noscript'))return;
  const prior=nodeSources.get(node),actual=node.nodeValue;
  const source=prior&&actual===prior.rendered?prior.source:actual;
  const rendered=currentLanguage==='ru'?source:translateText(source);
  nodeSources.set(node,{source,rendered});
  if(actual!==rendered)node.nodeValue=rendered;
}
const TRANSLATABLE_ATTRS=['title','aria-label','placeholder'];
function translateAttributes(el){
  if(!el||!el.getAttribute)return;
  const prev=attributeSources.get(el)||{};
  for(const attribute of TRANSLATABLE_ATTRS){
    const actual=el.getAttribute(attribute);if(actual==null)continue;
    const previous=prev[attribute];const source=previous&&actual===previous.rendered?previous.source:actual;
    const rendered=currentLanguage==='ru'?source:translateText(source);
    prev[attribute]={source,rendered};if(rendered!==actual)el.setAttribute(attribute,rendered);
  }
  attributeSources.set(el,prev);
}
export function translateTree(root=document.body){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){translateNode(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
  if(root.nodeType===Node.ELEMENT_NODE)translateAttributes(root);
  if(root.querySelectorAll)for(const el of root.querySelectorAll('[title],[aria-label],[placeholder]'))translateAttributes(el);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())translateNode(walker.currentNode);
}
export function setLanguage(lang){
  currentLanguage=lang==='ru'?'ru':'en';
  document.documentElement.lang=currentLanguage;
  const select=document.getElementById('language-select');if(select)select.value=currentLanguage;
  try{localStorage.setItem(LANGUAGE_KEY,currentLanguage);}catch{}
  translateTree();
  return currentLanguage;
}
export function getLanguage(){return currentLanguage;}
export function initializeLanguage(){
  let stored=null;try{stored=localStorage.getItem(LANGUAGE_KEY);}catch{}
  const lang=initialLanguage(stored,navigator.language||'en');setLanguage(lang);
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==='characterData')translateNode(mutation.target);
      else if(mutation.type==='attributes')translateAttributes(mutation.target);
      else for(const child of mutation.addedNodes)translateTree(child);
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:TRANSLATABLE_ATTRS});
  return lang;
}
