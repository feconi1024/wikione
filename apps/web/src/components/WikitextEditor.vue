<script setup lang="ts">
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
    applyWikitextCommand,
    createWikitextExtensions,
    type WikitextCommand,
} from '@wikione/wikitext-editor';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
    modelValue: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [source: string];
    cursor: [line: number, column: number];
}>();

const host = ref<HTMLDivElement>();
let editor: EditorView | undefined;

onMounted(() => {
    if (!host.value) {
        return;
    }
    editor = new EditorView({
        parent: host.value,
        state: EditorState.create({
            doc: props.modelValue,
            extensions: createWikitextExtensions({
                onChange: (source) => emit('update:modelValue', source),
                onSelectionChange: (_anchor, head) => emitCursor(head),
            }),
        }),
    });
    emitCursor(0);
});

onBeforeUnmount(() => {
    editor?.destroy();
    editor = undefined;
});

watch(
    () => props.modelValue,
    (source) => {
        if (!editor || editor.state.doc.toString() === source) {
            return;
        }
        const head = Math.min(source.length, editor.state.selection.main.head);
        editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: source },
            selection: EditorSelection.cursor(head),
        });
    },
);

function applyCommand(command: WikitextCommand): void {
    if (!editor) {
        return;
    }
    const selection = editor.state.selection.main;
    const result = applyWikitextCommand(
        editor.state.doc.toString(),
        { from: selection.from, to: selection.to },
        command,
    );
    editor.dispatch({
        changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: result.source,
        },
        selection: EditorSelection.range(
            result.selection.from,
            result.selection.to,
        ),
        scrollIntoView: true,
    });
    editor.focus();
}

function focusAt(position: number): void {
    if (!editor) {
        return;
    }
    const safePosition = Math.min(
        Math.max(position, 0),
        editor.state.doc.length,
    );
    editor.dispatch({
        selection: EditorSelection.cursor(safePosition),
        scrollIntoView: true,
    });
    editor.focus();
}

function emitCursor(position: number): void {
    if (!editor) {
        return;
    }
    const line = editor.state.doc.lineAt(position);
    emit('cursor', line.number, position - line.from + 1);
}

defineExpose({ applyCommand, focusAt });
</script>

<template>
    <div
        ref="host"
        class="wikitext-editor"
        aria-label="Wikitext source editor"
    ></div>
</template>
