import { getLanguage, translateText } from '../i18n.js';
const $ = id => document.getElementById(id);
export function createTemplatePicker({ onSelect }) {
    const root = $('template-picker');
    const trigger = $('built-in-trigger');
    const triggerLabel = $('built-in-trigger-label');
    const menu = $('built-in-menu');
    const nativeSelect = $('built-in-select');
    let currentValue = '';
    let entries = [];
    function placeholder() {
        return translateText('Select a built-in template…');
    }
    function selectedEntry() {
        return entries.find(entry => entry.id === currentValue) ?? null;
    }
    function updateTrigger() {
        triggerLabel.textContent = selectedEntry()?.name ?? placeholder();
        trigger.setAttribute('aria-expanded', String(!menu.hidden));
        trigger.setAttribute('aria-label', translateText('Built-in templates'));
    }
    function renderMenu() {
        menu.replaceChildren();
        for (const entry of entries) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'template-picker-option';
            option.dataset.value = entry.id;
            option.dataset.file = entry.file;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(entry.id === currentValue));
            option.textContent = entry.name;
            menu.append(option);
        }
    }
    function setOpen(open) {
        menu.hidden = !open;
        root.classList.toggle('open', open);
        updateTrigger();
        if (open) {
            const selected = menu.querySelector('[aria-selected="true"]');
            requestAnimationFrame(() => selected?.scrollIntoView({ block: 'nearest' }));
        }
    }
    function close() {
        setOpen(false);
    }
    function setDisabled(disabled) {
        trigger.disabled = Boolean(disabled);
        nativeSelect.disabled = Boolean(disabled);
        if (disabled) {
            close();
        }
    }
    function setItems(nextEntries) {
        entries = [...nextEntries];
        nativeSelect.replaceChildren(new Option(placeholder(), ''));
        for (const entry of entries) {
            const option = new Option(entry.name, entry.id);
            option.dataset.file = entry.file;
            nativeSelect.add(option);
        }
        renderMenu();
        updateTrigger();
    }
    function setValue(value) {
        currentValue = String(value ?? '');
        nativeSelect.value = currentValue;
        for (const option of menu.querySelectorAll('[role="option"]')) {
            option.setAttribute('aria-selected', String(option.dataset.value === currentValue));
        }
        updateTrigger();
    }
    function refreshLanguage() {
        if (nativeSelect.options[0]) {
            nativeSelect.options[0].text = placeholder();
        }
        updateTrigger();
    }
    trigger.addEventListener('click', () => {
        if (!trigger.disabled) {
            setOpen(menu.hidden);
        }
    });

    // Keep the native select synchronized for automated tests and assistive tooling.
    // The visible control is the custom list, so wheel scrolling never closes it.
    nativeSelect.addEventListener('change', () => {
        const value = nativeSelect.value;
        setValue(value);
        onSelect?.(value);
    });
    menu.addEventListener('click', event => {
        const option = event.target.closest('[data-value]');
        if (!option) {
            return;
        }
        const value = option.dataset.value;
        close();
        onSelect?.(value);
    });
    // Native <select> popups close when the wheel moves on several browsers.
    // The custom list deliberately owns wheel scrolling so it stays open.
    menu.addEventListener('wheel', event => {
        event.stopPropagation();
    }, { passive: true });
    document.addEventListener('pointerdown', event => {
        if (!menu.hidden && !event.target.closest('#template-picker')) {
            close();
        }
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) {
            close();
            trigger.focus();
        }
    });
    return {
        close,
        setDisabled,
        setItems,
        setValue,
        refreshLanguage,
        get value() {
            return currentValue;
        },
        get entry() {
            return selectedEntry();
        },
        get entries() {
            return [...entries];
        }
    };
}
