<script setup lang="ts">
import type { SessionStatus } from '@wikione/contracts';
import { ref, watch } from 'vue';

import { WikiOneApiClient } from '../api.js';

type AuthenticatedSession = Extract<SessionStatus, { authenticated: true }>;

const props = defineProps<{ readonly session: AuthenticatedSession }>();
const emit = defineEmits<{
    session: [session: SessionStatus];
    signedOut: [];
    navigate: [path: string];
}>();
const api = new WikiOneApiClient();
const displayName = ref(props.session.account.displayName);
const currentPassword = ref('');
const newPassword = ref('');
const deletionPassword = ref('');
const deletionConfirmation = ref('');
const message = ref('');
const error = ref('');
const busy = ref(false);

watch(
    () => props.session.account.displayName,
    (value) => {
        displayName.value = value;
    },
);

async function saveProfile(): Promise<void> {
    await run(async () => {
        const result = await api.updateAccount(
            { displayName: displayName.value },
            props.session.csrfToken,
        );
        emit('session', result.session);
        message.value = 'Display name updated.';
    });
}

async function changePassword(): Promise<void> {
    await run(async () => {
        const result = await api.changePassword(
            {
                currentPassword: currentPassword.value,
                newPassword: newPassword.value,
            },
            props.session.csrfToken,
        );
        currentPassword.value = '';
        newPassword.value = '';
        emit('session', result.session);
        message.value = 'Password changed and previous sessions revoked.';
    });
}

async function logoutAll(): Promise<void> {
    await run(async () => {
        await api.logout(props.session.csrfToken, true);
        emit('signedOut');
    });
}

async function deleteAccount(): Promise<void> {
    await run(async () => {
        await api.deleteAccount(
            {
                password: deletionPassword.value,
                confirmation: 'DELETE',
            },
            props.session.csrfToken,
        );
        emit('signedOut');
    });
}

async function run(action: () => Promise<void>): Promise<void> {
    if (busy.value) {
        return;
    }
    busy.value = true;
    error.value = '';
    message.value = '';
    try {
        await action();
    } catch (caught: unknown) {
        error.value =
            caught instanceof Error && caught.message.trim()
                ? caught.message.slice(0, 500)
                : 'The account action could not be completed.';
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <main class="settings-page">
        <header class="settings-heading">
            <span class="eyebrow">WikiOne account</span>
            <h1>Account and security</h1>
            <p>
                Signed in as <strong>{{ session.account.username }}</strong
                >. Your WikiOne identity is separate from any Wikimedia account.
            </p>
            <nav aria-label="Account pages">
                <button
                    type="button"
                    @click="emit('navigate', '/connected-apps')"
                >
                    Connected apps
                </button>
                <button type="button" @click="emit('navigate', '/privacy')">
                    Privacy
                </button>
            </nav>
        </header>

        <p v-if="message" class="settings-notice" role="status">
            {{ message }}
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <section class="settings-card" aria-labelledby="profile-title">
            <h2 id="profile-title">Profile</h2>
            <form class="account-form" @submit.prevent="saveProfile">
                <label>
                    <span>Username</span>
                    <input :value="session.account.username" disabled />
                </label>
                <label>
                    <span>Display name</span>
                    <input v-model="displayName" maxlength="80" required />
                </label>
                <button
                    class="button button--primary"
                    type="submit"
                    :disabled="busy"
                >
                    Save profile
                </button>
            </form>
        </section>

        <section class="settings-card" aria-labelledby="password-title">
            <h2 id="password-title">Change password</h2>
            <p>Changing your password revokes every other active session.</p>
            <form class="account-form" @submit.prevent="changePassword">
                <label>
                    <span>Current password</span>
                    <input
                        v-model="currentPassword"
                        type="password"
                        autocomplete="current-password"
                        required
                    />
                </label>
                <label>
                    <span>New password</span>
                    <input
                        v-model="newPassword"
                        type="password"
                        autocomplete="new-password"
                        minlength="12"
                        maxlength="128"
                        required
                    />
                </label>
                <button class="button" type="submit" :disabled="busy">
                    Change password
                </button>
            </form>
        </section>

        <section class="settings-card" aria-labelledby="sessions-title">
            <h2 id="sessions-title">Sessions</h2>
            <p>
                This session expires at
                {{ new Date(session.expiresAt).toLocaleString() }}.
            </p>
            <button
                class="button"
                type="button"
                :disabled="busy"
                @click="logoutAll"
            >
                Sign out everywhere
            </button>
        </section>

        <section
            class="settings-card settings-card--danger"
            aria-labelledby="delete-title"
        >
            <h2 id="delete-title">Delete account</h2>
            <p>
                This permanently removes the WikiOne profile and revokes all
                sessions. Browser drafts remain under your browser controls.
            </p>
            <form class="account-form" @submit.prevent="deleteAccount">
                <label>
                    <span>Password</span>
                    <input
                        v-model="deletionPassword"
                        type="password"
                        autocomplete="current-password"
                        required
                    />
                </label>
                <label>
                    <span>Type DELETE to confirm</span>
                    <input
                        v-model="deletionConfirmation"
                        autocomplete="off"
                        pattern="DELETE"
                        required
                    />
                </label>
                <button
                    class="button button--danger"
                    type="submit"
                    :disabled="busy || deletionConfirmation !== 'DELETE'"
                >
                    Delete my account
                </button>
            </form>
        </section>
    </main>
</template>
