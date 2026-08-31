import { useMemo, useState } from 'react';
import { BookOpen, Check, Edit3, Minus, Plus, RefreshCw, Trash2, X } from 'lucide-react';

import { useKumon } from '../../hooks/useKumon';
import {
  canManageKumon,
  canUpdateKumonProgress,
  isChildKumonComplete,
} from '../../kumon/kumonSelectors';
import { formatKumonDate, getRecentKumonDates } from '../../kumon/kumonDates';
import type {
  CreateKumonAssignmentInput,
  KumonAssignment,
  KumonSubject,
} from '../../types/kumon';
import './KumonToday.css';

const SUBJECT_LABELS: Record<KumonSubject, string> = {
  maths: 'Maths',
  english: 'English',
};

function AssignmentEditor({
  assignment,
  childProfileId,
  onCancel,
  onSave,
  saving,
}: {
  assignment: KumonAssignment | null;
  childProfileId: string;
  onCancel: () => void;
  onSave: (input: CreateKumonAssignmentInput) => Promise<void>;
  saving: boolean;
}) {
  const [subject, setSubject] = useState<KumonSubject>(assignment?.subject ?? 'maths');
  const [assignmentLabel, setAssignmentLabel] = useState(assignment?.assignmentLabel ?? '');
  const [totalUnits, setTotalUnits] = useState(String(assignment?.totalUnits ?? 10));
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const units = Number(totalUnits);
    if (!assignmentLabel.trim() || !Number.isSafeInteger(units) || units < 1 || units > 100) {
      setFormError('Enter an assignment label and total units from 1 to 100.');
      return;
    }
    try {
      setFormError(null);
      await onSave({ childProfileId, subject, assignmentLabel, totalUnits: units });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save the assignment.');
    }
  };

  return (
    <form className="kumon-editor" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label>
        <span>Subject</span>
        <select value={subject} disabled={Boolean(assignment)} onChange={event => setSubject(event.target.value as KumonSubject)}>
          <option value="maths">Maths</option>
          <option value="english">English</option>
        </select>
      </label>
      <label className="kumon-editor__label">
        <span>Assignment</span>
        <input value={assignmentLabel} maxLength={120} placeholder="Worksheets 121–130" onChange={event => setAssignmentLabel(event.target.value)} autoFocus />
      </label>
      <label>
        <span>Total units</span>
        <input type="number" min="1" max="100" step="1" value={totalUnits} onChange={event => setTotalUnits(event.target.value)} />
      </label>
      <div className="kumon-editor__actions">
        <button type="button" className="kumon-button kumon-button--secondary" onClick={onCancel}>
          <X size={18} aria-hidden="true" /> Cancel
        </button>
        <button type="submit" className="kumon-button kumon-button--primary" disabled={saving}>
          {saving ? 'Saving…' : assignment ? 'Save changes' : 'Assign'}
        </button>
      </div>
      {formError && <p className="kumon-editor__error" role="alert">{formError}</p>}
    </form>
  );
}

export default function KumonToday() {
  const {
    assignments, todayAssignments, children, selectedProfile, today,
    loading, saving, error, refresh, createAssignment, updateAssignment,
    setProgress, removeAssignment,
  } = useKumon();
  const [editor, setEditor] = useState<{ childId: string; assignment: KumonAssignment | null } | null>(null);
  const canManage = canManageKumon(selectedProfile);
  const visibleChildren = useMemo(() =>
    selectedProfile.kind === 'member' && selectedProfile.memberType === 'child'
      ? children.filter(child => child.id === selectedProfile.id)
      : children,
  [children, selectedProfile]);
  const historyDates = getRecentKumonDates(today);

  const saveEditor = async (input: CreateKumonAssignmentInput) => {
    if (editor?.assignment) {
      await updateAssignment(editor.assignment.id, {
        assignmentLabel: input.assignmentLabel,
        totalUnits: input.totalUnits,
      });
    } else {
      await createAssignment(input);
    }
    setEditor(null);
  };

  return (
    <section className="kumon-section" aria-labelledby="kumon-title">
      <header className="kumon-section__header">
        <div>
          <span className="kumon-section__eyebrow">Daily homework</span>
          <h2 id="kumon-title"><BookOpen size={23} aria-hidden="true" /> Kumon Today</h2>
        </div>
      </header>

      {error && (
        <div className="kumon-message" role="alert">
          <span>{error}</span>
          <button type="button" className="kumon-button kumon-button--secondary" onClick={() => void refresh()}>
            <RefreshCw size={17} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="kumon-empty"><RefreshCw className="routine-spin" size={26} aria-hidden="true" /> Loading Kumon…</div>
      ) : (
        <div className="kumon-children">
          {visibleChildren.map(child => {
            const assignments = todayAssignments.filter(assignment => assignment.childProfileId === child.id);
            return (
              <section className="kumon-child" key={child.id}>
                <header className="kumon-child__header">
                  <div>
                    <h3>{child.displayName}</h3>
                    <span className={isChildKumonComplete(assignments) ? 'kumon-status kumon-status--complete' : 'kumon-status'}>
                      {assignments.length === 0 ? 'Not assigned' : isChildKumonComplete(assignments) ? 'Finished' : 'In progress'}
                    </span>
                  </div>
                  {canManage && assignments.length < 2 && !editor && (
                    <button type="button" className="kumon-button kumon-button--secondary" onClick={() => setEditor({ childId: child.id, assignment: null })}>
                      <Plus size={18} aria-hidden="true" /> Assign homework
                    </button>
                  )}
                </header>

                {editor?.childId === child.id && (
                  <AssignmentEditor key={editor.assignment?.id ?? 'new'} assignment={editor.assignment} childProfileId={child.id} saving={saving} onCancel={() => setEditor(null)} onSave={saveEditor} />
                )}

                {assignments.length === 0 && editor?.childId !== child.id ? (
                  <p className="kumon-empty-state">No Kumon assignment recorded today</p>
                ) : (
                  <div className="kumon-assignments">
                    {assignments.map(assignment => {
                      const mayProgress = canUpdateKumonProgress(selectedProfile, assignment);
                      const complete = assignment.completedUnits === assignment.totalUnits;
                      return (
                        <article className={`kumon-assignment kumon-assignment--${assignment.subject} ${complete ? 'kumon-assignment--complete' : ''}`} key={assignment.id}>
                          <div className="kumon-assignment__details">
                            <strong>{SUBJECT_LABELS[assignment.subject]}</strong>
                            <span>{assignment.assignmentLabel}</span>
                            <small>{assignment.completedUnits} / {assignment.totalUnits}</small>
                          </div>
                          {mayProgress && (
                            <div className="kumon-progress-actions" aria-label={`${SUBJECT_LABELS[assignment.subject]} progress controls`}>
                              <button type="button" className="kumon-button kumon-button--square" disabled={saving || assignment.completedUnits === 0} onClick={() => void setProgress(assignment.id, assignment.completedUnits - 1).catch(() => undefined)} aria-label={`Decrease ${SUBJECT_LABELS[assignment.subject]} progress`}><Minus size={19} aria-hidden="true" /></button>
                              <button type="button" className="kumon-button kumon-button--square" disabled={saving || complete} onClick={() => void setProgress(assignment.id, assignment.completedUnits + 1).catch(() => undefined)} aria-label={`Increase ${SUBJECT_LABELS[assignment.subject]} progress`}><Plus size={19} aria-hidden="true" /></button>
                              <button type="button" className="kumon-button kumon-button--primary" disabled={saving || complete} onClick={() => void setProgress(assignment.id, assignment.totalUnits).catch(() => undefined)}><Check size={18} aria-hidden="true" /> {complete ? 'Completed' : 'Complete'}</button>
                            </div>
                          )}
                          {canManage && assignment.completedUnits === 0 && !editor && (
                            <div className="kumon-definition-actions">
                              <button type="button" onClick={() => setEditor({ childId: child.id, assignment })} aria-label={`Edit ${SUBJECT_LABELS[assignment.subject]} assignment`}><Edit3 size={17} aria-hidden="true" /></button>
                              <button type="button" disabled={saving} onClick={() => void removeAssignment(assignment.id).catch(() => undefined)} aria-label={`Delete ${SUBJECT_LABELS[assignment.subject]} assignment`}><Trash2 size={17} aria-hidden="true" /></button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <details className="kumon-history">
        <summary>Recent 7 days</summary>
        <div className="kumon-history__rows">
          {historyDates.map(date => {
            const records = assignments.filter(assignment => assignment.localDate === date);
            if (records.length === 0) return null;
            return (
              <section key={date} className="kumon-history__day">
                <strong>{formatKumonDate(date)}</strong>
                {records.map(record => (
                  <span key={record.id}>{SUBJECT_LABELS[record.subject]} · {record.completedUnits} / {record.totalUnits} · {record.completedAt ? 'Completed' : 'Incomplete'}</span>
                ))}
              </section>
            );
          })}
          {assignments.length === 0 && <p>No recent Kumon history.</p>}
        </div>
      </details>
    </section>
  );
}
