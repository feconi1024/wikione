'use strict';

const https = require('node:https');

const endpoints = (process.env.WIKIONE_HEALTH_ENDPOINTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

exports.handler = async () => {
    if (endpoints.length !== 3) {
        throw new Error('Expected exactly three WikiOne health endpoints.');
    }
    for (const endpoint of endpoints) {
        await assertHealthy(endpoint);
    }
};

function assertHealthy(endpoint) {
    return new Promise((resolve, reject) => {
        const request = https.get(endpoint, { timeout: 10_000 }, (response) => {
            response.resume();
            if (response.statusCode === 200) {
                resolve();
                return;
            }
            reject(
                new Error(
                    `Health check returned ${String(response.statusCode)}.`,
                ),
            );
        });
        request.once('timeout', () =>
            request.destroy(new Error('Health check timed out.')),
        );
        request.once('error', reject);
    });
}
