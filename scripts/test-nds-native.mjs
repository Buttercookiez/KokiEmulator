import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(), profile = path.join(root, '.cache/nds-tests/native-profile-' + Date.now());
await fs.mkdir(profile, { recursive: true });
const app = await electron.launch({ args: ['.'], env: { ...process.env, KOKI_SYSTEM: 'nds', KOKI_TEST_MODE: '1', KOKI_TEST_DATA_DIR: profile } });
try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.getByLabel('Import NDS games', { exact: true }).setInputFiles('.cache/nds-tests/koki-ds-diagnostic.nds');
    await page.getByRole('button', { name: 'Play koki-ds-diagnostic', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas')?.getContext('2d').getImageData(120, 96, 1, 1).data[2] > 200);
    await page.locator('canvas').focus();
    await page.keyboard.press('F5');
    await page.getByText('Checkpoint saved on this device', { exact: true }).waitFor();
    await page.locator('canvas').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Save and return to library', exact: true }).press('Enter');
    await page.getByRole('heading', { name: 'Your library', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    const info = await app.evaluate(({ app }) => ({ name: app.getName(), data: app.getPath('userData') }));
    assert.equal(info.name, 'Koki NDS');
    assert.equal(path.resolve(info.data), profile);
    await fs.writeFile('.cache/nds-tests/native-report.json', JSON.stringify({ status: 'passed', scope: 'Electron native storage and app:// production frontend', info, checks: ['NDS import', 'real WASM dual-screen playback', 'native large checkpoint', 'save and close'], errors }, null, 2));
    console.log('NDS native shell, isolated storage, real playback and checkpoints passed.');
}
finally {
    await app.close();
}
