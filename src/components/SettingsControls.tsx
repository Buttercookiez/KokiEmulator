import type { ReactNode } from 'react';

export function ThemeSwitch({ theme, onChange }: { theme: 'light' | 'dark' | 'system'; onChange: (theme: 'light' | 'dark' | 'system') => void }) {
  return <div className="theme-switch" role="group" aria-label="Appearance">{(['light', 'dark', 'system'] as const).map(value => <button key={value} type="button" className={theme === value ? 'active' : ''} aria-pressed={theme === value} onClick={() => onChange(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>;
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="switch"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} aria-label={label} /><span /></label>; }
export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) { return <div className="setting-row"><div className="setting-row-text"><strong>{title}</strong>{description && <p>{description}</p>}</div><div className="setting-control">{children}</div></div>; }
