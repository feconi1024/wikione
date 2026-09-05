import { computed, onBeforeUnmount, ref, watch } from 'vue';

type Appearance = 'system' | 'light' | 'dark';
const storageKey = 'wikione.appearance';

/** Keep the shell and editor in sync without storing any document content. */
export function useAppearance() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const systemDark = ref(media.matches);
    const preference = ref<Appearance>('system');
    try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved === 'light' || saved === 'dark') {
            preference.value = saved;
        }
    } catch {
        // Appearance still works when browser storage is unavailable.
    }
    const theme = computed(() =>
        preference.value === 'system'
            ? systemDark.value
                ? 'dark'
                : 'light'
            : preference.value,
    );
    const updateSystem = (event: MediaQueryListEvent) => {
        systemDark.value = event.matches;
    };
    media.addEventListener('change', updateSystem);
    onBeforeUnmount(() => media.removeEventListener('change', updateSystem));
    watch(
        theme,
        (value) => {
            document.documentElement.dataset.theme = value;
        },
        { immediate: true },
    );
    watch(preference, (value) => {
        try {
            window.localStorage.setItem(storageKey, value);
        } catch {
            // Retain the current session's selection even without storage.
        }
    });
    return { preference };
}
