<script setup lang="ts">
import type {
    BaseRevision,
    PageSource,
    PreviewRequest,
    PreviewWarning,
    SessionStatus,
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

import { useAppearance } from './appearance.js';
import { WikiOneApiClient } from './api.js';
import AccountPage from './components/AccountPage.vue';
import AuthDialog from './components/AuthDialog.vue';
import ConnectedAppsPage from './components/ConnectedAppsPage.vue';
import EditorToolbar from './components/EditorToolbar.vue';
import PrivacyPage from './components/PrivacyPage.vue';
import PublishReviewDialog from './components/PublishReviewDialog.vue';
import WikitextEditor from './components/WikitextEditor.vue';
import { IndexedDbDraftStore } from './draft-store.js';

interface WikitextEditorHandle {
    readonly applyCommand: (command: WikitextCommand) => void;
    readonly focusAt: (position: number) => void;
}

type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';
type MobilePanel = 'source' | 'preview';
type AppRoute = 'editor' | 'account' | 'connected-apps' | 'privacy';

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

const { preference: appearance } = useAppearance();
const api = new WikiOneApiClient();
const draftStore = new IndexedDbDraftStore();
const editor = ref<WikitextEditorHandle>();
const workspace = ref<HTMLElement>();
const wikis = ref<WikiDescriptor[]>([fallbackWiki]);
const wikiId = ref(fallbackWiki.id);
const title = ref('Sandbox');
// Loading controls describe a pending destination, not the open document.
// Typing a page name must never retarget the active draft's autosave key.
const requestedTitle = ref(title.value);
const requestedWikiId = ref(wikiId.value);
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
const session = ref<SessionStatus>({
    authenticated: false,
    wikimedia: {
        connected: false,
        reason: 'oauth-registration-pending',
        message: 'Wikimedia OAuth approval is pending.',
    },
});
const route = ref<AppRoute>(routeFromPath(window.location.pathname));
const authOpen = ref(false);
const reviewOpen = ref(false);
const accountMenuOpen = ref(false);
const reviewButton = ref<HTMLButtonElement>();
const identityButton = ref<HTMLButtonElement>();
let authReturnTarget: HTMLElement | undefined;
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
    window.addEventListener('popstate', syncRoute);
    await Promise.all([
        loadWikiRegistry(),
        restoreInitialDraft(),
        loadSession(),
    ]);
    initialized = true;
    schedulePreview();
});

onBeforeUnmount(() => {
    window.removeEventListener('popstate', syncRoute);
    coordinator.dispose();
    if (draftTimer !== undefined) {
        clearTimeout(draftTimer);
    }
    if (analysisTimer !== undefined) {
        clearTimeout(analysisTimer);
    }
});

async function loadSession(): Promise<void> {
    try {
        session.value = await api.getSession();
    } catch {
        appMessage.value =
            'Account status could not be loaded. Editing and local drafts still work.';
    }
}

function updateSession(value: SessionStatus): void {
    session.value = value;
}

async function refreshAccountSession(): Promise<void> {
    if (!session.value.authenticated) {
        return;
    }
    try {
        const result = await api.refresh(session.value.csrfToken);
        session.value = result.session;
        accountMenuOpen.value = false;
        appMessage.value = 'WikiOne session refreshed.';
    } catch (error: unknown) {
        session.value = {
            authenticated: false,
            wikimedia: session.value.wikimedia,
        };
        appMessage.value = safeMessage(error, 'Your WikiOne session expired.');
    }
}

async function signOut(): Promise<void> {
    if (!session.value.authenticated) {
        return;
    }
    try {
        await api.logout(session.value.csrfToken);
    } catch {
        // Clearing local identity is still safe if the session already expired.
    }
    session.value = {
        authenticated: false,
        wikimedia: session.value.wikimedia,
    };
    accountMenuOpen.value = false;
    navigate('/');
}

function navigate(path: string): void {
    const nextRoute = routeFromPath(path);
    if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
    }
    route.value = nextRoute;
    accountMenuOpen.value = false;
}

function syncRoute(): void {
    route.value = routeFromPath(window.location.pathname);
    accountMenuOpen.value = false;
}

function applyResolvedSource(value: {
    readonly source: string;
    readonly baseSource: string;
    readonly baseRevision?: BaseRevision;
}): void {
    source.value = value.source;
    baseSource.value = value.baseSource;
    baseRevision.value = value.baseRevision;
    pageMessage.value =
        'Conflict resolution applied locally. Review the recompiled page before checking again.';
}

function closeReview(): void {
    reviewOpen.value = false;
    void nextTick(() => reviewButton.value?.focus());
}

function openAuth(event: MouseEvent): void {
    authReturnTarget = event.currentTarget as HTMLElement;
    authOpen.value = true;
}

function closeAuth(): void {
    authOpen.value = false;
    void nextTick(() => {
        if (authReturnTarget?.isConnected) {
            authReturnTarget.focus();
        } else {
            identityButton.value?.focus();
        }
        authReturnTarget = undefined;
    });
}

function closeAccountMenu(): void {
    accountMenuOpen.value = false;
    void nextTick(() => identityButton.value?.focus());
}

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

async function saveDraft(): Promise<boolean> {
    const cleanTitle = title.value.trim();
    if (!cleanTitle) {
        return false;
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
            // IndexedDB cannot structured-clone Vue's reactive revision proxy.
            ...(baseRevision.value
                ? {
                      baseRevision: {
                          id: baseRevision.value.id,
                          timestamp: baseRevision.value.timestamp,
                      },
                  }
                : {}),
            updatedAt,
        });
        draftStatus.value = 'saved';
        draftMessage.value = `Saved in this browser at ${formatTime(updatedAt)}.`;
        return true;
    } catch {
        draftStatus.value = 'error';
        draftMessage.value =
            'Local save failed. Browser storage may be full or unavailable.';
        return false;
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
    const cleanTitle = requestedTitle.value.trim();
    const destinationWikiId = requestedWikiId.value;
    if (!cleanTitle || loadingPage.value) {
        return;
    }
    loadingPage.value = true;
    pageMessage.value = '';
    remotePage.value = undefined;
    try {
        const page = await api.loadPage(destinationWikiId, cleanTitle);
        // Preserve edits made before or during a slow page request before
        // replacing the active document and its revision metadata.
        if (draftTimer !== undefined) {
            clearTimeout(draftTimer);
            draftTimer = undefined;
            if (!(await saveDraft())) {
                throw new Error(
                    'The current draft could not be saved. Copy it before loading another page.',
                );
            }
        }
        const draft = await draftStore.get(destinationWikiId, page.title);
        wikiId.value = destinationWikiId;
        title.value = page.title;
        requestedTitle.value = page.title;
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

function routeFromPath(path: string): AppRoute {
    switch (path.replace(/\/+$/u, '') || '/') {
        case '/account':
            return 'account';
        case '/connected-apps':
            return 'connected-apps';
        case '/privacy':
            return 'privacy';
        default:
            return 'editor';
    }
}
</script>

<template>
    <div class="app-shell">
        <header class="topbar">
            <a
                class="brand"
                href="/"
                aria-label="WikiOne editor home"
                @click.prevent="navigate('/')"
            >
                <span class="brand-mark" aria-hidden="true">W</span>
                <span class="brand-copy">
                    <strong>WikiOne</strong>
                    <small>A better space to edit</small>
                </span>
            </a>

            <nav class="primary-nav" aria-label="Main navigation">
                <a
                    href="/"
                    :aria-current="route === 'editor' ? 'page' : undefined"
                    @click.prevent="navigate('/')"
                    >Editor</a
                >
                <a
                    href="/connected-apps"
                    :aria-current="
                        route === 'connected-apps' ? 'page' : undefined
                    "
                    @click.prevent="navigate('/connected-apps')"
                    >Connections</a
                >
                <a
                    href="/privacy"
                    :aria-current="route === 'privacy' ? 'page' : undefined"
                    @click.prevent="navigate('/privacy')"
                    >Privacy</a
                >
            </nav>

            <div class="topbar-actions">
                <label class="appearance-control">
                    <select v-model="appearance" aria-label="Appearance">
                        <option value="system">System theme</option>
                        <option value="light">Light theme</option>
                        <option value="dark">Dark theme</option>
                    </select>
                </label>
                <button
                    v-if="!session.authenticated"
                    class="button button--primary"
                    type="button"
                    @click="openAuth"
                >
                    Sign in
                </button>
                <div v-else class="account-menu">
                    <button
                        ref="identityButton"
                        class="identity-button"
                        type="button"
                        :aria-expanded="accountMenuOpen"
                        :aria-label="`${session.account.displayName} account menu`"
                        aria-haspopup="menu"
                        @click="accountMenuOpen = !accountMenuOpen"
                    >
                        <span aria-hidden="true">{{
                            session.account.displayName
                                .slice(0, 1)
                                .toUpperCase()
                        }}</span>
                        <span>{{ session.account.displayName }}</span>
                    </button>
                    <div
                        v-if="accountMenuOpen"
                        class="account-dropdown"
                        role="menu"
                        @keydown.esc.stop.prevent="closeAccountMenu"
                    >
                        <div>
                            <strong>{{ session.account.displayName }}</strong>
                            <small
                                >@{{ session.account.username }} ·
                                WikiOne</small
                            >
                        </div>
                        <button
                            type="button"
                            role="menuitem"
                            @click="navigate('/account')"
                        >
                            Account and security
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            @click="navigate('/connected-apps')"
                        >
                            Connected apps
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            @click="navigate('/privacy')"
                        >
                            Privacy
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            @click="refreshAccountSession"
                        >
                            Refresh session
                        </button>
                        <button type="button" role="menuitem" @click="signOut">
                            Sign out
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <section
            v-if="route === 'editor'"
            class="document-bar"
            aria-label="Page controls"
        >
            <div v-if="route === 'editor'" class="document-controls">
                <label class="field field--wiki">
                    <span>Wiki</span>
                    <select
                        v-model="requestedWikiId"
                        :disabled="loadingPage"
                        aria-label="Target wiki"
                    >
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
                        v-model="requestedTitle"
                        :disabled="loadingPage"
                        aria-label="Page title"
                        type="text"
                        maxlength="512"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="Article title"
                        @keydown.enter="loadPage"
                    />
                </label>
                <button
                    class="button"
                    type="button"
                    :disabled="loadingPage || !requestedTitle.trim()"
                    @click="loadPage"
                >
                    {{ loadingPage ? 'Loading…' : 'Load page' }}
                </button>
            </div>

            <div class="document-actions">
                <span class="document-hint"
                    >Your space to write, refine, and contribute.</span
                >
                <button
                    v-if="route === 'editor'"
                    ref="reviewButton"
                    class="button button--primary"
                    type="button"
                    :disabled="!title.trim()"
                    @click="reviewOpen = true"
                >
                    Review changes
                </button>
            </div>
        </section>

        <div
            v-if="route === 'editor' && (appMessage || pageMessage)"
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

        <nav
            v-if="route === 'editor'"
            class="mobile-tabs"
            aria-label="Editor view"
        >
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
            v-if="route === 'editor'"
            ref="workspace"
            class="workspace"
            :class="`workspace--mobile-${mobilePanel}`"
            :style="{ '--source-size': `${splitPercent}%` }"
        >
            <section class="pane source-pane" aria-labelledby="source-title">
                <div class="pane-header">
                    <div>
                        <span class="eyebrow">Wikitext source</span>
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
                        <span class="eyebrow">Live preview</span>
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
                        <span class="preview-glyph" aria-hidden="true">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                            >
                                <path d="M7 3h7l4 4v14H6V3h1Z" />
                                <path d="M14 3v5h4M9 12h6M9 16h6" />
                            </svg>
                        </span>
                        <h3>Your compiled page will appear here</h3>
                        <p>
                            Write or load a page to see your changes here. If a
                            preview cannot be refreshed, your last successful
                            version stays in view.
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

        <AccountPage
            v-else-if="route === 'account' && session.authenticated"
            :session="session"
            @session="updateSession"
            @signed-out="signOut"
            @navigate="navigate"
        />
        <main
            v-else-if="route === 'account'"
            class="settings-page settings-empty"
        >
            <span class="eyebrow">WikiOne account</span>
            <h1>Sign in to manage your account</h1>
            <p>
                Account and security controls are available after signing in to
                WikiOne. This does not connect a Wikimedia account.
            </p>
            <button
                class="button button--primary"
                type="button"
                @click="openAuth"
            >
                Sign in to WikiOne
            </button>
        </main>
        <ConnectedAppsPage
            v-else-if="route === 'connected-apps'"
            :session="session"
            @navigate="navigate"
        />
        <PrivacyPage v-else @navigate="navigate" />

        <footer v-if="route === 'editor'" class="privacy-bar">
            <span>{{ draftMessage }}</span>
            <span>
                Preview source is sent to {{ selectedWiki.displayName }} for
                parsing. WikiOne accounts are separate; Wikimedia publishing is
                awaiting OAuth approval.
            </span>
        </footer>

        <AuthDialog
            :open="authOpen"
            @close="closeAuth"
            @authenticated="updateSession"
        />
        <PublishReviewDialog
            :open="reviewOpen"
            :wiki-id="wikiId"
            :wiki-name="selectedWiki.displayName"
            :title="title"
            :source="source"
            :base-source="baseSource"
            :base-revision="baseRevision"
            :preview-current="previewStatus.phase === 'ready'"
            @close="closeReview"
            @resolved="applyResolvedSource"
        />

        <div class="visually-hidden" aria-live="polite">
            {{ previewStatusLabel }}. {{ draftStatusLabel }}.
        </div>
    </div>
</template>
