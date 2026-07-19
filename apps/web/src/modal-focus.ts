import { nextTick, type Ref } from 'vue';

const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Keeps keyboard focus inside a visible modal without hiding nested controls. */
export function trapModalFocus(
    event: KeyboardEvent,
    container: HTMLElement | undefined,
): void {
    if (event.key !== 'Tab' || !container) {
        return;
    }
    const controls = [
        ...container.querySelectorAll<HTMLElement>(focusableSelector),
    ].filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
    }
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

/** Focuses a stable modal control after Vue has rendered the dialog. */
export async function focusModalControl(
    control: Ref<HTMLElement | undefined>,
): Promise<void> {
    await nextTick();
    control.value?.focus();
}
