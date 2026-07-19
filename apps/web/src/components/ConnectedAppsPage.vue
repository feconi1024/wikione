<script setup lang="ts">
import type { SessionStatus } from '@wikione/contracts';

defineProps<{ readonly session: SessionStatus }>();
const emit = defineEmits<{ navigate: [path: string] }>();
</script>

<template>
    <main class="settings-page">
        <header class="settings-heading">
            <span class="eyebrow">Identity boundaries</span>
            <h1>Connected apps</h1>
            <p>
                WikiOne accounts and Wikimedia accounts are independent. Only a
                future Wikimedia connection can authorize edits on Wikipedia.
            </p>
        </header>

        <section class="connection-card">
            <div class="connection-icon" aria-hidden="true">W</div>
            <div>
                <h2>WikiOne account</h2>
                <p v-if="session.authenticated">
                    Connected as
                    <strong>{{ session.account.displayName }}</strong> ({{
                        session.account.username
                    }}).
                </p>
                <p v-else>Not signed in.</p>
            </div>
            <span class="status-pill status-pill--success">
                {{ session.authenticated ? 'Connected' : 'Available' }}
            </span>
        </section>

        <section class="connection-card">
            <div
                class="connection-icon connection-icon--wiki"
                aria-hidden="true"
            >
                Ω
            </div>
            <div>
                <h2>Wikipedia / Wikimedia</h2>
                <p>
                    No wiki account is connected. Public OAuth consumer
                    registration and approval are still pending.
                </p>
            </div>
            <button
                class="button"
                type="button"
                disabled
                title="Public Wikimedia OAuth approval is pending"
            >
                Connect Wikipedia — approval pending
            </button>
        </section>

        <aside class="settings-notice">
            <strong>Publishing remains unavailable.</strong> WikiOne will never
            send your WikiOne password to Wikimedia or treat this local account
            as wiki authorization.
        </aside>

        <button
            class="text-button"
            type="button"
            @click="emit('navigate', '/privacy')"
        >
            Read the privacy notice
        </button>
    </main>
</template>
