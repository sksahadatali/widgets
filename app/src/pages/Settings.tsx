import {
  getTravelSettings,
} from '../services/travelSettingsService';

import {
  getPrayerSettings,
} from '../services/prayerSettingsService';

import {
  Check,
  Moon,
  Sun,
  Car,
  MapPinned,
} from 'lucide-react';

import {
  AMBIENCES,
  type AmbienceId,
} from '../theme/ambiences';

import {
  useTheme,
} from '../theme/useTheme';
import {
  DISPLAY_PROFILE_OPTIONS,
  getDisplayProfileName,
} from '../display/displayProfiles';
import {
  useDisplayProfile,
} from '../display/useDisplayProfile';

import './Settings.css';

const previewColours: Record<
  AmbienceId,
  {
    background: string;
    surface: string;
    accent: string;
    text: string;
  }
> = {
  olive: {
    background: '#f5efe6',
    surface: '#ffffff',
    accent: '#5e7d61',
    text: '#2d2e33',
  },

  ivory: {
    background: '#faf8f2',
    surface: '#ffffff',
    accent: '#267057',
    text: '#252a28',
  },

  beige: {
    background: '#eee3d3',
    surface: '#faf5ec',
    accent: '#b76343',
    text: '#332f2c',
  },

  midnight: {
    background: '#131c31',
    surface: '#1a2740',
    accent: '#3b82f6',
    text: '#f8fafc',
  },

  executive: {
    background: '#090e18',
    surface: '#111827',
    accent: '#c7a542',
    text: '#f8fafc',
  },

  arctic: {
    background: '#f1f6fb',
    surface: '#ffffff',
    accent: '#2563eb',
    text: '#172033',
  },

  oled: {
    background: '#000000',
    surface: '#080808',
    accent: '#22d3ee',
    text: '#f8fafc',
  },
};

function Settings() {
  const {
    ambienceId,
    setAmbience,
  } = useTheme();
  const {
    preference,
    effectiveProfile,
    viewport,
    setPreference,
  } = useDisplayProfile();
  const travelSettings =
    getTravelSettings();
  const prayerSettings =
    getPrayerSettings();

  return (
    <main className="settings-page">
      <header className="settings-page__header">
        <span className="settings-page__eyebrow">
          Personalisation
        </span>

        <h1>Settings</h1>

        <p>
          Choose how eY OS looks and feels
          across your devices.
        </p>
      </header>

      <section
        className="settings-section"
        aria-labelledby="display-heading"
      >
        <div className="settings-section__header">
          <div>
            <h2 id="display-heading">
              Display Profile
            </h2>

            <p>
              Adapt the shared eY OS interface to
              this display. The preference is saved
              on this device.
            </p>
          </div>
        </div>

        <div className="display-profile-grid">
          {DISPLAY_PROFILE_OPTIONS.map(
            profile => {
              const isSelected =
                profile.id === preference;

              return (
                <button
                  key={profile.id}
                  type="button"
                  className={`display-profile-card ${
                    isSelected
                      ? 'display-profile-card--selected'
                      : ''
                  }`}
                  onClick={() =>
                    setPreference(profile.id)
                  }
                  aria-pressed={isSelected}
                >
                  <span className="display-profile-card__title-row">
                    <strong>{profile.name}</strong>

                    {isSelected && (
                      <span
                        className="display-profile-card__selected-icon"
                        aria-label="Selected"
                      >
                        <Check
                          size={17}
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      </span>
                    )}
                  </span>

                  <span className="display-profile-card__description">
                    {profile.description}
                  </span>
                </button>
              );
            }
          )}
        </div>

        <dl
          className="display-profile-status"
          aria-live="polite"
        >
          <div>
            <dt>Current viewport</dt>
            <dd>
              {viewport.width} × {viewport.height}
              {' '}CSS px
            </dd>
          </div>

          <div>
            <dt>Selected preference</dt>
            <dd>
              {getDisplayProfileName(preference)}
            </dd>
          </div>

          <div>
            <dt>Effective profile</dt>
            <dd>
              {getDisplayProfileName(
                effectiveProfile
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="settings-section"
        aria-labelledby="ambience-heading"
      >
        <div className="settings-section__header">
          <div>
            <h2 id="ambience-heading">
              Ambience
            </h2>

            <p>
              Select a visual environment for
              eY OS. Your choice is saved
              automatically.
            </p>
          </div>
        </div>

        <div className="ambience-grid">
          {AMBIENCES.map(
            ambience => {
              const isSelected =
                ambience.id === ambienceId;

              const preview =
                previewColours[ambience.id];

              return (
                <button
                  key={ambience.id}
                  type="button"
                  className={`ambience-card ${
                    isSelected
                      ? 'ambience-card--selected'
                      : ''
                  }`}
                  onClick={() =>
                    setAmbience(
                      ambience.id
                    )
                  }
                  aria-pressed={isSelected}
                >
                  <div
                    className="ambience-card__preview"
                    style={{
                      background:
                        preview.background,
                    }}
                    aria-hidden="true"
                  >
                    <div
                      className="ambience-card__preview-sidebar"
                      style={{
                        background:
                          preview.surface,
                      }}
                    />

                    <div className="ambience-card__preview-content">
                      <div
                        className="ambience-card__preview-header"
                        style={{
                          background:
                            preview.surface,
                        }}
                      />

                      <div className="ambience-card__preview-row">
                        <div
                          className="ambience-card__preview-panel ambience-card__preview-panel--large"
                          style={{
                            background:
                              preview.surface,
                          }}
                        />

                        <div
                          className="ambience-card__preview-panel"
                          style={{
                            background:
                              preview.surface,
                          }}
                        />
                      </div>

                      <div className="ambience-card__preview-status">
                        <span
                          style={{
                            background:
                              preview.accent,
                          }}
                        />

                        <span
                          style={{
                            background:
                              preview.accent,
                          }}
                        />

                        <span
                          style={{
                            background:
                              preview.accent,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="ambience-card__content">
                    <div className="ambience-card__title-row">
                      <div>
                        <h3>
                          {ambience.name}
                        </h3>

                        <span className="ambience-card__mode">
                          {ambience.mode ===
                          'light' ? (
                            <Sun
                              size={14}
                              aria-hidden="true"
                            />
                          ) : (
                            <Moon
                              size={14}
                              aria-hidden="true"
                            />
                          )}

                          {ambience.mode ===
                          'light'
                            ? 'Light'
                            : 'Dark'}
                        </span>
                      </div>

                      {isSelected && (
                        <span
                          className="ambience-card__selected-icon"
                          aria-label="Selected"
                        >
                          <Check
                            size={17}
                            strokeWidth={2.5}
                            aria-hidden="true"
                          />
                        </span>
                      )}
                    </div>

                    <p>
                      {ambience.description}
                    </p>

                    <div
                      className="ambience-card__palette"
                      aria-hidden="true"
                    >
                      <span
                        style={{
                          background:
                            preview.background,
                        }}
                      />

                      <span
                        style={{
                          background:
                            preview.surface,
                        }}
                      />

                      <span
                        style={{
                          background:
                            preview.accent,
                        }}
                      />

                      <span
                        style={{
                          background:
                            preview.text,
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="system-heading"
      >
        <div className="settings-section__header">
          <div>
            <h2 id="system-heading">
              System
            </h2>

            <p>
              Configure core eY OS modules.
            </p>
          </div>
        </div>
        <div className="system-grid">

        <article className="system-card">

          <div className="system-card__header">
            <div className="system-card__icon"><Car size={24} strokeWidth={1.8} /></div>

            <div>
              <h3>Travel</h3>

              <p>
                Configure Travel Intelligence.
              </p>
            </div>
          </div>

          <div className="system-card__content">

            <div className="system-item">
              <span>Home Address</span>

              <strong>
                {travelSettings.homeAddress}
              </strong>
            </div>

            <div className="system-item">
              <span>Provider</span>

              <strong>
                Google Maps
              </strong>
            </div>

            <div className="system-item">
              <span>Leave Buffer</span>

              <strong>
                {travelSettings.leaveBufferMinutes} minutes
              </strong>
            </div>

          </div>

          </article>

          <article className="system-card">

            <div className="system-card__header">
              <div className="system-card__icon">
                <MapPinned size={24} strokeWidth={1.8} />
              </div>

              <div>
                <h3>Prayer</h3>

                <p>
                  Configure prayer calculation.
                </p>
              </div>
            </div>

            <div className="system-card__content">

              <div className="system-item">
                <span>Provider</span>

                <strong>
                  {prayerSettings.provider}
                </strong>
              </div>

              <div className="system-item">
                <span>Calculation</span>

                <strong>
                  {prayerSettings.calculationMethodName}
                </strong>
              </div>

              <div className="system-item">
                <span>Madhab / Asr</span>

                <strong>
                  Later Asr ({prayerSettings.schoolName})
                </strong>
              </div>

              <div className="system-item">
                <span>Refresh</span>

                <strong>
                  {prayerSettings.refreshMinutes} minutes
                </strong>
              </div>

            </div>

            </article>

          </div>
      </section>      
    </main>
  );
}

export default Settings;
