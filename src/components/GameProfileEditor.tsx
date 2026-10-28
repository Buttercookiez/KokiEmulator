import type { GameProfile, Settings } from '../types';
import { gameSettings } from '../lib/profiles';
import { KeyBindings } from './KeyBindings';
import { Select } from './Select';

type Props = { profile?: GameProfile; defaults: Settings; onChange: (patch: GameProfile | null) => void; notify: (message: string) => void };
export function GameProfileEditor({ profile, defaults, onChange, notify }: Props) {
  const effective = gameSettings(defaults, profile);
  return <section className="detail-section game-profile" aria-label="Game profile">
    <div className="profile-heading"><div><h3>Play profile</h3><p>{profile ? 'Saved for this game' : 'Uses your global settings'}</p></div><label className="switch"><input type="checkbox" checked={Boolean(profile)} aria-label="Use custom game profile" onChange={event => onChange(event.target.checked ? { speed: defaults.speed, filter: defaults.filter, controls: { ...defaults.controls } } : null)} /><span /></label></div>
    {profile && <div className="profile-options">{profile.touchLayouts && <p className="profile-mobile-note">Custom touch layout for this game. Edit it from the game menu.</p>}<label className="profile-field"><span>Speed</span><Select aria-label="Game speed" value={effective.speed} onChange={value => onChange({ speed: Number(value) })} options={[.5, 1, 1.5, 2, 3, 4].map(speed => ({ value: speed, label: speed + '×' }))} /></label><label className="profile-field"><span>Screen filter</span><Select aria-label="Game screen filter" value={effective.filter} onChange={filter => onChange({ filter: filter as Settings['filter'] })} options={[{ value: 'pixel', label: 'Crisp pixels' }, { value: 'smooth', label: 'Smooth' }, { value: 'lcd', label: 'LCD lines' }]} /></label><details className="profile-keyboard"><summary>Keyboard controls</summary><p>Choose a key, then press its replacement.</p><KeyBindings controls={effective.controls} onChange={controls => onChange({ controls })} notify={notify} /><button type="button" className="text-button" onClick={() => onChange({ controls: { ...defaults.controls } })}>Use global key mapping</button></details></div>}
  </section>;
}

