/**
 * English/Russian presentation layer.
 *
 * All localized text lives in /locales/*.json. This module only contains the
 * lookup, formatting and DOM-update logic. Game template field values are
 * never translated.
 */
export const LANGUAGE_KEY = 'h3tc-language';
export const initialLanguage = (stored, locale = 'en') => {
    if (['ru', 'en'].includes(stored)) {
        return stored;
    }
    return /^ru(?:[-_]|$)/i.test(locale) ? 'ru' : 'en';
};
const LOCALE_URLS = {
    en: new URL('../locales/en.json', import.meta.url),
    ru: new URL('../locales/ru.json', import.meta.url)
};
async function loadLocale(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Cannot load locale ${url}: HTTP ${response.status}`);
    }
    return response.json();
}
const [english, russian] = await Promise.all([
    loadLocale(LOCALE_URLS.en),
    loadLocale(LOCALE_URLS.ru)
]);
const dictionaries = {
    en: english,
    ru: russian
};
let currentLanguage = 'en';
const nodeSources = new WeakMap();
const attributeSources = new WeakMap();
const TRANSLATABLE_ATTRS = ['title', 'aria-label', 'placeholder'];
function formatTemplate(template, values = []) {
    return String(template ?? '').replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''));
}
export function message(key, ...values) {
    const dictionary = dictionaries[currentLanguage] ?? dictionaries.en;
    const template = dictionary.__patterns?.[key] ?? dictionaries.en.__patterns?.[key] ?? key;
    return formatTemplate(template, values);
}
function patternTranslation(body) {
    let match = body.match(/^([✓●])\s+(Saved|Modified)$/i);
    if (match) {
        return message('saved_state', match[1], translateText(match[2]));
    }

    match = body.match(/^(\d+)\s+templates?$/i);
    if (match) {
        return message('template_count', match[1]);
    }

    match = body.match(/^(\d+)\s+zones?$/i);
    if (match) {
        return message('count_zones', match[1]);
    }

    match = body.match(/^(\d+)\s+connections?$/i);
    if (match) {
        return message('count_connections', match[1]);
    }

    match = body.match(/^(\d+)\s+zones?\s+·\s+(\d+)\s+connections?$/i);
    if (match) {
        return message('zones_connections', match[1], match[2]);
    }

    match = body.match(/^Zone\s+#(.+)$/i);
    if (match) {
        return message('zone_number', match[1]);
    }

    match = body.match(/^Connection\s+(.+)\s+↔\s+(.+)$/i);
    if (match) {
        return message('connection_pair', match[1], match[2]);
    }

    match = body.match(/^TIER\s+(\d+)$/i);
    if (match) {
        return message('tier', match[1]);
    }

    match = body.match(/^Opened\s+(.+)\s+·\s+(\d+)\s+templates?\s+·\s+(\d+)\s+zones?$/i);
    if (match) {
        return message('opened_pack', match[1], match[2], match[3]);
    }

    const prefixes = [
        ['Loaded:', 'loaded'],
        ['Saved:', 'saved'],
        ['Exported:', 'exported'],
        ['Changed:', 'changed']
    ];
    for (const [prefix, key] of prefixes) {
        if (body.startsWith(prefix)) {
            return message(key, body.slice(prefix.length).trim());
        }
    }

    match = body.match(/^Undone:\s*(.+)$/i);
    if (match) {
        return message('undone', translateText(match[1]));
    }

    match = body.match(/^Redone:\s*(.+)$/i);
    if (match) {
        return message('redone', translateText(match[1]));
    }

    match = body.match(/^Positions restored:\s*(\d+)\s+templates?$/i);
    if (match) {
        return message('positions_restored', match[1]);
    }

    match = body.match(/^Positions saved:\s*(\d+)\s+templates?$/i);
    if (match) {
        return message('positions_saved', match[1]);
    }

    match = body.match(/^Delete template\s+(.+)\?$/i);
    if (match) {
        return message('delete_template', match[1]);
    }

    match = body.match(/^More\s+(\d+)\s+issues\.\.\.$/i);
    if (match) {
        return message('more_issues', match[1]);
    }

    match = body.match(/^Source file warnings\s+\((\d+)\)$/i);
    if (match) {
        return message('source_warnings', match[1]);
    }

    return undefined;
}

export function translateText(text) {
    const source = String(text ?? '');
    const matched = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!matched) {
        return source;
    }
    const [, before, body, after] = matched;
    const dictionary = dictionaries[currentLanguage] ?? dictionaries.en;
    const direct = dictionary[body];
    const translated = direct === undefined ? patternTranslation(body) : direct;
    return translated === undefined ? source : before + translated + after;
}
function translateNode(node) {
    if (!node || !node.parentElement || node.parentElement.closest('script,style,noscript')) {
        return;
    }
    const prior = nodeSources.get(node);
    const actual = node.nodeValue;
    const source = prior && actual === prior.rendered ? prior.source : actual;
    const rendered = translateText(source);
    nodeSources.set(node, { source, rendered });
    if (actual !== rendered) {
        node.nodeValue = rendered;
    }
}
function translateAttributes(element) {
    if (!element?.getAttribute) {
        return;
    }
    const previousAttributes = attributeSources.get(element) ?? {};
    for (const attribute of TRANSLATABLE_ATTRS) {
        const actual = element.getAttribute(attribute);
        if (actual == null) {
            continue;
        }
        const previous = previousAttributes[attribute];
        const source = previous && actual === previous.rendered ? previous.source : actual;
        const rendered = translateText(source);
        previousAttributes[attribute] = { source, rendered };
        if (rendered !== actual) {
            element.setAttribute(attribute, rendered);
        }
    }
    attributeSources.set(element, previousAttributes);
}
export function translateTree(root = document.body) {
    if (!root) {
        return;
    }
    if (root.nodeType === Node.TEXT_NODE) {
        translateNode(root);
        return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
        return;
    }
    if (root.nodeType === Node.ELEMENT_NODE) {
        translateAttributes(root);
    }
    if (root.querySelectorAll) {
        for (const element of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
            translateAttributes(element);
        }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        translateNode(walker.currentNode);
    }
}
export function setLanguage(language) {
    currentLanguage = language === 'ru' ? 'ru' : 'en';
    document.documentElement.lang = currentLanguage;
    const select = document.getElementById('language-select');
    if (select) {
        select.value = currentLanguage;
    }
    try {
        localStorage.setItem(LANGUAGE_KEY, currentLanguage);
    }
    catch {
        // Storage may be disabled.
    }
    translateTree();
    return currentLanguage;
}
export function getLanguage() {
    return currentLanguage;
}
export function initializeLanguage() {
    let stored = null;
    try {
        stored = localStorage.getItem(LANGUAGE_KEY);
    }
    catch {
        // Storage may be disabled.
    }
    const language = initialLanguage(stored, navigator.language || 'en');
    setLanguage(language);
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                translateNode(mutation.target);
            }
            else if (mutation.type === 'attributes') {
                translateAttributes(mutation.target);
            }
            else {
                for (const child of mutation.addedNodes) {
                    translateTree(child);
                }
            }
        }
    });
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRS
    });
    return language;
}
