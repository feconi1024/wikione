<script setup lang="ts">
import type { WikitextCommand } from '@wikione/wikitext-editor';

interface Tool {
    readonly command: WikitextCommand;
    readonly label: string;
    readonly shortLabel: string;
    readonly group: 'format' | 'insert' | 'structure';
}

const emit = defineEmits<{
    command: [command: WikitextCommand];
}>();

const tools: readonly Tool[] = [
    {
        command: 'bold',
        label: 'Bold selected text',
        shortLabel: 'B',
        group: 'format',
    },
    {
        command: 'italic',
        label: 'Italicize selected text',
        shortLabel: 'I',
        group: 'format',
    },
    {
        command: 'heading',
        label: 'Insert section heading',
        shortLabel: 'H2',
        group: 'structure',
    },
    {
        command: 'internal-link',
        label: 'Insert internal wiki link',
        shortLabel: 'Link',
        group: 'insert',
    },
    {
        command: 'template',
        label: 'Insert template',
        shortLabel: '{{ }}',
        group: 'insert',
    },
    {
        command: 'reference',
        label: 'Insert reference',
        shortLabel: 'Cite',
        group: 'insert',
    },
    {
        command: 'bullet-list',
        label: 'Insert bulleted list',
        shortLabel: '• List',
        group: 'structure',
    },
    {
        command: 'number-list',
        label: 'Insert numbered list',
        shortLabel: '1. List',
        group: 'structure',
    },
    {
        command: 'table',
        label: 'Insert wiki table',
        shortLabel: 'Table',
        group: 'insert',
    },
];
</script>

<template>
    <div class="editor-toolbar" role="toolbar" aria-label="Wikitext tools">
        <template v-for="(tool, index) in tools" :key="tool.command">
            <span
                v-if="index > 0 && tools[index - 1]?.group !== tool.group"
                class="toolbar-divider"
                aria-hidden="true"
            ></span>
            <button
                class="tool-button"
                type="button"
                :class="{
                    'tool-button--bold': tool.command === 'bold',
                    'tool-button--italic': tool.command === 'italic',
                }"
                :aria-label="tool.label"
                :title="tool.label"
                @click="emit('command', tool.command)"
            >
                {{ tool.shortLabel }}
            </button>
        </template>
    </div>
</template>
