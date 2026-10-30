import { IS_NDS } from '../platform';
import ndsManifest from '../../engines/nds-manifest.json';
import skyLicense from '../../licenses/nds/SkyEmu-MIT.txt?raw';
import biosLicense from '../../licenses/nds/BIOS-replacement-BSD-2-Clause.txt?raw';
import runtimeLicense from '../../licenses/nds/Runtime-notices.txt?raw';
import databaseLicense from '../../licenses/nds/ROM-database-MIT.txt?raw';
import inventory from '../legal/third-party.json';
import nativeManifest from '../../native/nds/manifest.json';
import nativeLicense from '../../licenses/nds-native/GPL-3.0.txt?raw';
import teakraLicense from '../../licenses/nds-native/teakra-MIT.txt?raw';
import fatfsLicense from '../../licenses/nds-native/FatFs.txt?raw';
import nativeNotice from '../../licenses/nds-native/NOTICE.txt?raw';

export function ThirdPartyNotices() {
  const notices = inventory.notices.filter(notice => !IS_NDS || notice.id !== 'artwork').map(notice => IS_NDS && notice.id === 'mgba' ? {
    ...notice, name: 'SkyEmu DS / Koki source bridge', license: 'MIT / BSD-2-Clause', version: ndsManifest.revision.slice(0, 12),
    source: ndsManifest.repository,
    description: 'Built from pinned, publicly available source. Core, BIOS replacement and ROM database license notices are included below. Build instructions and source provenance are bundled under vendor/nds.',
    files: [{ ...notice.files[0], name: 'SkyEmu — MIT', origin: 'licenses/nds/SkyEmu-MIT.txt', text: skyLicense }, { ...notice.files[0], name: 'BIOS replacement — BSD-2-Clause', origin: 'licenses/nds/BIOS-replacement-BSD-2-Clause.txt', text: biosLicense }, { ...notice.files[0], name: 'ROM database — MIT', origin: 'licenses/nds/ROM-database-MIT.txt', text: databaseLicense }, { ...notice.files[0], name: 'Compiler runtime notices', origin: 'licenses/nds/Runtime-notices.txt', text: runtimeLicense }],
  } : notice);
  if (IS_NDS) notices.unshift({ id:'nds-native', name:'Koki NDS / melonDS native Android', version:nativeManifest.revision.slice(0,12), license:'GPL-3.0-or-later', category:'Emulator core', source:'https://github.com/Buttercookiez/KokiEmulator/releases/tag/nds-v0.2.1', description:'Complete corresponding source and build instructions accompany the release. Android uses native JIT; SkyEmu remains available for older checkpoints. Bundled components retain their original licenses.', files:[{ name:'GNU GPL version 3', origin:'licenses/nds-native/GPL-3.0.txt', source:nativeManifest.repository, sha256:'', text:nativeLicense }, ...[{name:'Native source notice',text:nativeNotice},{name:'teakra — MIT',text:teakraLicense},{name:'FatFs',text:fatfsLicense}].map(f=>({...f,origin:f.name,source:nativeManifest.repository,sha256:''}))] });
  return <article aria-label="Third-party license notices">
    <p className="modal-help">{inventory.summary}</p>
    <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
      {notices.map(notice => <details key={notice.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
        <summary style={{ cursor: 'pointer', lineHeight: 1.5, fontSize: 13, overflowWrap: 'anywhere' }}>
          <strong>{notice.name}</strong>
          <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>{notice.version} · {notice.license}</span>
        </summary>
        <div style={{ paddingTop: 12 }}>
          {notice.description && <p className="modal-help">{notice.description}</p>}
          {notice.source && <p className="modal-help" style={{ overflowWrap: 'anywhere' }}>{notice.source}</p>}
          {notice.files.map((file, index) => <section key={file.origin} style={{ marginTop: index ? 24 : 12 }}>
            <h3 style={{ fontSize: 12, fontWeight: 550, marginBottom: 8 }}>{file.name}</h3>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', fontSize: 11, lineHeight: 1.65, color: 'var(--muted)', margin: 0 }}>{file.text}</pre>
          </section>)}
        </div>
      </details>)}
    </div>
  </article>;
}
