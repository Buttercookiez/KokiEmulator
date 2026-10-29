import { IS_NDS } from '../platform';
import policy from '../legal/privacy.json';
import './Privacy.css';

export function PrivacyPolicy() {
  return <article className="privacy-copy" aria-label="Koki privacy policy">
    <p className="privacy-summary">{policy.summary}</p>
    <p className="privacy-meta">{IS_NDS ? 'Koki NDS' : policy.applicationName} ({policy.alternateName}) · Effective {policy.effectiveDate}</p>
    <section><h3>Developer and contact</h3><p>{policy.developerName}</p><p className="privacy-contact">{policy.supportEmail}</p><p className="privacy-contact">{policy.policyUrl}</p><p>Contact the developer with privacy questions or support requests. You can also use the project’s public GitHub issue tracker.</p></section>
    {policy.sections.map(section => <section key={section.id}><h3>{section.title}</h3>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
  </article>;
}

export function PlayMigration({ pending, onExport, onRestore }: { pending: boolean; onExport: () => void; onRestore: () => void }) {
  return <div className="privacy-copy migration-copy">
    <p className="privacy-summary">Keep your progress when moving from a preview APK to Google Play.</p>
    <p>The preview APK and Google Play version use different signing identities. Android may require you to uninstall the preview before installing the Play version. Uninstalling removes its private library.</p>
    <ol className="migration-steps">
      <li><strong>Export before uninstalling</strong><p>In the preview, open Settings → Export full backup. Use the share sheet to save the ZIP outside Koki, such as Downloads, a computer, or your own cloud drive.</p></li>
      <li><strong>Keep the backup safe</strong><p>Check that the ZIP exists in the destination you chose. Keep it until you have restored and checked your games. Do not send it to the developer or post it publicly.</p></li>
      <li><strong>Restore after installing</strong><p>Install Koki from Google Play, then choose Restore backup on the welcome screen or in Settings. Check your library and progress before deleting any backup.</p></li>
    </ol>
    <div className="storage-actions"><button type="button" className="button button-primary" onClick={onExport} disabled={pending}>Export full backup</button><button type="button" className="button" onClick={onRestore} disabled={pending}>Restore backup</button></div>
    <div className="privacy-help"><h3>Need help?</h3><p className="privacy-contact">{policy.supportEmail}</p><p>Include your Koki version, Android version, device model, and steps to reproduce the issue. Avoid attaching ROMs or private backups.</p></div>
  </div>;
}
