import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { getProfileInitials } from '../../../household/householdProfiles';
import { useHouseholdProfile } from '../../../household/useHouseholdProfile';
import type { CalendarAssignmentTarget, ResolvedCalendarProfileAssignment } from '../../../calendar/calendarModel';
import { invalidateCachedCalendarEvent, updateCachedCalendarAssignment } from '../../../calendar/calendarQueryStore';
import { clearCalendarProfileAssignment, setCalendarProfileAssignment } from '../../../services/calendarService';

type Props = {
  eventKey: string;
  assignment: ResolvedCalendarProfileAssignment;
  onChanged: () => Promise<void>;
  presentation?: 'pill' | 'inline';
};

function targetLabel(target: CalendarAssignmentTarget, names: ReadonlyMap<string, string>): string {
  if (target.kind === 'family') return 'Family';
  if (target.kind === 'unassigned') return 'Unassigned';
  return target.profileIds.map(id => names.get(id) ?? 'Removed profile').join(', ');
}

export function CalendarPeoplePicker({ eventKey, assignment, onChanged, presentation = 'pill' }: Props) {
  const { profiles } = useHouseholdProfile();
  const members = profiles.filter(profile => profile.kind === 'member');
  const names = useMemo(() => new Map(profiles.map(profile => [profile.id, profile.displayName])), [profiles]);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<CalendarAssignmentTarget>(assignment.target);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentLabel = targetLabel(assignment.target, names);
  const inlineLabel = assignment.target.kind === 'unassigned' ? '—' : assignmentLabel;
  const chooseMember = (profileId: string) => {
    const selected = target.kind === 'members' ? target.profileIds : [];
    const profileIds = selected.includes(profileId) ? selected.filter(id => id !== profileId) : [...selected, profileId];
    setTarget(profileIds.length ? { kind: 'members', profileIds } : { kind: 'unassigned' });
  };
  const commit = async (clear = false) => {
    setSaving(true); setError(null);
    try {
      if (clear) {
        await clearCalendarProfileAssignment(eventKey);
        invalidateCachedCalendarEvent(eventKey);
      } else {
        await setCalendarProfileAssignment(eventKey, target);
        updateCachedCalendarAssignment(eventKey, {
          target,
          basis: 'explicit',
        });
      }
      await onChanged(); setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Assignment could not be saved.');
    } finally { setSaving(false); }
  };
  return <div className={presentation === 'inline' ? 'calendar-people calendar-people--inline' : 'calendar-people'}>
    <button type="button" className={presentation === 'inline' ? 'calendar-people__inline-trigger' : 'calendar-people__trigger'} aria-expanded={open} aria-label={`People: ${assignmentLabel}`} title={presentation === 'inline' && assignment.target.kind === 'unassigned' ? undefined : assignmentLabel} onClick={() => { setTarget(assignment.target); setError(null); setOpen(value => !value); }}>
      {presentation === 'pill' && <Users size={14} aria-hidden="true" />}<span>{inlineLabel}</span>
    </button>
    {open && <div className="calendar-people__popover" role="dialog" aria-label="Assign people">
      <div className="calendar-people__title">People</div>
      <button type="button" className={target.kind === 'family' ? 'is-selected' : ''} onClick={() => setTarget({ kind: 'family' })}><span className="calendar-people__avatar"><Users size={16} aria-hidden="true" /></span>Family</button>
      {members.map(profile => {
        const checked = target.kind === 'members' && target.profileIds.includes(profile.id);
        return <label key={profile.id} className={checked ? 'is-selected' : ''}><input type="checkbox" checked={checked} onChange={() => chooseMember(profile.id)} /><span className="calendar-people__avatar">{getProfileInitials(profile.displayName)}</span>{profile.displayName}</label>;
      })}
      <button type="button" className={target.kind === 'unassigned' ? 'is-selected' : ''} onClick={() => setTarget({ kind: 'unassigned' })}><span className="calendar-people__avatar">—</span>Unassigned</button>
      <div className="calendar-people__basis">{assignment.basis === 'source-default' ? 'Source default' : assignment.basis === 'explicit' ? 'Explicit assignment' : 'No source default'}</div>
      {error && <div className="calendar-people__error" role="alert">{error}</div>}
      <div className="calendar-people__actions">
        {assignment.basis === 'explicit' && <button type="button" disabled={saving} onClick={() => void commit(true)}>Use default</button>}
        <button type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" disabled={saving} onClick={() => void commit()}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>}
  </div>;
}
