<script setup lang="ts">
const emit = defineEmits<{ navigate: [path: string] }>();
</script>

<template>
    <main class="settings-page legal-page">
        <header class="settings-heading">
            <span class="eyebrow">Current implementation</span>
            <h1>Privacy and data controls</h1>
            <p>
                This notice describes the Milestone 2 implementation. It is a
                product data inventory, not legal advice.
            </p>
        </header>

        <section class="settings-card">
            <h2>WikiOne account</h2>
            <p>
                If you register, PostgreSQL stores your username, display name,
                salted password hash, and account timestamps. WikiOne does not
                collect an email address in this version. Account deletion is
                available under Account and security.
            </p>
        </section>
        <section class="settings-card">
            <h2>Sessions</h2>
            <p>
                Redis stores an encrypted session payload with idle and absolute
                expiry. Your browser receives only an opaque HTTP-only cookie.
                Refresh rotates it; logout, password change, logout-all, and
                account deletion revoke it.
            </p>
        </section>
        <section class="settings-card">
            <h2>Drafts and previews</h2>
            <p>
                Wikitext drafts and their base snapshot stay in this browser's
                IndexedDB until discarded or site data is cleared. Preview
                source is sent to the selected wiki parser. Rendered preview
                documents live in Redis for two minutes by default and are
                delivered from the isolated preview origin.
            </p>
        </section>
        <section class="settings-card">
            <h2>Wikimedia connection</h2>
            <p>
                No Wikimedia OAuth token, wiki account identity, edit, or
                revision created by WikiOne is stored because public OAuth and
                publishing are not enabled. The connected-app page reports this
                boundary explicitly.
            </p>
        </section>
        <section class="settings-card">
            <h2>Logs and user controls</h2>
            <p>
                Source-bearing application request logs are disabled. Safe error
                records may contain request IDs and normalized failure codes,
                never passwords, cookies, tokens, wikitext, summaries, or parser
                HTML. Browser draft discard and server account deletion are
                independent controls.
            </p>
        </section>

        <button
            class="text-button"
            type="button"
            @click="emit('navigate', '/connected-apps')"
        >
            Review connected apps
        </button>
    </main>
</template>
