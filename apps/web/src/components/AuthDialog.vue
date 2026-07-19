<script setup lang="ts">
import type { SessionStatus } from '@wikione/contracts';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { WikiOneApiClient } from '../api.js';

const props = defineProps<{ readonly open: boolean }>();
const emit = defineEmits<{
    close: [];
    authenticated: [session: SessionStatus];
}>();

const api = new WikiOneApiClient();
const mode = ref<'login' | 'register'>('login');
const username = ref('');
const displayName = ref('');
const password = ref('');
const busy = ref(false);
const message = ref('');
const usernameInput = ref<HTMLInputElement>();
const title = computed(() =>
    mode.value === 'login' ? 'Sign in to WikiOne' : 'Create a WikiOne account',
);

watch(
    () => props.open,
    (open) => {
        if (open) {
            message.value = '';
            void nextTick(() => usernameInput.value?.focus());
            window.addEventListener('keydown', closeOnEscape);
        } else {
            window.removeEventListener('keydown', closeOnEscape);
        }
    },
);

onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));

function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('close');
    }
}

function switchMode(nextMode: 'login' | 'register'): void {
    mode.value = nextMode;
    message.value = '';
}

async function submit(): Promise<void> {
    if (busy.value) {
        return;
    }
    busy.value = true;
    message.value = '';
    try {
        const result =
            mode.value === 'login'
                ? await api.login({
                      username: username.value,
                      password: password.value,
                  })
                : await api.register({
                      username: username.value,
                      displayName: displayName.value,
                      password: password.value,
                  });
        password.value = '';
        emit('authenticated', result.session);
        emit('close');
    } catch (error: unknown) {
        message.value = safeMessage(
            error,
            'WikiOne could not complete sign-in.',
        );
    } finally {
        busy.value = false;
    }
}

function safeMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim()
        ? error.message.slice(0, 500)
        : fallback;
}
</script>

<template>
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
        <section
            class="modal-card auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
        >
            <button
                class="modal-close"
                type="button"
                aria-label="Close sign-in"
                @click="emit('close')"
            >
                ×
            </button>
            <span class="eyebrow">WikiOne account</span>
            <h2 id="auth-title">{{ title }}</h2>
            <p>
                This account manages WikiOne preferences and sessions. It does
                not connect you to Wikipedia or authorize a wiki edit.
            </p>

            <div class="segmented" aria-label="Account action">
                <button
                    type="button"
                    :aria-pressed="mode === 'login'"
                    @click="switchMode('login')"
                >
                    Sign in
                </button>
                <button
                    type="button"
                    :aria-pressed="mode === 'register'"
                    @click="switchMode('register')"
                >
                    Create account
                </button>
            </div>

            <form class="account-form" @submit.prevent="submit">
                <label>
                    <span>Username</span>
                    <input
                        ref="usernameInput"
                        v-model="username"
                        name="username"
                        autocomplete="username"
                        minlength="3"
                        maxlength="40"
                        required
                    />
                </label>
                <label v-if="mode === 'register'">
                    <span>Display name</span>
                    <input
                        v-model="displayName"
                        name="name"
                        autocomplete="name"
                        maxlength="80"
                        required
                    />
                </label>
                <label>
                    <span>Password</span>
                    <input
                        v-model="password"
                        name="password"
                        type="password"
                        :autocomplete="
                            mode === 'login'
                                ? 'current-password'
                                : 'new-password'
                        "
                        :minlength="mode === 'register' ? 12 : 1"
                        maxlength="128"
                        required
                    />
                    <small v-if="mode === 'register'">
                        Use at least 12 characters. A memorable passphrase works
                        well.
                    </small>
                </label>
                <p v-if="message" class="form-error" role="alert">
                    {{ message }}
                </p>
                <button
                    class="button button--primary"
                    type="submit"
                    :disabled="busy"
                >
                    {{
                        busy
                            ? 'Please wait…'
                            : mode === 'login'
                              ? 'Sign in'
                              : 'Create account'
                    }}
                </button>
            </form>
        </section>
    </div>
</template>
