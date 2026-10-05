import { useState, type FormEvent } from 'react';
import { getAppPageLabel } from '../navigation/appRoutes';
import { useAmbientSettings } from './AmbientSettingsContext';
import { AMBIENT_PAGE_SEQUENCE } from './ambientRotation';
import {
  DEFAULT_AMBIENT_SETTINGS,
  isValidInactivitySeconds,
  isValidPageDurationSeconds,
  type AmbientPage,
  type AmbientSettings,
} from './ambientSettings';

function formValues(settings: AmbientSettings) {
  return {
    enabled: settings.enabled,
    inactivityMinutes: String(settings.inactivitySeconds / 60),
    durations: Object.fromEntries(AMBIENT_PAGE_SEQUENCE.map(page =>
      [page, String(settings.pageDurationSeconds[page])]
    )) as Record<AmbientPage, string>,
  };
}

export function AmbientSettingsSection() {
  const { settings, saveSettings, storageError } = useAmbientSettings();
  const [draft, setDraft] = useState(() => formValues(settings));
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const inactivitySeconds = Number(draft.inactivityMinutes) * 60;
    if (!isValidInactivitySeconds(inactivitySeconds)) {
      nextErrors.inactivity = 'Enter a whole number from 1 to 60 minutes.';
    }
    const durations = { ...settings.pageDurationSeconds };
    for (const page of AMBIENT_PAGE_SEQUENCE) {
      const seconds = Number(draft.durations[page]);
      if (!isValidPageDurationSeconds(seconds)) {
        nextErrors[page] = 'Enter a whole number from 10 to 600 seconds.';
      } else {
        durations[page] = seconds;
      }
    }
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    saveSettings({ version: 1, enabled: draft.enabled, inactivitySeconds, pageDurationSeconds: durations });
    setMessage('Settings applied. Enabled rotation starts after a new full inactivity period.');
  }

  return (
    <section className="settings-section" aria-labelledby="ambient-heading">
      <div className="settings-section__header">
        <div>
          <h2 id="ambient-heading">Ambient Rotation</h2>
          <p>Automatically display household pages when idle on Desktop or Elo Touch. Compact does not rotate. Saved on this device.</p>
        </div>
      </div>
      <form className="ambient-settings" onSubmit={save} noValidate>
        <label className="ambient-settings__enabled">
          <input type="checkbox" checked={draft.enabled}
            onChange={event => { setDraft({ ...draft, enabled: event.target.checked }); setMessage(''); }} />
          Enable Ambient Rotation
        </label>
        <div className="ambient-settings__fields">
          <label htmlFor="ambient-inactivity">Start after inactivity (minutes)
            <input id="ambient-inactivity" type="number" min="1" max="60" step="1"
              value={draft.inactivityMinutes} aria-invalid={Boolean(errors.inactivity)}
              aria-describedby="ambient-inactivity-help"
              onChange={event => { setDraft({ ...draft, inactivityMinutes: event.target.value }); setMessage(''); }} />
            <span id="ambient-inactivity-help">{errors.inactivity ?? '1–60 minutes'}</span>
          </label>
        </div>
        <fieldset>
          <legend>Page display durations</legend>
          <p className="ambient-settings__sequence">Home → Calendar → Routines → Rewards → Lists → Meals → Home</p>
          <div className="ambient-settings__fields">
            {AMBIENT_PAGE_SEQUENCE.map(page => (
              <label key={page} htmlFor={`ambient-duration-${page}`}>
                {getAppPageLabel(page)} (seconds)
                <input id={`ambient-duration-${page}`} type="number" min="10" max="600" step="1"
                  value={draft.durations[page]} aria-invalid={Boolean(errors[page])}
                  aria-describedby={`ambient-duration-${page}-help`}
                  onChange={event => {
                    setDraft({ ...draft, durations: { ...draft.durations, [page]: event.target.value } });
                    setMessage('');
                  }} />
                <span id={`ambient-duration-${page}-help`}>{errors[page] ?? '10–600 seconds'}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="ambient-settings__actions">
          <button type="submit">Save settings</button>
          <button type="button" onClick={() => {
            setDraft(formValues(DEFAULT_AMBIENT_SETTINGS));
            setErrors({});
            setMessage('Default values restored in the form. Save settings to apply.');
          }}>Restore defaults</button>
        </div>
        <p role="status">{storageError
          ? 'Settings applied for this session, but could not be saved on this device.' : message}</p>
      </form>
    </section>
  );
}
