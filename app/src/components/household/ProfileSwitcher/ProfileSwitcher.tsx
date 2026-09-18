import { Users } from 'lucide-react';
import { getProfileInitials, type HouseholdProfile } from '../../../household/householdProfiles';
import { useHouseholdProfile } from '../../../household/useHouseholdProfile';
import './ProfileSwitcher.css';

type ProfileOptionsProps = {
  profiles: HouseholdProfile[];
  selectedProfileId: string;
  selectProfile: (profileId: string) => void;
};

export function ProfileOptions({ profiles, selectedProfileId, selectProfile }: ProfileOptionsProps) {
  return (
    <nav className="profile-strip" aria-label="Household profiles">
      {profiles.map(profile => {
        const selected = profile.id === selectedProfileId;
        const name = profile.kind === 'family' ? 'Family' : profile.displayName;
        return (
          <button
            key={profile.id}
            type="button"
            className={`profile-strip__option${selected ? ' profile-strip__option--selected' : ''}`}
            aria-label={name}
            aria-pressed={selected}
            title={name}
            onClick={() => selectProfile(profile.id)}
          >
            <span className="profile-strip__avatar" aria-hidden="true">
              {profile.kind === 'family' ? <Users size={22} /> : getProfileInitials(profile.displayName)}
            </span>
            <span className="profile-strip__name">{name}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function ProfileSwitcher() {
  const { profiles, selectedProfileId, selectProfile } = useHouseholdProfile();
  return <ProfileOptions profiles={profiles} selectedProfileId={selectedProfileId} selectProfile={selectProfile} />;
}
