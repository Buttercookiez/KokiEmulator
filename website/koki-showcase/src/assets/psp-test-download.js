(() => {
  const button = document.querySelector('[data-psp-download]');
  const status = document.querySelector('[data-psp-download-status]');
  let testKey;

  function readTesterLink() {
    const key = /^#platforms[?]test=([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1];
    if (!key) return;
    testKey = key;
    requestAnimationFrame(() => document.getElementById('platforms').scrollIntoView());
  }

  readTesterLink();
  window.addEventListener('hashchange', readTesterLink);

  button.addEventListener('click', async () => {
    if (!testKey) {
      status.textContent = 'Open the private tester link you received, then tap Download Android APK.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Preparing your APK…';
    try {
      const response = await fetch('/assets/psp-android-test-023.bin');
      if (!response.ok) throw new Error('Download unavailable');
      const packageBytes = new Uint8Array(await response.arrayBuffer());
      const keyBytes = Uint8Array.from(atob(testKey.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
      const apk = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packageBytes.subarray(0, 12) }, key, packageBytes.subarray(12));
      const apkUrl = URL.createObjectURL(new Blob([apk], { type: 'application/vnd.android.package-archive' }));
      const link = document.createElement('a');
      link.href = apkUrl;
      link.download = 'Koki-PSP-0.2.3-Android.apk';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(apkUrl), 60000);
      status.textContent = 'Download started. Check your browser’s downloads.';
    } catch {
      status.textContent = 'Could not prepare the APK. Reopen your private tester link and try again.';
    } finally {
      button.disabled = false;
    }
  });
})();
