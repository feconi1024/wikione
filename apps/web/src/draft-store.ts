import {
    createDraftKey,
    isLocalDraft,
    type LocalDraft,
} from '@wikione/editor-core';

const databaseName = 'wikione-editor';
const storeName = 'drafts';
const databaseVersion = 1;

export interface DraftStore {
    readonly get: (
        wikiId: string,
        title: string,
    ) => Promise<LocalDraft | undefined>;
    readonly save: (draft: LocalDraft) => Promise<void>;
    readonly delete: (wikiId: string, title: string) => Promise<void>;
}

/** Stores source-only drafts locally. Parser HTML and credentials never enter IndexedDB. */
export class IndexedDbDraftStore implements DraftStore {
    readonly #factory: IDBFactory;
    #databasePromise: Promise<IDBDatabase> | undefined;

    public constructor(factory: IDBFactory = indexedDB) {
        this.#factory = factory;
    }

    public async get(
        wikiId: string,
        title: string,
    ): Promise<LocalDraft | undefined> {
        const database = await this.#database();
        const value = await requestResult(
            database
                .transaction(storeName, 'readonly')
                .objectStore(storeName)
                .get(createDraftKey(wikiId, title)),
        );
        return isLocalDraft(value) ? value : undefined;
    }

    public async save(draft: LocalDraft): Promise<void> {
        const database = await this.#database();
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(draft);
        await transactionComplete(transaction);
    }

    public async delete(wikiId: string, title: string): Promise<void> {
        const database = await this.#database();
        const transaction = database.transaction(storeName, 'readwrite');
        transaction
            .objectStore(storeName)
            .delete(createDraftKey(wikiId, title));
        await transactionComplete(transaction);
    }

    #database(): Promise<IDBDatabase> {
        this.#databasePromise ??= new Promise((resolve, reject) => {
            const request = this.#factory.open(databaseName, databaseVersion);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(storeName)) {
                    database.createObjectStore(storeName, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () =>
                reject(
                    request.error ?? new Error('Could not open draft storage.'),
                );
        });
        return this.#databasePromise;
    }
}

function requestResult(request: IDBRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as unknown);
        request.onerror = () =>
            reject(request.error ?? new Error('Draft read failed.'));
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error ?? new Error('Draft write failed.'));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error('Draft write was aborted.'));
    });
}
