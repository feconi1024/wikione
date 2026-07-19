<script setup lang="ts">
import type {
    BaseRevision,
    PageSource,
    PreviewRequest,
    PreviewWarning,
    WikiDescriptor,
} from '@wikione/contracts';
import {
    createDraftKey,
    PreviewCoordinator,
    type PreviewStatus,
} from '@wikione/editor-core';
import {
    analyzeWikitext,
    type WikitextAnalysis,
    type WikitextCommand,
} from '@wikione/wikitext-editor';
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch,
} from 'vue';

import { WikiOneApiClient } from './api.js';
import EditorToolbar from './components/EditorToolbar.vue';
import WikitextEditor from './components/WikitextEditor.vue';
import { IndexedDbDraftStore } from './draft-store.js';

interface WikitextEditorHandle {
    readonly applyCommand: (command: WikitextCommand) => void;
    readonly focusAt: (position: number) => void;
}

type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';
type MobilePanel = 'source' | 'preview';

const fallbackWiki: WikiDescriptor = {
    id: 'en-wikipedia',
    displayName: 'English Wikipedia',
    languageCode: 'en',
    direction: 'ltr',
    baseUrl: 'https://en.wikipedia.org',
    apiUrl: 'https://en.wikipedia.org/w/api.php',
};
const starterSource = `== Welcome to WikiOne ==

Write MediaWiki source on the left. Your compiled page appears on the right.

=== Friendly editing tools ===

* Use the toolbar for common markup.
* Press Ctrl-Space for wikitext snippets.
* Select a heading in the outline to jump to it.

Try a '''bold statement''', an [[Earth|internal link]], or a reference.<ref>Example reference for the live preview.</ref>

<references />`;

const api = new WikiOneApiClient();
const draftStore = new IndexedDbDraftStore();
const editor = ref<WikitextEditorHandle>();
const workspace = ref<HTMLElement>();
const wikis = ref<WikiDescriptor[]>([fallbackWiki]);
const wikiId = ref(fallbackWiki.id);
const title = ref('Sandbox');
const source = ref(starterSource);
const baseSource = ref<string>('');
const baseRevision = ref<BaseRevision>();
const previewStatus = ref<PreviewStatus>({ phase: 'idle' });
const previewUrl = ref('');
const previewWarnings = ref<readonly PreviewWarning[]>([]);
const previewGeneratedAt = ref<string>();
const draftStatus = ref<DraftStatus>('idle');
const draftMessage = ref('Drafts stay in this browser.');
const remotePage = ref<PageSource>();
const loadingPage = ref(false);
const pageMessage = ref('');
const appMessage = ref('');
const cursorLine = ref(1);
const cursorColumn = ref(1);
const clientRevision = ref(0);
const splitPercent = ref(50);
const mobilePanel = ref<MobilePanel>('source');
const analysis = shallowRef<WikitextAnalysis>(analyzeWikitext(source.value));
let initialized = false;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let analysisTimer: ReturnType<typeof setTimeout> | undefined;

const coordinator = new PreviewCoordinator(
    (request, signal) => api.compilePreview(request, signal),
    {
        onStatus: (status) => {
            previewStatus.value = status;
        },
        onResult: (result) => {
            previewUrl.value = result.renderUrl;
            previewWarnings.value = result.warnings;
            previewGeneratedAt.value = result.generatedAt;
        },
    },
    { delayMilliseconds: 650 },
);

const selectedWiki = computed(
    () => wikis.value.find((wiki) => wiki.id === wikiId.value) ?? fallbackWiki,
);
const sourceCharacters = computed(() => source.value.length);
const wordCount = computed(
    () => source.value.trim().match(/\S+/gu)?.length ?? 0,
);
const previewStatusLabel = computed(() => {
    switch (previewStatus.value.phase) {
        case 'scheduled':
            return 'Changes queued';
        case 'compiling':
            return 'Compiling…';
        case 'ready':
            return 'Preview current';
        case 'error':
            return 'Preview needs attention';
        default:
            return 'Waiting to compile';
    }
});
const previewStatusTone = computed(() =>
    previewStatus.value.phase === 'error'
        ? 'danger'
        : previewStatus.value.phase === 'ready'
          ? 'success'
          : 'neutral',
);
const draftStatusLabel = computed(() => {
    switch (draftStatus.value) {
        case 'saving':
            return 'Saving locally…';
        case 'saved':
            return 'Saved locally';
        case 'error':
            return 'Local save failed';
        default:
            return 'Local draft';
    }
});

watch([source, title, wikiId], () => {
    if (!initialized) {
        return;
    }
    clientRevision.value += 1;
    scheduleAnalysis();
    schedulePreview();
    scheduleDraftSave();
});

onMounted(async () => {
    await Promise.all([loadWikiRegistry(), restoreInitialDraft()]);
    initialized = true;
    schedulePreview();
});

onBeforeUnmount(() => {
    coordinator.dispose();
    if (draftTimer !== undefined) {
        clearTimeout(draftTimer);
    }
    if (analysisTimer !== undefined) {
        clearTimeout(analysisTimer);
    }
});

async function loadWikiRegistry(): Promise<void> {
    try {
        const result = await api.listWikis();
        if (result.length > 0) {
            wikis.value = result;
        }
    } catch {
        appMessage.value =
            'The API is offline. Editing and local drafts still work; preview will reconnect automatically.';
    }
}

async function restoreInitialDraft(): Promise<void> {
    try {
        const draft = await draftStore.get(wikiId.value, title.value);
        if (!draft) {
            return;
        }
        source.value = draft.source;
        baseSource.value = draft.baseSource ?? '';
        baseRevision.value = draft.baseRevision;
        draftStatus.value = 'saved';
        draftMessage.value = `Restored your local draft from ${formatTime(draft.updatedAt)}.`;
        analysis.value = analyzeWikitext(source.value);
    } catch {
        draftStatus.value = 'error';
        draftMessage.value =
            'This browser did not allow local draft storage. Copy important source before leaving.';
    }
}

function schedulePreview(): void {
    if (!title.value.trim() || !source.value.trim()) {
        coordinator.cancel();
        return;
    }
    const request: PreviewRequest = {
        wikiId: wikiId.value,
        title: title.value.trim(),
        source: source.value,
        contentModel: 'wikitext',
        clientRevision: clientRevision.value,
    };
    coordinator.schedule(request);
}

function retryPreview(): void {
    clientRevision.value += 1;
    schedulePreview();
}

function scheduleAnalysis(): void {
    if (analysisTimer !== undefined) {
        clearTimeout(analysisTimer);
    }
    analysisTimer = setTimeout(() => {
        analysis.value = analyzeWikitext(source.value);
        analysisTimer = undefined;
    }, 180);
}

function scheduleDraftSave(): void {
    if (draftTimer !== undefined) {
        clearTimeout(draftTimer);
    }
    if (!title.value.trim()) {
        draftStatus.value = 'idle';
        return;
    }
    draftStatus.value = 'saving';
    draftTimer = setTimeout(() => {
        draftTimer = undefined;
        void saveDraft();
    }, 800);
}

async function saveDraft(): Promise<void> {
    const cleanTitle = title.value.trim();
    if (!cleanTitle) {
        return;
    }
    try {
        const updatedAt = new Date().toISOString();
        await draftStore.save({
            version: 1,
            key: createDraftKey(wikiId.value, cleanTitle),
            wikiId: wikiId.value,
            title: cleanTitle,
            source: source.value,
            baseSource: baseSource.value,
            ...(baseRevision.value ? { baseRevision: baseRevision.value } : {}),
            updatedAt,
        });
        draftStatus.value = 'saved';
        draftMessage.value = `Saved in this browser at ${formatTime(updatedAt)}.`;
    } catch {
        draftStatus.value = 'error';
        draftMessage.value =
            'Local save failed. Browser storage may be full or unavailable.';
    }
}

async function discardDraft(): Promise<void> {
    if (draftTimer !== undefined) {
        clearTimeout(draftTimer);
        draftTimer = undefined;
    }
    try {
        await draftStore.delete(wikiId.value, title.value);
        draftStatus.value = 'idle';
        draftMessage.value =
            'Saved copy removed. Your current source remains open until you leave.';
    } catch {
        draftStatus.value = 'error';
        draftMessage.value = 'Could not remove the browser draft.';
    }
}

async function loadPage(): Promise<void> {
    const cleanTitle = title.value.trim();
    if (!cleanTitle || loadingPage.value) {
        return;
    }
    loadingPage.value = true;
    pageMessage.value = '';
    remotePage.value = undefined;
    try {
        const page = await api.loadPage(wikiId.value, cleanTitle);
        const draft = await draftStore.get(wikiId.value, page.title);
        baseRevision.value = draft?.baseRevision ?? page.baseRevision;
        baseSource.value = draft?.baseSource ?? page.source;
        if (draft && draft.source !== page.source) {
            source.value = draft.source;
            remotePage.value = page;
            pageMessage.value =
                'A local draft was restored. Choose the wiki version if you want to replace it.';
        } else {
            title.value = page.title;
            source.value = page.source;
            pageMessage.value = page.exists
                ? `Loaded revision ${String(page.baseRevision?.id ?? '')} from ${selectedWiki.value.displayName}.`
                : 'This page does not exist yet. Start writing locally.';
        }
        await nextTick();
        editor.value?.focusAt(0);
    } catch (error) {
        pageMessage.value = safeMessage(error, 'Could not load this page.');
    } finally {
        loadingPage.value = false;
    }
}

async function useWikiVersion(): Promise<void> {
    const page = remotePage.value;
    if (!page) {
        return;
    }
    await draftStore.delete(wikiId.value, page.title).catch(() => undefined);
    title.value = page.title;
    source.value = page.source;
    baseSource.value = page.source;
    baseRevision.value = page.baseRevision;
    remotePage.value = undefined;
    pageMessage.value = `Using the wiki version of ${page.title}.`;
    await nextTick();
    editor.value?.focusAt(0);
}

function keepLocalVersion(): void {
    remotePage.value = undefined;
    pageMessage.value = 'Keeping the local browser draft.';
}

function applyCommand(command: WikitextCommand): void {
    editor.value?.applyCommand(command);
}

function jumpToSection(position: number): void {
    mobilePanel.value = 'source';
    void nextTick(() => editor.value?.focusAt(position));
}

function updateCursor(line: number, column: number): void {
    cursorLine.value = line;
    cursorColumn.value = column;
}

function beginPointerResize(event: PointerEvent): void {
    if (event.button !== 0 || !workspace.value) {
        return;
    }
    event.preventDefault();
    const move = (moveEvent: PointerEvent) => {
        const bounds = workspace.value?.getBoundingClientRect();
        if (!bounds || bounds.width === 0) {
            return;
        }
        splitPercent.value = clamp(
            ((moveEvent.clientX - bounds.left) / bounds.width) * 100,
            25,
            75,
        );
    };
    const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
}

function resizeWithKeyboard(event: KeyboardEvent): void {
    const change = event.shiftKey ? 10 : 3;
    switch (event.key) {
        case 'ArrowLeft':
            splitPercent.value = clamp(splitPercent.value - change, 25, 75);
            break;
        case 'ArrowRight':
            splitPercent.value = clamp(splitPercent.value + change, 25, 75);
            break;
        case 'Home':
            splitPercent.value = 25;
            break;
        case 'End':
            splitPercent.value = 75;
            break;
        default:
            return;
    }
    event.preventDefault();
}

function formatTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
        ? 'an unknown time'
        : new Intl.DateTimeFormat(undefined, {
              hour: '2-digit',
              minute: '2-digit',
          }).format(date);
}

function safeMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim()
        ? error.message.slice(0, 500)
        : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}
</script>

<template>
    <div class="app-shell">
        <header class="topbar">
            <a class="brand" href="/" aria-label="WikiOne editor home">
                <span class="brand-mark" aria-hidden="true">W</span>
                <span class="brand-copy">
                    <strong>WikiOne</strong>
                    <small>MediaWiki workspace</small>
                </span>
            </a>

            <div class="document-controls">
                <label class="field field--wiki">
                    <span>Wiki</span>
                    <select v-model="wikiId" aria-label="Target wiki">
                        <option
                            v-for="wiki in wikis"
                            :key="wiki.id"
                            :value="wiki.id"
                        >
                            {{ wiki.displayName }}
                        </option>
                    </select>
                </label>
                <label class="field field--title">
                    <span>Page</span>
                    <input
                        v-model="title"
                        type="text"
                        maxlength="512"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="Article title"
                        @keydown.enter="loadPage"
                    />
                </label>
                <button
                    class="button button--primary"
                    type="button"
                    :disabled="loadingPage || !title.trim()"
                    @click="loadPage"
                >
                    {{ loadingPage ? 'Loading…' : 'Load page' }}
                </button>
            </div>

            <button
                class="button auth-placeholder"
                type="button"
                disabled
                title="Sign-in will be enabled after Wikimedia OAuth registration"
            >
                Sign in unavailable
            </button>
        </header>

        <div
            v-if="appMessage || pageMessage"
            class="notice-strip"
            role="status"
        >
            <span>{{ pageMessage || appMessage }}</span>
            <span v-if="remotePage" class="notice-actions">
                <button type="button" @click="keepLocalVersion">
                    Keep local draft
                </button>
                <button type="button" @click="useWikiVersion">
                    Use wiki version
                </button>
            </span>
        </div>

        <nav class="mobile-tabs" aria-label="Editor view">
            <button
                type="button"
                :aria-pressed="mobilePanel === 'source'"
                @click="mobilePanel = 'source'"
            >
                Source
            </button>
            <button
                type="button"
                :aria-pressed="mobilePanel === 'preview'"
                @click="mobilePanel = 'preview'"
            >
                Preview
            </button>
        </nav>

        <main
            ref="workspace"
            class="workspace"
            :class="`workspace--mobile-${mobilePanel}`"
            :style="{ '--source-size': `${splitPercent}%` }"
        >
            <section class="pane source-pane" aria-labelledby="source-title">
                <div class="pane-header">
                    <div>
                        <span class="eyebrow">Source</span>
                        <h1 id="source-title">
                            {{ title || 'Untitled page' }}
                        </h1>
                    </div>
                    <div class="header-status">
                        <span
                            class="status-dot"
                            :class="`status-dot--${draftStatus}`"
                            aria-hidden="true"
                        ></span>
                        <span>{{ draftStatusLabel }}</span>
                    </div>
                </div>

                <EditorToolbar @command="applyCommand" />

                <div class="source-workspace">
                    <aside class="outline" aria-label="Page outline">
                        <div class="outline-heading">
                            <span>Outline</span>
                            <span>{{ analysis.sections.length }}</span>
                        </div>
                        <button
                            v-for="section in analysis.sections"
                            :key="`${section.from}-${section.title}`"
                            type="button"
                            :style="{
                                '--outline-depth': String(
                                    Math.max(0, section.level - 2),
                                ),
                            }"
                            @click="jumpToSection(section.from)"
                        >
                            {{ section.title }}
                        </button>
                        <p v-if="analysis.sections.length === 0">
                            Add a heading such as <code>== History ==</code> to
                            build an outline.
                        </p>
                    </aside>

                    <div class="editor-frame">
                        <WikitextEditor
                            ref="editor"
                            v-model="source"
                            @cursor="updateCursor"
                        />
                    </div>
                </div>

                <div class="pane-statusbar">
                    <span>Ln {{ cursorLine }}, Col {{ cursorColumn }}</span>
                    <span>{{ sourceCharacters.toLocaleString() }} chars</span>
                    <span>{{ wordCount.toLocaleString() }} words</span>
                    <span
                        :class="{
                            'text-danger': analysis.diagnostics.length > 0,
                        }"
                    >
                        {{ analysis.diagnostics.length }} source
                        {{
                            analysis.diagnostics.length === 1
                                ? 'issue'
                                : 'issues'
                        }}
                    </span>
                    <button type="button" @click="discardDraft">
                        Discard saved copy
                    </button>
                </div>
            </section>

            <div
                class="pane-separator"
                role="separator"
                aria-label="Resize source and preview panes"
                aria-orientation="vertical"
                :aria-valuenow="Math.round(splitPercent)"
                aria-valuemin="25"
                aria-valuemax="75"
                tabindex="0"
                @pointerdown="beginPointerResize"
                @keydown="resizeWithKeyboard"
            >
                <span aria-hidden="true"></span>
            </div>

            <section class="pane preview-pane" aria-labelledby="preview-title">
                <div class="pane-header">
                    <div>
                        <span class="eyebrow">Compiled page</span>
                        <h2 id="preview-title">
                            {{ selectedWiki.displayName }} preview
                        </h2>
                    </div>
                    <div class="preview-actions">
                        <span
                            class="status-pill"
                            :class="`status-pill--${previewStatusTone}`"
                        >
                            {{ previewStatusLabel }}
                        </span>
                        <button
                            class="icon-button"
                            type="button"
                            aria-label="Compile preview again"
                            title="Compile preview again"
                            @click="retryPreview"
                        >
                            ↻
                        </button>
                    </div>
                </div>

                <details v-if="previewWarnings.length > 0" class="warnings">
                    <summary>
                        {{ previewWarnings.length }} parser
                        {{
                            previewWarnings.length === 1
                                ? 'warning'
                                : 'warnings'
                        }}
                    </summary>
                    <ul>
                        <li
                            v-for="(warning, index) in previewWarnings"
                            :key="`${warning.code ?? 'warning'}-${String(index)}`"
                        >
                            {{ warning.message }}
                        </li>
                    </ul>
                </details>

                <div class="preview-surface">
                    <iframe
                        v-if="previewUrl"
                        :src="previewUrl"
                        :title="`Compiled preview of ${title || 'untitled page'}`"
                        sandbox="allow-scripts allow-same-origin"
                        referrerpolicy="no-referrer"
                    ></iframe>
                    <div v-else class="preview-empty">
                        <span class="preview-glyph" aria-hidden="true">W</span>
                        <h3>Your compiled page will appear here</h3>
                        <p>
                            Start the API and preview services, then edit the
                            source. WikiOne keeps your last successful preview
                            visible if a later compilation fails.
                        </p>
                        <button type="button" @click="retryPreview">
                            Try compiling
                        </button>
                    </div>
                    <div
                        v-if="previewStatus.phase === 'compiling' && previewUrl"
                        class="preview-progress"
                        aria-hidden="true"
                    ></div>
                </div>

                <div class="pane-statusbar pane-statusbar--preview">
                    <span>{{
                        previewStatus.message ?? previewStatusLabel
                    }}</span>
                    <span v-if="previewGeneratedAt">
                        Compiled {{ formatTime(previewGeneratedAt) }}
                    </span>
                </div>
            </section>
        </main>

        <footer class="privacy-bar">
            <span>{{ draftMessage }}</span>
            <span>
                Preview source is sent to {{ selectedWiki.displayName }} for
                parsing. Authentication and publishing are not enabled yet.
            </span>
        </footer>

        <div class="visually-hidden" aria-live="polite">
            {{ previewStatusLabel }}. {{ draftStatusLabel }}.
        </div>
    </div>
</template>
