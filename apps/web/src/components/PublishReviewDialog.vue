<script setup lang="ts">
import type {
    BaseRevision,
    NormalizedPublishError,
    PublishPreparationResult,
    WatchlistBehavior,
} from '@wikione/contracts';
import {
    createReviewModel,
    mergeDocuments,
    resolveMerge,
    type MergeModel,
} from '@wikione/publishing-core';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { WikiOneApiClient } from '../api.js';
import { focusModalControl, trapModalFocus } from '../modal-focus.js';

const props = defineProps<{
    readonly open: boolean;
    readonly wikiId: string;
    readonly wikiName: string;
    readonly title: string;
    readonly source: string;
    readonly baseSource: string;
    readonly baseRevision: BaseRevision | undefined;
    readonly previewCurrent: boolean;
}>();
const emit = defineEmits<{
    close: [];
    resolved: [
        value: {
            readonly source: string;
            readonly baseSource: string;
            readonly baseRevision?: BaseRevision;
        },
    ];
}>();

const api = new WikiOneApiClient();
const summary = ref('');
const minor = ref(false);
const watchlist = ref<WatchlistBehavior>('preferences');
const busy = ref(false);
const preparation = ref<PublishPreparationResult>();
const merge = ref<MergeModel>();
const choices = ref<Record<number, 'ours' | 'theirs' | 'manual'>>({});
const manualSources = ref<Record<number, string>>({});
const error = ref<NormalizedPublishError>();
const editingStartedAt = ref(new Date().toISOString());
const closeButton = ref<HTMLButtonElement>();
const dialog = ref<HTMLElement>();
const review = computed(() =>
    createReviewModel(props.baseSource, props.source),
);
const canPrepare = computed(
    () =>
        props.title.trim() &&
        summary.value.trim() &&
        review.value.changed &&
        props.previewCurrent &&
        !busy.value,
);
const unresolvedConflicts = computed(() =>
    merge.value
        ? merge.value.segments.filter(
              (segment) =>
                  segment.kind === 'conflict' &&
                  choices.value[segment.id] === undefined,
          ).length
        : 0,
);

watch(
    () => props.open,
    (open) => {
        if (open) {
            preparation.value = undefined;
            merge.value = undefined;
            choices.value = {};
            manualSources.value = {};
            error.value = undefined;
            editingStartedAt.value = new Date().toISOString();
            void focusModalControl(closeButton);
            window.addEventListener('keydown', handleDialogKeydown);
        } else {
            window.removeEventListener('keydown', handleDialogKeydown);
        }
    },
);

onBeforeUnmount(() =>
    window.removeEventListener('keydown', handleDialogKeydown),
);

function handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('close');
        return;
    }
    trapModalFocus(event, dialog.value);
}

async function prepare(): Promise<void> {
    if (!canPrepare.value) {
        return;
    }
    busy.value = true;
    error.value = undefined;
    merge.value = undefined;
    try {
        const result = await api.preparePublish({
            wikiId: props.wikiId,
            title: props.title.trim(),
            source: props.source,
            baseSource: props.baseSource,
            ...(props.baseRevision
                ? {
                      baseRevisionId: props.baseRevision.id,
                      baseTimestamp: props.baseRevision.timestamp,
                  }
                : {}),
            editingStartedAt: editingStartedAt.value,
            summary: summary.value,
            minor: minor.value,
            watchlist: watchlist.value,
        });
        preparation.value = result;
        if (result.status === 'conflict') {
            merge.value = mergeDocuments(
                props.baseSource,
                props.source,
                result.latestSource,
            );
            if (merge.value.conflictCount === 0 && merge.value.mergedSource) {
                choices.value = {};
            }
        }
    } catch (caught: unknown) {
        error.value = {
            category: 'upstream-unavailable',
            message:
                caught instanceof Error && caught.message.trim()
                    ? caught.message.slice(0, 2_000)
                    : 'WikiOne could not check the latest revision.',
            canRetry: true,
        };
    } finally {
        busy.value = false;
    }
}

function applyCleanMerge(): void {
    const result = preparation.value;
    const currentMerge = merge.value;
    if (result?.status !== 'conflict' || !currentMerge?.mergedSource) {
        return;
    }
    emitResolution(currentMerge.mergedSource, result);
}

function applyConflictResolution(): void {
    const result = preparation.value;
    const currentMerge = merge.value;
    if (
        result?.status !== 'conflict' ||
        !currentMerge ||
        unresolvedConflicts.value > 0
    ) {
        return;
    }
    const resolutions = Object.fromEntries(
        currentMerge.segments.flatMap((segment) => {
            if (segment.kind !== 'conflict') {
                return [];
            }
            const choice = choices.value[segment.id];
            return [
                [
                    segment.id,
                    choice === 'manual'
                        ? {
                              choice: 'manual' as const,
                              source: manualSources.value[segment.id] ?? '',
                          }
                        : { choice: choice ?? 'ours' },
                ],
            ];
        }),
    );
    emitResolution(resolveMerge(currentMerge, resolutions), result);
}

function emitResolution(
    source: string,
    result: Extract<PublishPreparationResult, { status: 'conflict' }>,
): void {
    emit('resolved', {
        source,
        baseSource: result.latestSource,
        ...(result.latestRevision
            ? { baseRevision: result.latestRevision }
            : {}),
    });
    emit('close');
}

function errorTitle(category: NormalizedPublishError['category']): string {
    switch (category) {
        case 'abuse-filter':
            return 'Target wiki abuse filter rejected the edit';
        case 'captcha':
            return 'CAPTCHA required on the target wiki';
        case 'edit-conflict':
            return 'The wiki page changed';
        case 'protected-page':
        case 'permission-denied':
            return 'The connected account cannot edit this page';
        case 'rate-limited':
            return 'The target wiki asked WikiOne to wait';
        case 'verification-failed':
            return 'The saved revision could not be verified';
        default:
            return 'Publishing preparation needs attention';
    }
}
</script>

<template>
    <div
        v-if="open"
        class="modal-backdrop review-backdrop"
        @click.self="emit('close')"
    >
        <section
            ref="dialog"
            class="modal-card review-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
        >
            <header class="review-header">
                <div>
                    <span class="eyebrow">{{ wikiName }}</span>
                    <h2 id="review-title">Review changes to {{ title }}</h2>
                </div>
                <button
                    ref="closeButton"
                    class="modal-close"
                    type="button"
                    aria-label="Close review"
                    @click="emit('close')"
                >
                    ×
                </button>
            </header>

            <div class="review-summary" role="status">
                <strong>{{ review.additions }} added</strong>
                <strong>{{ review.deletions }} removed</strong>
                <span v-if="baseRevision"
                    >Base revision {{ baseRevision.id }}</span
                >
                <span v-else>Proposed new page</span>
            </div>

            <div class="review-body">
                <section
                    class="diff-panel"
                    aria-labelledby="diff-title"
                    tabindex="0"
                >
                    <h3 id="diff-title">Source changes</h3>
                    <p v-if="!review.changed" class="empty-message">
                        There are no source changes to review.
                    </p>
                    <ol
                        v-else
                        class="diff-lines"
                        aria-label="Unified source diff"
                    >
                        <li
                            v-for="(line, index) in review.lines"
                            :key="`${String(index)}-${line.kind}`"
                            :class="`diff-line diff-line--${line.kind}`"
                        >
                            <span class="diff-number">{{
                                line.oldLine ?? ''
                            }}</span>
                            <span class="diff-number">{{
                                line.newLine ?? ''
                            }}</span>
                            <span class="diff-sign" aria-hidden="true">{{
                                line.kind === 'addition'
                                    ? '+'
                                    : line.kind === 'deletion'
                                      ? '−'
                                      : ' '
                            }}</span>
                            <ins v-if="line.kind === 'addition'">{{
                                line.text
                            }}</ins>
                            <del v-else-if="line.kind === 'deletion'">{{
                                line.text
                            }}</del>
                            <code v-else>{{ line.text }}</code>
                        </li>
                    </ol>
                </section>

                <aside class="review-options" aria-labelledby="options-title">
                    <h3 id="options-title">Edit details</h3>
                    <label>
                        <span
                            >Edit summary
                            <strong aria-hidden="true">*</strong></span
                        >
                        <textarea
                            v-model="summary"
                            maxlength="500"
                            rows="3"
                            required
                            aria-describedby="summary-help"
                        ></textarea>
                        <small id="summary-help">
                            Briefly explain what changed. Required before the
                            latest revision check.
                        </small>
                    </label>
                    <label class="checkbox-field">
                        <input v-model="minor" type="checkbox" />
                        <span>Mark as a minor edit</span>
                    </label>
                    <fieldset>
                        <legend>Watchlist</legend>
                        <label>
                            <input
                                v-model="watchlist"
                                type="radio"
                                value="preferences"
                            />
                            Use wiki preference
                        </label>
                        <label>
                            <input
                                v-model="watchlist"
                                type="radio"
                                value="watch"
                            />
                            Watch this page
                        </label>
                        <label>
                            <input
                                v-model="watchlist"
                                type="radio"
                                value="unwatch"
                            />
                            Unwatch this page
                        </label>
                        <label>
                            <input
                                v-model="watchlist"
                                type="radio"
                                value="nochange"
                            />
                            Leave unchanged
                        </label>
                    </fieldset>
                    <p v-if="!previewCurrent" class="form-error" role="status">
                        Wait for the current source preview before checking the
                        revision.
                    </p>
                    <button
                        class="button button--primary"
                        type="button"
                        :disabled="!canPrepare"
                        @click="prepare"
                    >
                        {{ busy ? 'Checking…' : 'Check latest revision' }}
                    </button>
                </aside>
            </div>

            <section v-if="error" class="publish-error" role="alert">
                <h3>{{ errorTitle(error.category) }}</h3>
                <p>{{ error.message }}</p>
                <button v-if="error.canRetry" type="button" @click="prepare">
                    Try again
                </button>
            </section>

            <section
                v-if="preparation?.status === 'ready'"
                class="readiness-card readiness-card--ready"
                role="status"
            >
                <div>
                    <strong>
                        Ready to
                        {{
                            preparation.operation === 'create'
                                ? 'create'
                                : 'update'
                        }}
                    </strong>
                    <p>
                        The latest wiki revision is compatible with this draft.
                    </p>
                </div>
                <button
                    class="button button--primary"
                    type="button"
                    disabled
                    title="Wikimedia OAuth approval is pending"
                >
                    Publish to Wikipedia — approval pending
                </button>
            </section>

            <section
                v-if="preparation?.status === 'conflict' && merge"
                class="conflict-workspace"
                aria-labelledby="conflict-title"
            >
                <h3 id="conflict-title">
                    {{ merge.conflictCount }} source
                    {{ merge.conflictCount === 1 ? 'conflict' : 'conflicts' }}
                </h3>
                <p>
                    The page changed after this draft started. Non-overlapping
                    changes are already combined; overlapping regions need your
                    choice.
                </p>

                <template
                    v-for="segment in merge.segments"
                    :key="
                        segment.kind === 'conflict'
                            ? `conflict-${segment.id}`
                            : segment.lines.join('\n')
                    "
                >
                    <section
                        v-if="segment.kind === 'conflict'"
                        class="conflict-region"
                        :aria-labelledby="`conflict-${segment.id}`"
                        tabindex="-1"
                    >
                        <h4 :id="`conflict-${segment.id}`">
                            Conflict {{ segment.id + 1 }}
                        </h4>
                        <div class="conflict-columns">
                            <label>
                                <span>Your draft</span>
                                <pre>{{ segment.ours.join('\n') }}</pre>
                                <input
                                    v-model="choices[segment.id]"
                                    type="radio"
                                    :name="`conflict-${segment.id}`"
                                    value="ours"
                                />
                                Keep mine
                            </label>
                            <label>
                                <span>Latest wiki version</span>
                                <pre>{{ segment.theirs.join('\n') }}</pre>
                                <input
                                    v-model="choices[segment.id]"
                                    type="radio"
                                    :name="`conflict-${segment.id}`"
                                    value="theirs"
                                />
                                Use latest
                            </label>
                            <div class="conflict-manual">
                                <label>
                                    <span>Resolve manually</span>
                                    <textarea
                                        v-model="manualSources[segment.id]"
                                        rows="5"
                                        @focus="choices[segment.id] = 'manual'"
                                    ></textarea>
                                </label>
                                <label>
                                    <input
                                        v-model="choices[segment.id]"
                                        type="radio"
                                        :name="`conflict-${segment.id}`"
                                        value="manual"
                                    />
                                    Use manual text
                                </label>
                            </div>
                        </div>
                    </section>
                </template>

                <button
                    v-if="merge.conflictCount === 0"
                    class="button button--primary"
                    type="button"
                    @click="applyCleanMerge"
                >
                    Apply merged source
                </button>
                <button
                    v-else
                    class="button button--primary"
                    type="button"
                    :disabled="unresolvedConflicts > 0"
                    @click="applyConflictResolution"
                >
                    Apply resolution
                    <span v-if="unresolvedConflicts > 0">
                        ({{ unresolvedConflicts }} remaining)
                    </span>
                </button>
            </section>

            <details class="future-errors">
                <summary>How target-wiki rejections will be handled</summary>
                <dl>
                    <div>
                        <dt>Abuse filter</dt>
                        <dd>
                            WikiOne preserves your draft and summary, shows only
                            the wiki's safe filter explanation, and offers Edit
                            and retry.
                        </dd>
                    </div>
                    <div>
                        <dt>CAPTCHA</dt>
                        <dd>
                            WikiOne explains that the challenge must be
                            completed on the target wiki; it never emulates a
                            CAPTCHA.
                        </dd>
                    </div>
                    <div>
                        <dt>Revision verification</dt>
                        <dd>
                            A future successful edit is reported only after the
                            exact new revision source is reloaded and verified.
                        </dd>
                    </div>
                </dl>
            </details>
        </section>
    </div>
</template>
